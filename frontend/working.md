# FitFinity — Application Specification

A full-stack workout tracking app: an Expo/React Native client (works on iOS,
Android, and web) backed by an Express + PostgreSQL API. Users log workouts
against reusable routine "templates," build a personal or shared exercise
library, and review history through a calendar and dashboard.

## 1. High-Level Architecture

```
┌─────────────────────────────┐        JSON over HTTPS/HTTP        ┌──────────────────────────────┐
│  Frontend (Expo / RN)       │  ───────────────────────────────▶  │  Backend (Express + Prisma)  │
│  app/ (expo-router screens) │  ◀───────────────────────────────  │  backend/src/index.ts        │
│  Zustand-ready, Context API │        multipart (image upload)    │  JWT auth, bcrypt             │
└─────────────────────────────┘                                    └──────────────┬───────────────┘
        │  SecureStore / localStorage (JWT)                                       │ Prisma Client
        ▼                                                                          ▼
  Device / Browser storage                                              ┌──────────────────────┐
                                                                          │ PostgreSQL 16 (Docker)│
                                                                          └──────────────────────┘
```

Three deployable units, orchestrated by `docker-compose.yml`:

| Service    | Image / Build              | Port  | Purpose                                   |
|------------|-----------------------------|-------|--------------------------------------------|
| `db`       | `postgres:16-alpine`        | 5432  | Primary data store                         |
| `backend`  | `./backend/Dockerfile`      | 5001  | REST API, auth, file uploads               |
| `frontend` | `node:20-slim` (dev mode)   | 8081  | Expo web dev server (`expo start --web`)   |

The backend container runs `prisma migrate deploy && npm run seed && npm start`
on every boot — migrations and global-data seeding are idempotent, so this is
safe to re-run.

A fourth deployable unit isn't in this table: the **native Android app**,
built separately via EAS (not Docker, not this compose file) and installed
directly on-device rather than served — see §15. It's easy to forget it
exists as its own pipeline; a fix isn't "live" for phone users until that
pipeline runs too, no matter how thoroughly the web/backend side was
redeployed.

## 2. Tech Stack

**Frontend** (`frontend/`)
- Expo SDK 55, `expo-router` ~55 (file-based routing), React 19.2, React Native 0.83
- `react-native-calendars`, `react-native-gifted-charts` (LineChart/BarChart), `react-native-svg`
- `lucide-react-native` for icons
- `expo-secure-store` for token storage on native; `localStorage` on web
- `expo-image-picker` for picking exercise photos; `expo-image` for rendering them (and all other exercise/template pictures — see §10, native GIF/WebP/AVIF decode support the plain `react-native` `Image` component lacks on Android)
- `@react-native-async-storage/async-storage` + `@react-native-community/netinfo` for the offline cache/sync queue (see §8)
- `zustand` is a dependency but not currently used anywhere (no store defined) — state is handled via React Context instead
- TypeScript throughout

**Backend** (`backend/`)
- Node 20, Express 4, TypeScript, `ts-node` for dev / `tsc` build for prod
- Prisma 5 ORM against PostgreSQL
- `jsonwebtoken` + `bcryptjs` for auth
- `multer` for multipart image uploads, served statically from `/uploads`

**Infra**
- Docker Compose for local/dev orchestration (Postgres + backend + Expo web)
- `.env` (gitignored) supplies `POSTGRES_PASSWORD` and `JWT_SECRET`; see `.env.example`

## 3. Repository Layout

```
FitFinity/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── src/index.ts            # entire Express API (single file, ~377 lines)
│   ├── prisma/
│   │   ├── schema.prisma       # data model
│   │   ├── seed.js             # seeds 6 generic global workout templates
│   │   ├── seed-exercises.js   # seeds ~26 global exercises with instructions
│   │   ├── seed-appsheet-templates.js  # seeds the user's real 5-week AppSheet program (15 templates)
│   │   └── promote-admin.js    # CLI: promote a user to admin by username
│   └── Dockerfile
└── frontend/
    ├── app/                    # expo-router screens (file = route)
    │   ├── _layout.tsx         # root Stack + ThemeProvider + AuthProvider
    │   ├── index.tsx           # redirects into (tabs)
    │   ├── login.tsx           # login/register screen
    │   ├── active-workout.tsx  # start/edit a workout session
    │   ├── exercise-editor.tsx # create/edit an exercise
    │   ├── template-editor.tsx # create/edit a routine
    │   └── (tabs)/             # bottom tab navigator
    │       ├── _layout.tsx     # tab bar, theme toggle, sign-out
    │       ├── index.tsx       # "Stats" dashboard (charts)
    │       ├── log.tsx         # "Log" workout history table
    │       ├── calendar.tsx    # "History" calendar view
    │       ├── exercises.tsx   # "Exercises" library
    │       ├── templates.tsx   # "Templates" routine list
    │       └── admin-users.tsx # "Admin" user management (admins only)
    ├── components/
    │   ├── ChangePasswordModal.tsx  # shared self-service / admin-reset password modal (see §11)
    │   └── SyncStatusBanner.tsx     # shared "N changes saved offline" / "you're offline" banner (see §8)
    ├── context/
    │   ├── AuthContext.tsx     # JWT/session state + route guarding
    │   └── ThemeContext.tsx    # light/dark/system theme
    ├── database/
    │   ├── api.ts              # fetch wrappers for every backend endpoint; offline cache/queue wiring (see §8)
    │   └── db.ts                # LEGACY — pre-migration local SQLite schema (dead code, see §9)
    ├── hooks/
    │   └── useAutoRefresh.ts   # refetch on nav focus + on app foreground (see §8)
    ├── services/
    │   ├── offlineSync.ts       # AsyncStorage cache + sync queue backing database/api.ts (see §8)
    │   └── CloudSyncService.ts  # LEGACY — mock Google Drive backup/restore (dead code, see §9)
    ├── utils/
    │   ├── alert.ts             # cross-platform alert/confirm (native Alert vs window.alert/confirm)
    │   └── imageMapper.ts       # maps exercise names → bundled gif/webp assets; resolveMediaUrl() (see §8) resolves server-relative vs. absolute/local-device image URIs
    ├── constants/Colors.ts      # light/dark palette
    ├── assets/images.ts         # keyed map of all bundled exercise images
    └── images/                  # ~40 exercise gif/webp/png assets
```

