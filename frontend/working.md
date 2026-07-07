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

## 2. Tech Stack

**Frontend** (`frontend/`)
- Expo SDK 55, `expo-router` ~55 (file-based routing), React 19.2, React Native 0.83
- `react-native-calendars`, `react-native-gifted-charts` (LineChart/BarChart), `react-native-svg`
- `lucide-react-native` for icons
- `expo-secure-store` for token storage on native; `localStorage` on web
- `expo-image-picker` for exercise photo uploads
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
    ├── components/ChangePasswordModal.tsx  # shared self-service / admin-reset password modal (see §11)
    ├── context/
    │   ├── AuthContext.tsx     # JWT/session state + route guarding
    │   └── ThemeContext.tsx    # light/dark/system theme
    ├── database/
    │   ├── api.ts              # fetch wrappers for every backend endpoint; offline cache/queue wiring (see §8)
    │   └── db.ts                # LEGACY — pre-migration local SQLite schema (dead code, see §9)
    ├── services/
    │   ├── offlineSync.ts       # AsyncStorage cache + sync queue backing database/api.ts (see §8)
    │   └── CloudSyncService.ts  # LEGACY — mock Google Drive backup/restore (dead code, see §9)
    ├── utils/
    │   ├── alert.ts             # cross-platform alert/confirm (native Alert vs window.alert/confirm)
    │   └── imageMapper.ts       # maps exercise names → bundled gif/webp assets
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
- No client-side app-state store (no Redux/Zustand/React Query) — every screen re-fetches on focus via `useFocusEffect`/`useIsFocused`. There is a persistent offline cache/sync queue for logs/templates/exercises, though — see §8.

## 8. Offline Support & Sync (`services/offlineSync.ts`)

Added 2026-07-05, scoped deliberately to **workout logging**, not full offline
CRUD everywhere (exercise/template authoring and admin actions still require
a live connection). The exercise library and templates are cached read-only
for offline *viewing*; workout logs support full offline create/edit/delete
via a replay queue. Two native modules back this: `@react-native-async-storage/async-storage`
(persistent JSON cache/queue) and `@react-native-community/netinfo`
(connectivity-change detection).

