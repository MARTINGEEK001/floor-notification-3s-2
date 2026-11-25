// Floor Notify backend: one Netlify Function that stores assignments in
// Netlify Blobs and sends Web Push notifications to the station iPads.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { createHash } from "node:crypto";

export const config = { path: "/api/*" };

const DEFAULT_ROSTER = {
  stations: [
    { id: "st1", name: "Cleaner station 1", cleaner: "" },
    { id: "st2", name: "Cleaner station 2", cleaner: "" },
    { id: "st3", name: "Cleaner station 3", cleaner: "" },
    { id: "st4", name: "Cleaner station 4", cleaner: "" }
  ],
  products: ["MacBook Air", "MacBook Pro", "iMac", "Mac mini", "iPad", "iPad Pro", "iPhone"]
};
const KEEP_SENDS = 80;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
const fail = (status, message) => json({ error: message }, status);
const hash = s => createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
const hashSecret = (salt, v) => createHash("sha256").update(`${salt}:${String(v)}`).digest("hex");
const okSecret = v => typeof v === "string" && v.trim().length >= 4 && v.length <= 40;
const cleanId = s => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);

function trimSend(s, sid) {
  return {
    id: s.id, kind: s.kind, createdAt: s.createdAt, dayKey: s.dayKey, dayLabel: s.dayLabel,
    weekLabel: s.weekLabel, note: s.note || "", look: s.look || {},
    per: { [sid]: s.per[sid] }, stations: { [sid]: (s.stations || {})[sid] || {} }
  };
}