## 4. Data Model (`backend/prisma/schema.prisma`)

PostgreSQL via Prisma. Five models:

- **User** — `id, username (unique), passwordHash, isAdmin`. Owns Templates,
  Exercises, and Logs.
- **Exercise** — `id, userId? (null = global), name, categories: String[], imageUrl?, description?, isGlobal`.
- **Template** — a reusable workout routine: `id, userId? (null = global), name, description?, isGlobal`, has many `TemplateExercise`.
- **TemplateExercise** — one prescribed exercise within a template: `templateId, exerciseName, targetSets, targetReps (string, e.g. "8-10" or "12, 10, 8"), targetWeight (float, comma-list also supported client-side)`.
- **Log** — one completed/edited workout session: `userId, date (string "YYYY-MM-DD HH:MM"), templateName?, sentiment? (string "1"–"5")`, has many `LogSet`.
- **LogSet** — one set performed: `logId, exerciseName, weight?, reps?, completed`.

Notes:
- Exercise/Template names are stored as free-text strings on `TemplateExercise`/`LogSet` rather than foreign keys to `Exercise` — there's no referential integrity between the exercise library and what's logged/templated. Renaming an Exercise does not update historical logs or templates.
- `isGlobal` records have `userId = null` and are visible to every authenticated user; only admins can create/toggle global records (enforced both client-side via `isAdmin` gating and server-side in the route handlers).
- Cascading deletes: deleting a User cascades to their Templates/Exercises/Logs; deleting a Template/Log cascades to its child rows.

## 5. Backend API (`backend/src/index.ts`)

Base path `/api`. All routes except auth require `Authorization: Bearer <JWT>`.

**Auth**
- `POST /api/auth/register` — `{username, password}` → creates user (bcrypt-hashed password); the very first user ever created becomes admin automatically; returns `{token, userId, username, isAdmin}`.
- `POST /api/auth/login` — `{username, password}` → same token payload.
- JWT signed with `JWT_SECRET` (required env var, process throws at startup if unset), 7-day expiry, payload `{userId, isAdmin}`.

**Middleware**
- `authenticateToken` — validates bearer token, attaches `req.user`.
- `requireAdmin` — 403s if `req.user.isAdmin` is falsy.

**Admin** (admin-only)
- `GET /api/admin/users` — list all users (id, username, isAdmin).
- `PUT /api/admin/users/:id` — set `isAdmin`.
- `DELETE /api/admin/users/:id` — delete a user (403 if targeting yourself).

**Users**
- `PUT /api/users/:id/password` — `{newPassword}` (min 6 chars). Deliberately **not** gated by the `requireAdmin` middleware — authorized inline instead: allowed if `req.user.userId === id` (self-service, no current-password confirmation required) OR `req.user.isAdmin` (admin resetting anyone). 403 otherwise.

**Exercises**
- `GET /api/exercises` — global + own exercises.
- `POST /api/exercises` (multipart, field `image`) — creates an exercise; `isGlobal` only honored if requester is admin; uploaded file takes priority over a pasted `imageUrl`.
- `PUT /api/exercises/:id` (multipart) — owner or (admin + global) may edit; only admins may flip `isGlobal`; explicit empty `imageUrl` clears the image, omitted field keeps existing.
- **Upload filenames are derived from the real MIME type, not trusted client naming** — fixed 2026-08-29 after discovering every one of 16 production uploads (dating back to July) was actually a GIF/PNG/AVIF/WebP file saved and served as `...upload.jpg`. The client (`appendImageToFormData` in `database/api.ts`) used to hardcode every upload's filename/declared type to `upload.jpg`/`image/jpeg` regardless of the real picked file's format; the multer `filename` callback here then just echoed that client-supplied name straight through, so `express.static` (which derives `Content-Type` from the extension) served a real WebP file as `Content-Type: image/jpeg`. Browsers tolerate this by sniffing actual content; Android's native `<Image>` decoder does not, and silently fails to render it. Both sides are now fixed to derive the extension from the real MIME type (`MIME_TO_EXT` map here, matched client-side in `database/api.ts`) instead of a hardcoded/client-declared name — the 16 pre-existing mismatched files in production were renamed to their real extensions and their `Exercise.imageUrl` rows updated to match, as a one-time repair (see git history around this date for the exact SQL used, not reproduced as a migration since it was a one-off data fix, not schema).

