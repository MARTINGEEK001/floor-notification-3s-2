/* Floor Notify: helpers shared by the console (index.html) and the station app (station.html). */
(function () {
  "use strict";
  const APP_NAME = "Floor Notify";
  const ICON = "/icon-192.png";
  const PILLARS = {
    sort:  { label: "Sort",         hint: "Clear out anything that doesn’t belong at the station." },
    set:   { label: "Set in order", hint: "Every tool and supply goes back to its marked home." },
    shine: { label: "Shine",        hint: "Clean and inspect the area so problems stand out." }
  };
  const DEFAULT_LOOK = {
    title3S: "Your 3S assignment this week",
    body3S: "{s}: {area}. Tap to see the details.",
    titleDev: "Today’s devices, {day}",
    bodyDev: "{count} to clean: {devices}",
    accent: "#13675F",
    wallpaper: "#1C3A3A"
  };

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const safeColor = c => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? c : null);
  const pad = n => String(n).padStart(2, "0");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => keyOf(new Date());
  const mondayOf = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const parseKey = k => { const [y, m, d] = String(k || "").split("-").map(Number); return y ? new Date(y, m - 1, d) : new Date(); };
  const dayLabel = d => d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const shortDay = d => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const weekLabel = k => "week of " + parseKey(k).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const clockText = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");
  const ago = t => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const toast = msg => {
    let t = $("#toast");
    if (!t) { t = el("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }); document.body.append(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200);
  };
  const fill = (tpl, ctx) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? ctx[k] : m));
  const look = l => Object.assign({}, DEFAULT_LOOK, l || {});

  async function api(path, { method = "GET", body, admin, floor } = {}) {
    const headers = { "content-type": "application/json" };
    if (admin) headers["x-admin-pin"] = admin;
    if (floor) headers["x-floor-code"] = floor;
    let res;
    try {
      res = await fetch("/api/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    } catch {
      const e = new Error("Can’t reach the server. Check the Wi-Fi."); e.status = 0; throw e;
    }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error((data && data.error) || `Server error ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  // ---- message text ----
  function ctxFor(send, sid, rosterStations) {
    const p = (send.per || {})[sid] || {};
    const st = (send.stations || {})[sid] || (rosterStations || []).find(s => s.id === sid) || {};
    const devs = Array.isArray(p.devices) ? p.devices : [];
    const count = devs.reduce((a, d) => a + (Number(d.q) || 0), 0);
    return {
      name: st.cleaner || st.name || "there",
      station: st.name || "",
      s: (PILLARS[p.s] || {}).label || "",
      area: p.area || "",
      count: String(count),
      devices: devs.map(d => `${d.q} ${d.p}`).join(", "),
      day: send.dayLabel || "",
      week: send.weekLabel || ""
    };
  }
  function messageText(send, sid, lk, rosterStations) {
    const c = ctxFor(send, sid, rosterStations);
    return send.kind === "3s"
      ? { title: fill(lk.title3S, c), body: fill(lk.body3S, c) }
      : { title: fill(lk.titleDev, c), body: fill(lk.bodyDev, c) };
  }

  // ---- in-app banner (looks like an iPad notification) ----
  function bannerEl(send, sid, opts = {}) {
    const lk = look(send.look);
    const p = (send.per || {})[sid] || {};
    const t = p.title ? { title: p.title, body: p.body || "" } : messageText(send, sid, lk);
    return el("button", { class: "nt" + (opts.animate ? " in" : ""), type: "button", onclick: opts.onclick, "aria-label": t.title },
      el("img", { src: ICON, alt: "" }),
      el("span", { class: "tx" },
        el("span", { class: "hd" }, el("span", { class: "ti", text: t.title }), el("span", { class: "tm", text: opts.when || ago(send.createdAt) })),
        el("span", { class: "bd", text: t.body })));
  }

  // ---- opened message ----
  function cardEl(send, sid, opts = {}) {
    const lk = look(send.look);
    const p = (send.per || {})[sid] || {};
    const title = p.title || messageText(send, sid, lk).title;
    const acc = safeColor(lk.accent) || "#13675F";
    const body = el("div", { class: "cb" });
    if (send.kind === "3s") {
      const pl = PILLARS[p.s] || PILLARS.shine;
      body.append(el("div", { class: "s3" },
        el("div", { class: "p", text: pl.label }),
        p.area ? el("div", { class: "ar", text: p.area }) : null,
        el("div", { class: "hint", text: pl.hint }),
        p.tasks ? el("div", { class: "tk", text: p.tasks }) : null));
      if (send.weekLabel) body.append(el("div", { class: "wk", text: `For the ${send.weekLabel}` }));
    } else {
      const devs = Array.isArray(p.devices) ? p.devices : [];
      const doneKey = `done-${send.id}-${sid}`;
      const done = new Set(opts.interactive ? ls.get(doneKey, []) : []);
      const ul = el("ul", { class: "dl" });
      devs.forEach((d, i) => {
        const li = el("li", { class: done.has(i) ? "done" : "" });
        const cb = el("input", { type: "checkbox", "aria-label": `Mark ${d.p} done` });
        cb.checked = done.has(i);
        if (!opts.interactive) cb.disabled = true;
        cb.addEventListener("change", () => { cb.checked ? done.add(i) : done.delete(i); li.classList.toggle("done", cb.checked); ls.set(doneKey, [...done]); });
        li.append(cb, el("span", { class: "q", text: String(d.q) }), el("span", { class: "nm" }, d.p, d.n ? el("span", { class: "n", text: d.n }) : null));
        ul.append(li);
      });
      body.append(ul);
    }
    if (send.note) body.append(el("div", { class: "note", text: send.note }));
    const foot = el("div", { class: "cf" });
    if (opts.onLater) foot.append(el("button", { class: "later", type: "button", onclick: opts.onLater, text: "Close" }));
    foot.append(el("button", { class: "ok", type: "button", onclick: opts.onAck, text: opts.ackLabel || "Got it" }));
    return el("div", { class: "card", style: `--acc:${acc}`, role: "dialog", "aria-label": title },
      el("div", { class: "ch" }, el("img", { src: ICON, alt: "" }),
        el("div", {}, el("div", { class: "app", text: `${APP_NAME}, ${ago(send.createdAt)}` }), el("div", { class: "ti", text: title }))),
      body, foot);
  }

  window.SN = {
    APP_NAME, ICON, PILLARS, DEFAULT_LOOK, $, el, ls, safeColor, keyOf, todayKey, mondayOf, parseKey,
    dayLabel, shortDay, weekLabel, clockText, ago, uid, debounce, toast, fill, look, api,
    ctxFor, messageText, bannerEl, cardEl
  };
})();
