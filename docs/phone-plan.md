# FocusFrog on the phone — plan

Goal: use FocusFrog on the phone as well as on the Mac, the way Tree Tracker and
CampusGarden work: a hosted app you sign in to once per device, live sync through
Firebase, works offline, installable on the home screen, phone layout with the
tabs at the bottom.

## Decisions

| Topic | Decision |
| --- | --- |
| Backend | Firebase Auth (email + password) and Firestore, like both reference apps |
| Firebase project | `focusfrog-wenkmann` in the Google account wenkmannjulia2000@gmail.com (next to Tree Tracker and CampusGarten; juliawenkmann@gmail.com is blocked from Firebase by Google), Firestore in europe-west3 |
| App sign-in | Email + password juliawenkmann@gmail.com (`OWNER_EMAILS`, `isOwner()`), separate from the project's Google account |
| Hosting | Cloudflare Workers static assets, like CampusGarden (`focusfrog.juliawenkmann.workers.dev`) |
| Phone pages | Todos, Vision board, Hours (summaries), Pomodoro, Time blocking |
| Vision photos | Downscaled WebP (~1280 px) stored in Firestore — no billing plan |
| Privacy | Only the owner can read or write; enforced by `firebase/firestore.rules` |

## Privacy rules (non-negotiable)

- Every document lives under `users/{uid}`. The rules allow reads and writes only
  when `request.auth.uid == uid` **and** the account is the owner (email allow-list,
  later the owner's uid). Anyone else — signed out or with their own account — gets
  nothing.
- Window titles, URLs and app names never leave the Mac. Only time sums per category
  sync (`days/{date}`, `weeks/{weekStart}`); the rules allow only those fields.
- The hosted page shows only a sign-in screen until the owner signs in.

## Data model

| Path (under `users/{uid}`) | Contents | Source key on the Mac |
| --- | --- | --- |
| `todos/{id}` | one todo | `todos` |
| `todoProjects/{id}` | one project | `todoProjects` |
| `timeBlocks/{id}` | one time block | `timeBlocks` |
| `manualWork/{id}` | one manual work entry | `manualWork` |
| `visionItems/{id}` | one dream, with `position` for "My order" | `visionBoard.items` |
| `visionImages/{id}` | downscaled photo (base64 WebP) | `vision-board-images/` |
| `state/{name}` | `todoDayPlan`, `todoFrog`, synced settings | same keys |
| `weeks/{weekStart}` | weekly sums | `weeklySummaries` |
| `days/{date}` | daily sums uploaded by the Mac | new |

Item documents: `{ item, updatedAt, deletedAt, device }`. Deletes are tombstones
(`deletedAt`) so a deleted todo does not come back from another device. Conflicts:
newest `updatedAt` per item wins.

Sync works against a baseline: the sync layer remembers the last list it handed to a
page or received from it. A save only deletes items that were in that baseline, so a
page that saves before it has loaded can never wipe the cloud.

On the Mac the local server (`storage.json`) keeps being written as a full backup
mirror; the cloud is added alongside. Before the first upload, a snapshot of
`storage.json` and `vision-board-images/` is taken.

## Builds

- **local** (installed Mac app): tracking API on `127.0.0.1:27180`, plus cloud sync
  when signed in.
- **cloud** (hosted, phone): no tracking API; Hours shows `days`/`weeks` from the
  cloud; pages that need raw events are hidden. PWA: manifest, icons, service worker.

## Phases

0. Firebase scaffold: `firebase.json`, rules, emulator scripts, rules tests.
1. Sync layer `src/sync/` + `src/util/focusfrogStorage.ts`; pages use it; account
   panel (lock in the top bar); migration from `storage.json`. Emulator tests.
2. Cloud build target + PWA; phone can sign in and use Todos and Vision.
3. Day-sum uploader on the Mac (while FocusFrog is open) + Hours on the phone.
4. Phone layout: bottom tab bar, compact top bar, a pass over every page.
5. Real Firebase project + Cloudflare deploy (needs the user's logins), README.

## Testing

- `npm run emulators` (Auth + Firestore emulators, project `demo-focusfrog`), open
  the app with `?firebase-emulator=1`. Test accounts exist only in the emulator.
- `npm run test:rules` — security-rule tests, including that other accounts and
  title/url fields are rejected.
- Jest unit tests for the sync merge logic.
- Browser pane with two tabs (Mac + phone size) and the iOS Simulator for Safari /
  "Add to Home Screen".

## Status

- 2026-11-05 — Phases 0 and 1 done on branch `phone-sync` (not committed yet):
  `firebase/firestore.rules` + 18 rule tests, `src/sync/{model,engine,cloud,config}.ts`,
  `src/util/focusfrogStorage.ts`, `src/stores/cloud.ts`, lock panel
  (`CloudAccount.vue`, `CloudSignInForm.vue`); Todos, Time blocking, Hours (manual work,
  weekly sums), Vision board and the frog reminder load/save through
  `focusfrogStorage`. Verified with the emulators: first sign-in uploads storage.json
  (143 todos, 6 projects, 4 manual entries, 28 dreams, 22 weeks, plan, frog); a todo
  added on one device appears on the other within a second; a delete stays deleted after
  reload; vision reorder + edit sync live.
- `PROJECT_CONFIG` in `src/sync/config.ts` is still null, so the installed Mac app does
  not load Firebase until the real project exists.
- 2026-11-05 — Phases 2–4 built and verified with the emulators (still on `phone-sync`,
  uncommitted): phone build (`npm run build:cloud`, `IS_CLOUD_BUILD`), sign-in screen
  (`CloudGate.vue`), phone routes (Hours = `CloudHours.vue`, Todos, Plan, Vision; Pomodoro
  not yet — it stores sessions in the Mac's tracking server), bottom tab bar, PWA
  (PWA plugin options in `vue.config.js`, `static/icons/`, `src/sw.js`), Cloudflare config
  (`wrangler.json`, `static/_headers`). Mac uploads daily sums (`sync/daySums.ts`, sums
  match the Hours page to the second) and downscaled photos (`sync/visionImages.ts`, 28/28
  as WebP). Settings subset (theme, flower picture, start of day/week) syncs as
  `state/settings`. Hours math moved to `util/workDay.ts` (Home delegates; numbers
  verified identical against the live app).
- 2026-11-05 — Project live: `focusfrog-wenkmann` created, Firestore (europe-west3), web app
  registered (config in `src/sync/config.ts`), rules + email/password sign-in deployed
  (`npm run deploy:firebase`), data snapshotted to `FocusFrog/data-backups/before-cloud-*`, Mac app
  installed. The user created their account on the Mac (everything uploaded: 148 todos, 28
  dreams + photos, 22 weeks). Rules locked to that account id, sign-ups switched off
  (`client.permissions.disabledUserSignup`; `deploy --only auth` keeps it off). Phone version
  live at https://focusfrog.juliawenkmann.workers.dev (`npm run deploy:cloud`). Auth uses
  `initializeAuth` without the pop-up helper, which loaded a Google script the CSP blocks.
- Later: Pomodoro on the phone (sessions in the cloud), lock the rules to the owner uid.

## Go-live checklist

1. Snapshot `storage.json` and `vision-board-images/` before the first real sign-in.
2. Done 2026-11-05. After the owner's account exists: add its uid to `isOwner()` in the rules (as Tree
   Tracker does) and turn off new sign-ups in the Firebase console (Authentication →
   Settings → User actions).
3. First real sign-in on the Mac with the browser console open: a `connect-src` CSP
   violation from the Firebase SDK would otherwise fail quietly.
4. `npm run test:rules` starts its own emulator: stop `npm run emulators` first. The rule
   tests clear the emulator's data.
5. The service worker precaches every prefetched chunk, Mac-only pages included (about
   5 MB of JS); trim if the phone's first load feels slow.