**Templates**
- `GET /api/templates` — global + own, with nested `exercises`.
- `GET /api/templates/:id` — 403 if private and not yours.
- `POST /api/templates` — creates template + nested `TemplateExercise` rows in one call.
- `PUT /api/templates/:id` — owner or (admin + global); if `exercises` array is present, all existing `TemplateExercise` rows are deleted and recreated (full replace, not diffed).
- `DELETE /api/templates/:id` — owner or (admin + global); cascades to delete the template's `TemplateExercise` rows (DB-level `onDelete: Cascade`).

**Logs** (always scoped to `req.user.userId`, never global)
- `GET /api/logs` — all of the caller's logs with sets, newest first.
- `GET /api/logs/:id`, `POST /api/logs`, `PUT /api/logs/:id` (full delete+recreate of sets), `DELETE /api/logs/:id`.

**Static** — `/uploads/*` serves images written by multer to `backend/uploads/` (persisted via the `backend_uploads` Docker volume).

## 6. Frontend Routing & Navigation

Uses `expo-router` file-based routing. `app/_layout.tsx` wraps everything in
`ThemeProvider` → `AuthProvider` → a single `Stack` containing the `(tabs)`
group plus modal-ish full-screen routes (`login`, `active-workout`,
`exercise-editor`, `template-editor`) that sit outside the tab bar.

`(tabs)/_layout.tsx` defines six tabs: **Stats** (dashboard), **Log**
(history table), **History** (calendar), **Exercises** (library), **Templates**
(routines), **Admin** (hidden unless `isAdmin`, via `href: null`). The header
also carries a theme toggle (sun/moon) and sign-out button.

`AuthContext` performs the route guarding: it loads a persisted token on
mount, then in an effect redirects to `/login` if there's no token (unless
already on the login screen), or to `/(tabs)/` if there is a token and the
user is still sitting on `/login`. All other authenticated routes are left
alone so deep-linking into e.g. `active-workout` doesn't get bounced.

## 7. State & Persistence (client-side)

- **AuthContext** (`context/AuthContext.tsx`) — holds `token, userId, username, isAdmin`; persists to `expo-secure-store` on native, `localStorage` on web (helper functions branch on `Platform.OS`). Exposes `signIn`/`signOut`.
- **ThemeContext** (`context/ThemeContext.tsx`) — `light | dark | system`; system mode follows `useColorScheme()`; user override persisted to `localStorage` (web only — native has no persistence for this, it just resets to `system` on relaunch).
- **`database/api.ts`** — the sole data-access layer; every screen calls these fetch wrappers rather than touching `fetch` directly. Reads the JWT from storage per-request and attaches `Authorization: Bearer`. Image uploads build a `FormData`; on web it re-fetches the picked asset's blob/data URL into a real `Blob` before appending (RN's polyfill object-literal trick doesn't work in real browsers).
- No client-side app-state store (no Redux/Zustand/React Query) — every list/detail screen re-fetches via `hooks/useAutoRefresh.ts` (on-focus **and** on app-foreground, see §8) plus manual pull-to-refresh. There is a persistent offline cache/sync queue for logs/templates/exercises, though — see §8.

## 8. Offline Support & Sync (`services/offlineSync.ts`, `hooks/useAutoRefresh.ts`)

Added 2026-07-05, originally scoped to workout logging only; extended
2026-08-29 to cover **every part of the app** (logs, templates, and
exercises) after a report that templates/exercises edited via the web app
weren't showing up on mobile. That investigation found two separate issues,
both now fixed:

1. **Root cause of the reported bug**: Templates/Exercises/Log/Calendar/Stats
   only refetched on React Navigation focus (`useFocusEffect`), which does
   **not** fire when the OS backgrounds/foregrounds the app without an
   in-app navigation change — exactly what happens when someone edits data
   on the web, then switches back to an already-open mobile app sitting on
   the same tab. There was no server-side caching involved (verified against
   `ff.sl8er.net` directly) — it was purely a client-side "never re-asked"
   problem, and it failed silently with no indication the data was stale.
2. **Design gap**: templates/exercises were cached read-only for offline
   *viewing*; only workout logs supported full offline create/edit/delete.

**Fix 1 — read freshness.** `hooks/useAutoRefresh.ts` wraps `useFocusEffect`
with an `AppState` listener: it refetches on in-app tab focus *and* whenever
the app resumes to `active` while the screen is the currently-focused one.
Every list/detail screen (Templates, Exercises, Log, Calendar, Stats) uses
this hook instead of a bare focus effect, and all five also gained
pull-to-refresh (`RefreshControl`) as a manual fallback. `offlineSync`
additionally tracks a simple in-memory online/offline flag
(`setOnline`/`setOffline`/`getIsOffline`), flipped by every fetch* call in
`database/api.ts`; combined with the pending-queue count this drives a
shared `components/SyncStatusBanner.tsx`, shown on Log/Templates/Exercises:
"N changes saved offline, not yet synced" (tap to **Sync Now**) when there's
a queue, or "You're offline — showing the last synced data" when a read
fell back to cache with nothing queued.