**Read-through caching** — `fetchExercises`, `fetchTemplates`, and `fetchLogs`
in `database/api.ts` each try the network first; on success they write the
response into an AsyncStorage cache key (`offline_cache_exercises`/`_templates`/`_logs`)
before returning it; on a genuine network failure (`fetch` throwing a
`TypeError` — the cross-platform signal for "couldn't reach the network at
all", as opposed to a reachable server returning an error status) they
return the last cached copy instead of throwing. `fetchTemplate(id)` and
`fetchLog(id)` (singular) fall back to finding the row inside the cached
plural list. This means every screen that already called these functions
(Log, Calendar/History, Stats/Dashboard, Exercises, Templates, the
template-editor/active-workout exercise pickers) got offline reads for free,
with no changes to the screens themselves.

**Write queueing** — `createLog`/`updateLog`/`deleteLog` attempt the real
network call first; on a network-failure they enqueue the action instead of
throwing, and return a synthetic result so calling code (`active-workout.tsx`)
can proceed as if it succeeded. A locally-created, not-yet-synced log is
given a **negative id** (real server ids are always positive) — this is the
key trick that lets editing or deleting a log that was itself created
offline just mutate or cancel its still-queued `create` action in place,
without ever needing a server id that doesn't exist yet. `fetchLog`/`updateLog`/`deleteLog`
all short-circuit around the network entirely for negative ids.

**The queue** (`offline_queue` in AsyncStorage) is a list of `{create |
update | delete}` actions. `fetchLogs()` merges it with the last-cached
server logs (`getMergedLogs`) so a queued log shows up in the Log
tab/Calendar/Stats immediately, marked `_pendingSync: true` (rendered as a
small cloud-off icon in the Log tab, plus a dismissable "N workouts saved
offline" banner with a manual **Sync Now** button).

**Sync trigger** — `startOfflineSync()` (called once from `app/_layout.tsx`)
watches `NetInfo` for an offline→online transition and calls `syncNow()`
automatically; `_layout.tsx` also calls `syncNow()` once at app startup as a
fallback for a queue left over from being closed while offline (a
transition-based listener alone wouldn't catch that). `syncNow()` replays
the queue in order against the real endpoints; if an action fails with
another network error the flush stops and retries next time, but a
server-rejected action (e.g. updating/deleting a log that's gone for some
other reason) is dropped with a console warning rather than blocking the
rest of the queue forever.

**Known limitation**: caches only cover the *last successful* fetch per
user/device — a phone that has never been online for a given account has
nothing to show offline yet (expected: first login always requires
connectivity). Two devices editing/deleting the same log while both offline
independently is not reconciled beyond last-write-wins-by-replay-order; this
wasn't a design goal for the current single-user-per-phone use case.

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

## 11. Key User Flows

- **Auth**: `login.tsx` toggles between login/register, both hitting the same form; success calls `AuthContext.signIn`, which persists the token and lets the route-guard effect push into `(tabs)/`.
- **Build a routine**: Templates tab → New/Edit → `template-editor.tsx` — add exercises from the full Exercise Library picker (searchable, see §9), set target sets/reps/weight per set (reps/weights stored as comma-joined strings to allow per-set targets), reorder with up/down chevrons, optionally mark Global (admin only), Save → `POST/PUT /api/templates`. `getRepList`/`getWeightList` always pad or truncate the reps/weight strings to exactly `target_sets` entries, so the number of rows shown here always matches `target_sets` — the same field `active-workout.tsx` loops over when expanding a template into a workout. (This wasn't always true: `getRepList` used to just split on comma with no padding, so a single-value reps string like `"15"` rendered only 1 row regardless of `target_sets`, silently drifting the two apart if someone clicked "Add Set" to compensate for the missing rows — each click bumped the real `target_sets` further past its intended value while only growing the reps list to match the rows they could see. Fixed 2026-07-05; any template edited under the old code before then may still have a `target_sets` that overshoots its actual intended set count and needs a one-time manual correction.)
- **Search & delete routines**: Templates tab has a search box filtering by routine name, description, or any contained exercise name (client-side only, no backend search endpoint); each card has Edit/Copy/Delete actions plus Start — Delete asks for confirmation (`confirmAction` from `utils/alert.ts`) then calls `DELETE /api/templates/:id`. As with Edit, the button is shown on every card regardless of ownership; the backend is the actual authority and returns 403 if the caller isn't the owner or an admin managing a global routine.
- **Run a workout**: Templates tab → Start (or Log tab → New Workout for a blank session) → `active-workout.tsx` loads either a template (`loadTemplate`, expanding target sets into editable rows) or an existing log (`loadWorkoutLog`, for editing history). Tracks completed/weight/reps per set, computes live session totals, captures a date/time and a 1–5 emoji sentiment, and warns on back-navigation with unsaved changes before `POST/PUT /api/logs`.
- **Review history**: Log tab shows a sortable/scrollable table of all logs with delete support; History (calendar) tab marks every logged date on a month view and shows that day's routine name, sentiment, completed load, and a per-exercise set breakdown when tapped — both tabs read from the same `fetchLogs()` call, just presented differently.
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
- **Compose file** lives on an SMB share mounted locally (on the dev Mac) at
  `/Volumes/Apps/FitFinity`, edited from there and built against the NAS's
  Docker daemon (`docker compose` for this project is effectively run against
  `DOCKER_HOST=ssh://fitfinity-nas`, or the share is used as the build context
  when composing from the NAS side).
- **docker-compose.yml differs from the dev-machine one**: ports are
  `5011:5001` (backend) and `8082:80` (frontend, served as a static build
  behind its own Dockerfile, not `expo start --web`); Postgres has no exposed
  host port; the backend `command` still runs `prisma migrate deploy && npm
  run seed && npm start` on container start, but schema changes
  (`prisma db push`) are applied manually and deliberately **not** automated.
  Something in front (Nginx Proxy Manager, presumably) reverse-proxies
  `ff.sl8er.net` to the frontend/backend ports.
- **Both backend and frontend images are built via `COPY . .` in their
  Dockerfiles — not bind-mounted.** A plain `docker restart`/`docker compose
  restart` on the NAS reuses the already-built image and will **not** pick up
  new source files (including new seed scripts or code changes). To ship a
  change there:
  1. `rsync` the changed directory (e.g. `backend/`) to `/Volumes/Apps/FitFinity/<dir>/`.
  2. Either rebuild+recreate the affected service (`docker compose up -d --build <service>`,
     run on/against the NAS), or, for something idempotent and low-risk like a
     seed script, `docker cp` the file directly into the already-running
     container and `docker exec` it — this applies the change immediately
     without a rebuild/restart/downtime. From the dev Mac this can be done
     without an interactive SSH session via
     `DOCKER_HOST=ssh://fitfinity-nas docker cp/exec ...`.
- **Any change made to the local dev docker-compose stack (seed data, schema,
  env vars, etc.) does not exist on the NAS until separately synced and
  applied there.** Always treat "does the live app at ff.sl8er.net reflect
  this?" as a distinct question from "does `docker compose up` locally
  reflect this?".
