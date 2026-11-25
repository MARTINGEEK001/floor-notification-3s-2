# Floor Notify

Sends each cleaner’s weekly 3S assignment and today’s devices to their station iPad as a real notification. The iPad doesn’t need anything open.

- **Console** (your computer): `https://YOUR-SITE.netlify.app`
- **Station app** (each iPad): `https://YOUR-SITE.netlify.app/station.html`, added to the Home Screen

## What’s in this folder

| Path | What it is |
|---|---|
| `public/index.html` | Supervisor console: compose, message look, stations, sent history |
| `public/station.html` | The iPad app cleaners see |
| `public/sw.js` | Lets the iPad show notifications while the app is closed |
| `public/manifest.webmanifest`, `public/*.png` | App name and Home Screen icon |
| `netlify/functions/api.mjs` | The server: saves data and sends the notifications |
| `netlify.toml`, `package.json` | Settings Netlify reads when it builds the site |

## One-time setup (about 30 minutes)

### 1. Put the files on GitHub
1. Make a free account at github.com.
2. Click **New repository**, name it `floor-notify`, choose **Private**, then **Create repository**.
3. On the new repository’s page, click **uploading an existing file**.
4. Open the unzipped `floor-notify` folder and drag **everything inside it** onto the page. Use Chrome or Edge, since they keep the folders intact.
5. Click **Commit changes**.

### 2. Put it online with Netlify
1. Make a free account at netlify.com and choose **Sign up with GitHub**.
2. Click **Add new project**, then **Import an existing project**, then **GitHub**, and pick `floor-notify`.
3. Leave the build settings as they are and click **Deploy**.
4. Optional: under **Domain management**, rename the site to something like `floor-notify-cell2.netlify.app`. Do this before setting up iPads, since it changes the address.

### 3. Set up the console
1. Open your site’s address. The first time, it asks you to create your **PIN** (for the console) and a **floor code** (for the iPads). Write the floor code down.
2. Under **Stations & iPads**, rename the stations and add the cleaners’ names.

### 4. Set up each iPad (iPadOS 16.4 or later)
1. Open **Safari** and go to `https://YOUR-SITE.netlify.app/station.html`.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Close Safari. Open **Floor Notify** from the Home Screen. It has to be opened from the Home Screen icon, not Safari, or notifications won’t work.
4. Enter the floor code you created, pick the station, and tap **Turn on notifications**, then **Allow**.
5. Tap **Send a test** in the bottom corner. A notification should appear within a few seconds.
6. In **Settings**, open **Notifications**, then **Floor Notify**. Turn on Lock Screen and Banners, and set the banner style to **Persistent** so it stays until someone taps it.

## Daily use
- In the console, fill in the 3S duties and today’s devices, then press **Send**.
- After sending, a message says which stations were reached. If a station had no iPad set up, its cleaner still sees the assignment next time they open the app.
- **Sent** shows who tapped **Got it**.

## If an iPad stops getting notifications
- Check that **Focus** or **Do Not Disturb** is off.
- Open Floor Notify. If the corner says **Notifications off**, tap it and turn them back on.
- Still nothing? Delete the Home Screen icon and repeat step 4.
- On company-managed iPads, IT may need to allow notifications for Home Screen web apps.

## Netlify free plan
The free plan includes 300 credits a month.
- Each deploy uses 15 credits. A deploy happens when you change files on GitHub or click Trigger deploy, so keep code changes to a handful a month.
- Day-to-day sending uses very little.
- If the monthly limit runs out, Netlify pauses the site until the next month.

## Changing the app’s name or icon
- Edit `public/manifest.webmanifest`, or replace the `.png` icons, then upload the changes to GitHub.
- Each iPad then has to remove the Home Screen icon and add it again to pick up the change.
- The wording of the messages and the colors don’t need any of this. Change those in the console under **Message look**.

## Changing the PIN or floor code
In the console, open **Stations & iPads** and scroll to **Sign-in codes**. After you change the floor code, each iPad asks for the new one the next time it opens.