**Fix 2 — full offline write queue, native only.** The single AsyncStorage
queue (`offline_queue`) now carries eight action kinds, not three: logs'
`create`/`update`/`delete`, `template-create`/`template-update`/`template-delete`,
and `exercise-create`/`exercise-update` (there's no offline exercise delete
because the app has no delete-exercise UI/endpoint to begin with — see §5).
Every entity type follows the same pattern already established for logs.

**Web is deliberately excluded from queuing** (`canQueueWritesOffline =
Platform.OS !== 'web'` in `database/api.ts`, gating every catch block below)
— added 2026-08-29 after a real incident: a web-uploaded exercise image
silently queued instead of saving (the browser tab likely had a brief
network hiccup mid-upload), showed "Success," and was never recoverable —
the picked image is a `blob:` URL scoped to that one tab, so once the tab
closed the queued retry could never re-read the file, and more generally
AsyncStorage-as-browser-localStorage is far less durable than on a phone (a
closed tab loses it entirely, unlike a backgrounded native app). On web, a
write that can't reach the network now throws for real instead of queuing —
restores the pre-offline-sync behavior there, matching what actually makes
sense for a browser tab vs. a phone in a gym with bad signal. Reads
(the caching described below) are unaffected and still fall back to cache on
web too — that part carries no data-loss risk.

That fix alone wasn't sufficient the first time it shipped: it stopped *new*
web writes from queuing but didn't clean up whatever was already queued from
before — including the exact broken image upload above, which could never
sync (dead `blob:` URL) yet kept rendering successfully in that one browser
tab via the pending-merge preview (`getMergedExercises`), while the real
server value stayed `null` the whole time. This produced a genuinely
confusing state: the web app kept "showing" the image (a local-only
illusion) while every other client correctly showed nothing, and the
still-stuck entry silently blocked anything queued behind it. Fixed by
`discardStaleWebQueue()` (`database/api.ts`, backed by
`offlineSync.clearQueue()`), called once from `app/_layout.tsx` on web
startup in place of `startOfflineSync()`/`syncNow()` — unconditionally
empties the queue on every web load, since nothing queued there can ever be
trusted post-fix. Native's queue/sync-on-reconnect behavior is untouched.