export function makeHandler(openStore, env, push = webpush) {
  return async req => {
    const store = openStore();
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = req.method;

    let body = {};
    if (method === "POST" || method === "PUT") {
      try { body = (await req.json()) || {}; } catch { body = {}; }
    }

    // Sign-in codes: Netlify environment variables if set, otherwise the ones
    // created on the console's first-run setup screen (stored hashed).
    const envMode = !!(env.ADMIN_PIN && env.FLOOR_CODE);
    const auth = envMode ? null : await store.get("auth", { type: "json" });
    const needsSetup = !envMode && !auth;
    const hdrPin = req.headers.get("x-admin-pin");
    const hdrCode = req.headers.get("x-floor-code");
    const matches = (given, plain, hashed) => {
      if (!given) return false;
      if (envMode) return given === plain;
      return !!auth && hashSecret(auth.salt, given) === hashed;
    };
    const isAdmin = matches(hdrPin, env.ADMIN_PIN, auth && auth.admin);
    const isFloor = isAdmin || matches(hdrCode, env.FLOOR_CODE, auth && auth.floor);
    const getJSON = async (key, fallback) => (await store.get(key, { type: "json" })) ?? fallback;
    const listKeys = async prefix => (await store.list({ prefix })).blobs.map(b => b.key);

    let vapidCache = null;
    async function vapid() {
      if (vapidCache) return vapidCache;
      let v = await store.get("vapid", { type: "json" });
      if (!v) {
        const k = push.generateVAPIDKeys();
        v = { publicKey: k.publicKey, privateKey: k.privateKey };
        await store.setJSON("vapid", v);
      }
      const subject = env.CONTACT_EMAIL
        ? `mailto:${env.CONTACT_EMAIL}`
        : url.origin.startsWith("https://") ? url.origin : "mailto:floor-notify@localhost.invalid";
      push.setVapidDetails(subject, v.publicKey, v.privateKey);
      return (vapidCache = v);
    }
    async function pushTo(sid, payload) {
      await vapid();
      const keys = await listKeys(`sub/${sid}/`);
      let ok = 0, failed = 0;
      await Promise.all(keys.map(async key => {
        const rec = await store.get(key, { type: "json" });
        if (!rec || !rec.sub) return;
        try {
          await push.sendNotification(rec.sub, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
          ok++;
        } catch (e) {
          failed++;
          if (e && (e.statusCode === 404 || e.statusCode === 410)) await store.delete(key);
        }
      }));
      return { devices: keys.length, ok, failed };
    }

    try {
      // ---- open routes ----
      if (route === "vapid" && method === "GET") return json({ publicKey: (await vapid()).publicKey });
      if (route === "check" && method === "POST") return json({ admin: isAdmin, floor: isFloor, needsSetup });

      if (route === "setup" && method === "POST") {
        if (!needsSetup) return fail(409, "Setup is already done. Sign in with your PIN.");
        const pin = String(body.pin || ""), code = String(body.code || "");
        if (!okSecret(pin) || !okSecret(code)) return fail(400, "The PIN and floor code each need at least 4 characters.");
        if (pin === code) return fail(400, "Use a different floor code from your PIN, so cleaners can’t open the console.");
        const salt = createHash("sha256").update(String(Math.random()) + Date.now()).digest("hex").slice(0, 16);
        await store.setJSON("auth", { salt, admin: hashSecret(salt, pin), floor: hashSecret(salt, code), at: Date.now() });
        return json({ ok: true });
      }

      if (needsSetup) return fail(401, "Your supervisor needs to finish setting up Floor Notify first.");

      // ---- station routes (floor code or supervisor PIN) ----
      if (!isFloor) return fail(401, "That code isn’t right.");

      if (route === "state" && method === "GET") {
        const sid = cleanId(url.searchParams.get("sid"));
        const [roster, look, sends] = await Promise.all([getJSON("roster", null), getJSON("look", {}), getJSON("sends", [])]);
        let mine = [], acked = [];
        if (sid) {
          const since = Date.now() - 8 * 864e5;
          mine = sends.filter(s => s.per && s.per[sid] && s.createdAt > since).map(s => trimSend(s, sid));
          acked = (await listKeys(`ack/${sid}/`)).map(k => k.split("/")[2]);
        }
        return json({ roster: roster || DEFAULT_ROSTER, look, sends: mine, acked });
      }

      if (route === "subscribe" && method === "POST") {
        const sid = cleanId(body.sid);
        const sub = body.sub;
        if (!sid || !sub || !sub.endpoint || !sub.keys) return fail(400, "Missing station or subscription.");
        if (!/^https:\/\//.test(sub.endpoint)) return fail(400, "Bad subscription.");
        const h = hash(sub.endpoint);
        for (const k of await listKeys("sub/")) if (k.endsWith(`/${h}`) && k !== `sub/${sid}/${h}`) await store.delete(k);
        await store.setJSON(`sub/${sid}/${h}`, {
          sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") } },
          at: Date.now(),
          device: String(body.device || "").slice(0, 80)
        });
        return json({ ok: true });
      }

      if (route === "unsubscribe" && method === "POST") {
        const h = hash(body.endpoint || "");
        for (const k of await listKeys("sub/")) if (k.endsWith(`/${h}`)) await store.delete(k);
        return json({ ok: true });
      }

      if (route === "ack" && method === "POST") {
        const sid = cleanId(body.sid), id = cleanId(body.sendId);
        if (!sid || !id) return fail(400, "Missing message.");
        await store.set(`ack/${sid}/${id}/${Date.now()}`, "1");
        return json({ ok: true });
      }

      if (route === "test" && method === "POST") {
        const sid = cleanId(body.sid);
        if (!sid) return fail(400, "Missing station.");
        const r = await pushTo(sid, { title: "Test notification", body: "Notifications are working on this iPad.", id: "test", tag: "test" });
        return json(r);
      }

      // ---- supervisor routes ----
      if (!isAdmin) return fail(401, "Supervisor PIN needed.");

      if (route === "admin" && method === "GET") {
        const sends = await getJSON("sends", []);
        const acks = (await listKeys("ack/"))
          .map(k => k.split("/"))
          .filter(p => p.length === 4)
          .map(p => ({ sid: p[1], sendId: p[2], at: Number(p[3]) }));
        const devices = [];
        for (const k of await listKeys("sub/")) {
          const rec = await store.get(k, { type: "json" });
          devices.push({ key: k, sid: k.split("/")[1], at: rec?.at || 0, device: rec?.device || "" });
        }
        const out = { sends, acks, devices, authMode: envMode ? "env" : "app" };
        if (url.searchParams.get("part") !== "status") {
          out.roster = (await getJSON("roster", null)) || DEFAULT_ROSTER;
          out.look = await getJSON("look", {});
          out.draft = await getJSON("draft", null);
        }
        return json(out);
      }

      if (route === "credentials" && method === "PUT") {
        if (envMode) return fail(400, "These codes are set in Netlify’s environment variables, so change them there.");
        const next = { ...auth };
        if (body.pin) {
          if (!okSecret(body.pin)) return fail(400, "The PIN needs at least 4 characters.");
          next.admin = hashSecret(auth.salt, body.pin);
        }
        if (body.code) {
          if (!okSecret(body.code)) return fail(400, "The floor code needs at least 4 characters.");
          next.floor = hashSecret(auth.salt, body.code);
        }
        if (next.admin === next.floor) return fail(400, "Use a different floor code from your PIN.");
        await store.setJSON("auth", next);
        return json({ ok: true });
      }

      if (["roster", "look", "draft"].includes(route) && method === "PUT") {
        if (JSON.stringify(body).length > 200000) return fail(413, "That’s too large to save.");
        await store.setJSON(route, body);
        return json({ ok: true });
      }

      if (route === "send" && method === "POST") {
        const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, 2) : [];
        if (!jobs.length) return fail(400, "Nothing to send.");
        const sends = await getJSON("sends", []);
        const now = Date.now();
        const created = jobs.map((j, i) => ({
          ...j,
          id: "s" + (now + i).toString(36) + Math.random().toString(36).slice(2, 6),
          createdAt: now + i
        }));
        const all = [...created.slice().reverse(), ...sends];
        const kept = all.slice(0, KEEP_SENDS);
        await store.setJSON("sends", kept);

        // drop read receipts for messages that aged out
        const keptIds = new Set(kept.map(s => s.id));
        for (const k of await listKeys("ack/")) if (!keptIds.has(k.split("/")[2])) await store.delete(k);

        const report = {};
        for (const s of created) {
          for (const sid of Object.keys(s.per || {})) {
            const p = s.per[sid] || {};
            const r = await pushTo(cleanId(sid), { title: p.title || "New message", body: p.body || "", id: s.id, tag: s.id });
            const acc = report[sid] || (report[sid] = { devices: 0, ok: 0, failed: 0 });
            acc.devices = r.devices; acc.ok += r.ok; acc.failed += r.failed;
          }
        }
        return json({ ok: true, report });
      }

      if (route === "send" && method === "DELETE") {
        const id = cleanId(url.searchParams.get("id"));
        const sends = await getJSON("sends", []);
        await store.setJSON("sends", sends.filter(s => s.id !== id));
        return json({ ok: true });
      }

      if (route === "device" && method === "DELETE") {
        const key = String(url.searchParams.get("key") || "");
        if (!/^sub\/[A-Za-z0-9_-]+\/[0-9a-f]{24}$/.test(key)) return fail(400, "Unknown device.");
        await store.delete(key);
        return json({ ok: true });
      }

      return fail(404, "Not found.");
    } catch (e) {
      return fail(500, "Something went wrong on the server: " + (e && e.message ? e.message : "unknown error"));
    }
  };
}

export default makeHandler(() => getStore({ name: "floor", consistency: "strong" }), process.env);