- **Read-through caching** — `fetchExercises`, `fetchTemplates`, and
  `fetchLogs` in `database/api.ts` each try the network first; on success
  they cache the response (`offline_cache_exercises`/`_templates`/`_logs`)
  and call `setOnline()`; on a genuine network failure (`fetch` throwing a
  `TypeError` — the cross-platform signal for "couldn't reach the network at
  all", as opposed to a reachable server returning an error status) they
  call `setOffline()` and fall back to the cached copy. `fetchTemplate(id)`
  and `fetchLog(id)` (singular) fall back to the cached plural list for
  negative ids or on a network error.
- **Write queueing** — `createTemplate`/`updateTemplate`/`deleteTemplate` and
  `createExercise`/`updateExercise` attempt the real network call first
  (multipart, for exercise image uploads); on a network failure they enqueue
  the action and return a synthetic result, so `template-editor.tsx` and
  `exercise-editor.tsx` needed **no changes at all** — they already treated
  a non-throwing save as success, same as `active-workout.tsx` for logs.
  A locally-created, not-yet-synced template/exercise gets a **negative id**
  exactly like logs, so editing or deleting it before it syncs just
  mutates/cancels its still-queued `create` action in place.
- **Merging** — `getMergedTemplates`/`getMergedExercises` (mirroring
  `getMergedLogs`) splice queued creates/edits/deletes into the
  server-fetched list, marked `_pendingSync: true` and shown with a small
  cloud-off icon on the Templates/Exercises cards.
- **Offline image uploads** — a locally-picked-but-not-yet-uploaded exercise
  image is queued as `{ image: { uri } }` (the device's local file uri) and
  actually re-uploaded via multipart at sync time, reusing the same
  `appendImageToFormData` path a live upload would take. The merged/pending
  row previews directly from that local uri. **Known limitation**: this
  relies on the OS not having reclaimed the picker's cache file before the
  device reconnects; if that file is gone, the sync attempt fails with a
  non-network error and is dropped (console warning) rather than retried
  forever — same "drop rather than block the queue" behavior as a
  server-rejected action, see below. Because a pending row's `imageUrl` can
  be a local device uri instead of a server-relative path, every screen that
  renders exercise images (`imageMapper.ts`'s `resolveExerciseImageSource`,
  the Exercises tab card, `exercise-editor.tsx`'s preview) resolves through
  the shared `resolveMediaUrl()` helper, which only prefixes `MEDIA_BASE_URL`
  onto server-relative paths (`/uploads/...`) and leaves anything already
  absolute (`http(s)://`, `file:`, `content:`, etc.) untouched.

**Sync trigger** — `startOfflineSync()` (called once from `app/_layout.tsx`)
watches `NetInfo` for an offline→online transition and calls `syncNow()`
automatically; `_layout.tsx` also calls `syncNow()` once at app startup as a
fallback for a queue left over from being closed while offline. `syncNow()`
replays the single combined queue in creation order against the real
endpoints (logs/templates/exercises interleaved by when they were queued —
safe because none of these reference each other by id, only by free-text
name, per §4); if an action fails with another network error the flush stops
and retries next time, but a server-rejected/otherwise-broken action (e.g.
updating a template that's gone, or a since-evicted local image file) is
dropped with a console warning rather than blocking the rest of the queue
forever.

**Known limitations**: caches only cover the *last successful* fetch per
user/device — a phone that has never been online for a given account has
nothing to show offline yet (expected: first login always requires
connectivity). Two devices editing/deleting the same row while both offline
independently is not reconciled beyond last-write-wins-by-replay-order; this
wasn't a design goal for the current single-user-per-phone use case. Admin
actions (user management) still require a live connection.

## 9. Known Dead Code / Legacy Artifacts

The app was originally built as a fully offline, local-SQLite app (see
commit history: `d49030c` Expo migration → `61746ba` added the Express/Postgres
backend). That migration left artifacts that **do not run** but are still in
the tree:

- **`frontend/database/db.ts`** — SQLite schema/migration logic (`expo-sqlite`
  is not even a listed dependency anymore). Unreferenced by any screen.
- **`frontend/services/CloudSyncService.ts`** — a mock Google Drive
  backup/restore service operating on the old SQLite tables. Unreferenced;
  `export default new CloudSyncService()` never gets imported anywhere.
- ~~`(tabs)/index.tsx` (Dashboard)~~ — **fixed 2026-07-05.** Used to run SQL
  query strings against a hardcoded no-op `db` stub (`{ getAllAsync: async
  () => [], ... }`), so the Stats charts always rendered empty/zero. Rewired
  to `fetchLogs()`: the 30-day reps/weight-per-day series, the last-5-workout
  sentiment bars, and the lifetime rep/weight/workout totals are all now
  recomputed client-side in JS from the real log list (completed-sets-only
  filtering and the 30-day cutoff both preserved exactly, verified against
  the original SQL semantics with synthetic test logs spanning the cutoff).
- ~~`(tabs)/calendar.tsx` (History)~~ — **fixed 2026-07-05.** Same dead
  SQL-stub pattern as the dashboard (always empty). Rewired to `fetchLogs()`:
  marked dates and the selected day's exercise/set breakdown are now derived
  client-side from the real log list instead of SQL query strings run against
  a no-op object.

As of 2026-07-05, every screen (Log, Calendar/History, Stats/Dashboard,
Exercises, Templates, Active Workout, Admin) is fully wired up to the real
`/api/logs` and `/api/exercises` endpoints — no screen still queries the dead
SQLite stub. `frontend/database/db.ts` and `frontend/services/CloudSyncService.ts`
(above) remain as pure dead code, unreferenced by anything.

## 10. Media & Exercise Images

The exercise picker used when building a routine (`template-editor.tsx`) or
logging a workout (`active-workout.tsx`) sources its list from the real
`GET /api/exercises` library (global + the caller's own), fetched into local
state (`libraryExercises`) on mount — **not** a hardcoded bundled list. This
means anything visible on the Exercises tab (including anything a user
creates themselves, like a custom "Rucking" exercise with an uploaded photo)
is immediately selectable everywhere a routine/workout references an
exercise by name.

Image resolution for any exercise name goes through the shared
`resolveExerciseImageSource(name, imageUrl)` helper in `utils/imageMapper.ts`,
which tries, in order:
1. The exercise's own `imageUrl` from the Exercise record (an uploaded file, served from the backend's `/uploads/<timestamp>-<name>`, or a pasted external URL) — this is the priority path and what makes user-uploaded photos show up everywhere.
2. A bundled gif/webp keyed by name in `assets/images.ts` (`getExerciseGif`, with a normalized-name fallback match) — covers the original AppSheet cable-exercise names that ship with matching bundled assets but may not have an `Exercise` row.
3. A second bundled-asset map keyed by generic strength-exercise names (`getExerciseLibraryImage`) — covers the generic `seed-exercises.js` entries.
4. `null` — callers render a generic Dumbbell icon placeholder.

Every screen that shows an exercise thumbnail (the template-editor's and
active-workout's exercise-picker rows and per-exercise header images, and the
Templates tab's per-routine gif strip) resolves through this same helper, so
a photo uploaded via the Exercise Library editor propagates everywhere that
exercise is referenced — including inside existing templates/logs, since
those only store the exercise name as a string (see §4 caveat on no FK to
`Exercise`) and are matched back to a library entry by case-insensitive name
at render time, not by a stored reference.

**All exercise/template image rendering uses `expo-image`, not the plain
`react-native` `Image` component** — switched 2026-08-29 after confirming
GIF/WebP/AVIF images (both user-uploaded and the bundled AppSheet cable-gif
assets) rendered fine on web but as a blank box on Android, even after
fixing the Content-Type-mismatch bug above. Root cause: vanilla React
Native's Android image pipeline doesn't reliably decode GIF/WebP/AVIF
without extra native configuration Expo doesn't wire in by default for the
plain `Image` component. `expo-image` (already present as a transitive
dependency; formalized in `package.json`) uses a native pipeline with solid
built-in support for all of those formats and is Expo's own recommended
component. API differences from `react-native`'s `Image` handled at each
call site: `contentFit="cover"/"contain"` prop instead of `resizeMode`
(as either a prop or, in a couple of spots, a `StyleSheet` property — moved
out of the style object, since `expo-image` doesn't accept it there). Only
`login.tsx`'s and `(tabs)/_layout.tsx`'s static PNG logo/icon `<Image>`s
were left on `react-native`'s `Image` — PNG has never had this problem, and
those aren't served through any of the code paths above. **This is a native
module, unlike everything else in this fix** — it requires a fresh EAS
Android build to actually take effect on-device (the web deploy alone was
not sufficient); pure-JS changes don't need this, but adding/changing a
native dependency always does.

## 11. Key User Flows

- **Auth**: `login.tsx` toggles between login/register, both hitting the same form; success calls `AuthContext.signIn`, which persists the token and lets the route-guard effect push into `(tabs)/`.
- **Build a routine**: Templates tab → New/Edit → `template-editor.tsx` — add exercises from the full Exercise Library picker (searchable, see §9), set target sets/reps/weight per set (reps/weights stored as comma-joined strings to allow per-set targets), reorder with up/down chevrons, optionally mark Global (admin only), Save → `POST/PUT /api/templates`. `getRepList`/`getWeightList` always pad or truncate the reps/weight strings to exactly `target_sets` entries, so the number of rows shown here always matches `target_sets` — the same field `active-workout.tsx` loops over when expanding a template into a workout. (This wasn't always true: `getRepList` used to just split on comma with no padding, so a single-value reps string like `"15"` rendered only 1 row regardless of `target_sets`, silently drifting the two apart if someone clicked "Add Set" to compensate for the missing rows — each click bumped the real `target_sets` further past its intended value while only growing the reps list to match the rows they could see. Fixed 2026-07-05; any template edited under the old code before then may still have a `target_sets` that overshoots its actual intended set count and needs a one-time manual correction.)
- **Search & delete routines**: Templates tab has a search box filtering by routine name, description, or any contained exercise name (client-side only, no backend search endpoint); each card has Edit/Copy/Delete actions plus Start — Delete asks for confirmation (`confirmAction` from `utils/alert.ts`) then calls `DELETE /api/templates/:id`. As with Edit, the button is shown on every card regardless of ownership; the backend is the actual authority and returns 403 if the caller isn't the owner or an admin managing a global routine.
- **Run a workout**: Templates tab → Start (or Log tab → New Workout for a blank session) → `active-workout.tsx` loads either a template (`loadTemplate`, expanding target sets into editable rows) or an existing log (`loadWorkoutLog`, for editing history). Tracks completed/weight/reps per set, computes live session totals, captures a date/time and a 1–5 emoji sentiment, and warns on back-navigation with unsaved changes before `POST/PUT /api/logs`.
- **Review history**: Log tab shows a sortable/scrollable table of all logs with delete support; History (calendar) tab marks every logged date on a month view — as a filled `theme.accent` circle behind the day number (`markingType="custom"`, since a plain dot below the number was hard to see; the selected day's `theme.tint` circle always takes visual priority over the workout circle when a date is both) — and shows that day's routine name, sentiment, completed load, and a per-exercise set breakdown when tapped — both tabs read from the same `fetchLogs()` call, just presented differently.
- **Manage exercise library**: Exercises tab lists global + personal exercises with search-by-name/category; editor supports free-text categories (autocomplete from existing categories), description, image upload/URL, and (admin only) global visibility.
- **Admin**: Admin tab (visible only to admins) lists all users, lets you toggle admin status (not on yourself), delete users (not yourself), and reset any user's password; backend also enforces these constraints independently.
- **Change password**: a key icon in the tab header (next to the theme toggle and sign-out, visible to every user regardless of role) opens the same `components/ChangePasswordModal.tsx` used by the Admin page's per-user reset action, but targeting your own id — the one shared UI for both the self-service and admin-resets-anyone cases, since the backend's `PUT /api/users/:id/password` already encodes exactly that authorization split.

## 12. Seeded Global Content

Three seed scripts run in order on every backend start (`npm run seed`, all
idempotent — they skip rows that already exist by name):

1. `seed.js` — 6 generic global templates (Push/Pull/Legs/Full Body/Upper/Lower).
2. `seed-exercises.js` — ~26 global exercises with instructions, used by the Exercise Library tab.
3. `seed-appsheet-templates.js` — the user's actual historical 5-week program,
   ported from the original AppSheet "Templates" table (previously only
   preserved as dead migration data in `frontend/database/db.ts`). Produces 15
   global templates named `C{1-5} {Monday|Wednesday|Friday}`, one per session:
   - Structure: 5 cycles ("weeks") × 3 sessions/week, each a **Push (Mon) → Pull
     (Wed) → Legs (Fri)** split — a standard PPL rotation for hitting each
     muscle group with adequate recovery between sessions.
   - Each session has exactly 4 cable-machine lifting exercises (3 sets each,
     `targetReps` sometimes a comma-list like `"15, 12, 12"` for descending-rep
     sets) **plus Rucking as a mandatory 5th/last exercise** — `targetSets: 1`,
     `targetReps: "40 min, 2.2 mi"`, `targetWeight: 55` (ruck weight in lb).
   - Weight targets on most lifts increase from cycle to cycle (progressive
     overload) — e.g. Cable Bar Lat Pulldowns 115 → 115 → 115 → 125 → 115 lb,
     Chest Press variants 50 → 70 → 70 → 100 → 60 lb across C1–C5.
   - Exercise names deliberately match the mapping tables in
     `utils/imageMapper.ts` (`getExerciseGif`) so these sessions render gif
     thumbnails in the Templates list.

## 13. Running Locally

```bash
cp .env.example .env   # fill in POSTGRES_PASSWORD and JWT_SECRET
docker compose up
# db:        localhost:5432
# backend:   http://localhost:5001/api
# frontend:  http://localhost:8081 (Expo web)
```

The backend container auto-runs migrations and seeds global templates +
exercises on every start (see §11 — all seed scripts skip already-existing
rows by name). To promote the first non-first-registered user to admin:
`docker compose exec backend node prisma/promote-admin.js <username>`.

For native (iOS/Android) development, run the frontend outside Docker
(`cd frontend && npm install && npx expo start`) and point
`EXPO_PUBLIC_API_URL` at a reachable backend host (not `localhost`, if testing
on a physical device).

## 14. Production Deployment (NAS)

There is a second, separate deployment running on a home NAS — this is what
actually serves **https://ff.sl8er.net** (the app's real production URL) and
has its own independent Postgres data, entirely distinct from the local
docker-compose stack on any dev machine.

- **Host**: `192.168.128.40`, reachable via the SSH alias `fitfinity-nas`
  (see `~/.ssh/config`, key `~/.ssh/id_ed25519_fitfinity_nas`). Also runs
  several unrelated containers (Plex, *arr apps, Homepage, a separate
  "Homefinity" app, Nginx Proxy Manager, Portainer) — `fitfinity_*` containers
  are only one project among many on this box.
- **Compose file** lives at `/volume1/Apps/FitFinity` on the NAS itself,
  also reachable from the dev Mac via an SMB share at `/Volumes/Apps/FitFinity`
  when mounted (Finder → Cmd+K) — but that mount is **not persistent**
  (nothing auto-mounts it), so don't assume it's there; a plain `ssh
  fitfinity-nas` session reaching the same path directly is more reliable and
  is what the transfer method below uses instead.
- **`frontend/Dockerfile` and `frontend/nginx.conf` exist ONLY on the
  NAS** (`/volume1/Apps/FitFinity/frontend/`) — they are not tracked in this
  git repo and not present in the local dev tree, unlike the local
  docker-compose setup which runs the frontend directly via `node:20-slim` +
  `expo start --web` with no Dockerfile at all (see §13). **Any file-sync
  step that replaces the whole `frontend/` directory on the NAS will delete
  these two files** — copy them back from the previous version (or keep a
  backup dir around) before rebuilding, or the frontend image build will fail
  outright with a missing-Dockerfile error.
- **docker-compose.yml differs from the dev-machine one**: ports are
  `5011:5001` (backend) and `8082:80` (frontend, a two-stage build — `expo
  export --platform web` then served statically by `nginx:1.27-alpine`, not
  `expo start --web`); Postgres has no exposed host port; the backend
  `command` still runs `prisma migrate deploy && npm run seed && npm start`
  on container start, but schema changes (`prisma db push`) are applied
  manually and deliberately **not** automated. Nginx Proxy Manager
  reverse-proxies `ff.sl8er.net` to the frontend/backend ports.
- **Both backend and frontend images are built via `COPY . .` in their
  Dockerfiles — not bind-mounted.** A plain `docker restart`/`docker compose
  restart` on the NAS reuses the already-built image and will **not** pick up
  new source files (including new seed scripts or code changes). To ship a
  change there:
  1. **Transfer changed files with `tar` piped over `ssh`, not `rsync`.**
     Plain single-command SSH execution (`ssh fitfinity-nas "..."`) works
     fine, but this NAS's SSH login wraps sessions through a UGREEN
     privilege-check step (`ug_start_server`) that breaks rsync's own
     remote-shell protocol (`rsync --server ...`) with an `invalid path`
     error — confirmed 2026-08-29, don't waste time re-diagnosing this if it
     recurs, just use tar:
     ```bash
     cd frontend && tar czf - --exclude node_modules --exclude .expo --exclude .git . \
       | ssh fitfinity-nas "rm -rf /volume1/Apps/FitFinity/frontend_new && mkdir -p /volume1/Apps/FitFinity/frontend_new \
         && tar xzf - -C /volume1/Apps/FitFinity/frontend_new"
     # copy back the NAS-only files the tar above can't include (see bullet above)
     ssh fitfinity-nas "cp /volume1/Apps/FitFinity/frontend/Dockerfile /volume1/Apps/FitFinity/frontend/nginx.conf /volume1/Apps/FitFinity/frontend_new/"
     # atomic swap, keeping the old tree as a rollback
     ssh fitfinity-nas "cd /volume1/Apps/FitFinity && rm -rf frontend_backup && mv frontend frontend_backup && mv frontend_new frontend"
     ```
  2. **Clean macOS AppleDouble sidecar files before/after transfer.** The
     local dev tree lives on a Google-Drive-synced folder; macOS's `tar`
     silently packs a hidden `._<name>` shadow file alongside every file
     that carries extended attributes (which Drive-sync sets on nearly
     everything), and Metro's bundler will try to parse one of these binary
     files as source and fail with a baffling
     `SyntaxError: .../.__layout.tsx: Unexpected character` (confirmed
     2026-08-29 — this is almost certainly also what caused an earlier
     "transient" bundling error seen during local `docker compose` testing,
     not a real code bug). Before building, run:
     `ssh fitfinity-nas "find /volume1/Apps/FitFinity/frontend -name '._*' -delete"`
  3. Rebuild+recreate the affected service: `docker compose up -d --build
     <service>` run on the NAS (e.g. `ssh fitfinity-nas "cd
     /volume1/Apps/FitFinity && docker compose up -d --build frontend"`).
     **Expect it to also recreate `db` and `backend` even when only
     `frontend` was targeted** — this compose version seems to recreate the
     whole dependency graph rather than just the named service; this is
     harmless (named volumes `postgres_data`/`backend_uploads` aren't
     touched, so no data loss — confirmed by the idempotent seed script
     logging "already exists" for all rows after a recreate) but don't be
     alarmed by it. If the build fails partway through, the previously
     running containers are untouched (compose only recreates on a
     successful image build), so a failed attempt is safe to retry.
     For something idempotent and low-risk like a seed script, `docker cp`
     the file directly into the already-running container and `docker exec`
     it instead — applies the change immediately with no rebuild/downtime.
- **Any change made to the local dev docker-compose stack (seed data, schema,
  env vars, etc.) does not exist on the NAS until separately synced and
  applied there.** Always treat "does the live app at ff.sl8er.net reflect
  this?" as a distinct question from "does `docker compose up` locally
  reflect this?".
- **A "Network Request Failed" report from a phone on the same home WiFi as
  the NAS is not necessarily an app bug.** Seen twice in the wild
  (2026-08-29): once traced to a stale Android build whose baked-in API URL
  predated pointing at `ff.sl8er.net` (see §15 — a rebuild fixed it); once
  traced to the phone's own DNS resolution misbehaving on that network
  specifically (confirmed by the same login succeeding immediately over
  cellular data with no app/server change at all — a device/network
  settings issue, not something fixable from this codebase or the NAS
  config). When this comes up, check in this order: (1) is the backend
  actually reachable from *outside* the NAS's LAN right now (`curl
  https://ff.sl8er.net/api/...` from any other machine) — if yes, the
  server's fine and the problem is specific to that device/network; (2) has
  the Android app been rebuilt since `eas.json`'s `EXPO_PUBLIC_API_URL` was
  last correct (see §15); (3) ask the reporter to retry on cellular data —
  if that works, it's a home-network/device DNS issue, not this app.

## 15. Android App Distribution (EAS Build)

The web deployment (§14) and the native Android app are two **entirely
separate delivery pipelines** — updating one does not touch the other.
Critically: **a pure-JS/TypeScript change reaches Android users only after a
fresh build is installed; it does not auto-update.** This project has no
`expo-updates`/OTA mechanism configured, so unlike the web frontend (which
serves whatever JS is currently on the server on every page load), a native
build's JS is compiled into the APK at `eas build` time and frozen there.
Forgetting this was the source of real confusion this session — the sync
fixes, the calendar fix, and the image-upload fixes were all live on the web
long before an Android rebuild made them reach the phone.

- **`eas.json`** defines three build profiles (`development`, `preview`,
  `production`), all currently setting the same
  `EXPO_PUBLIC_API_URL: https://ff.sl8er.net/api` — i.e. every profile
  points at production; there's no profile that builds against a local dev
  backend (see §13's native-dev note for that case, which bypasses `eas
  build` entirely via `npx expo start`).
- **`preview`** is the profile actually used for distributing a real,
  installable build to the phone: `buildType: apk`, `distribution:
  internal`. Build it with:
  ```bash
  cd frontend && npx eas-cli build --platform android --profile preview --non-interactive
  ```
  This runs on Expo's cloud build servers (not locally) and takes roughly
  10–15 minutes; `eas-cli` on the dev Mac is already authenticated as
  `adam@sl8er.net` (account `nfinitys-organization`), so no login step is
  needed. The command's final output is a `https://expo.dev/accounts/.../builds/<uuid>`
  link — open that link (or its QR code) directly on the Android device to
  download and install the APK, replacing whatever was there before.
- **When a rebuild is actually required** — any change to a **native
  module** (a new/changed entry under `dependencies` in `package.json` that
  isn't pure JS, e.g. `expo-image`, `@react-native-async-storage/async-storage`,
  `@react-native-community/netinfo`) needs a fresh build; it cannot take
  effect by editing source alone. A change confined to `.ts`/`.tsx` files
  using already-installed native modules does **not** strictly require a
  rebuild for *correctness* on native, but since there is no OTA mechanism,
  it still won't reach an already-installed phone until the next rebuild —
  in practice, ship an Android rebuild alongside any fix the phone needs to
  actually see, even a pure-JS one.
- **The web deploy (§14) is not a substitute for this and vice versa** — a
  fix needs both a NAS redeploy (for `ff.sl8er.net`) and a fresh EAS build +
  reinstall (for the phone) to be live everywhere. This session shipped
  several fixes where only the web side was initially redeployed, which
  produced confusing "it works on the website but not the phone" reports
  that were really just "the phone hasn't gotten the update yet," not a
  platform-specific bug — always double check this distinction before
  chasing what looks like an Android-only issue.
