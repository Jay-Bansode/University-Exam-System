# University Examination Management System

A multi-tenant examination management system for an affiliated university and the
colleges affiliated to it, modelled on the [University of Mumbai](https://mu.ac.in/).

The university publishes a central curriculum and controls when exam registration opens.
Each affiliated college teaches that curriculum and manages its own students and staff,
and no college can see another college's data.

> **Live demo:** **https://university-exam-system-one.vercel.app**
> — sign in from the demo panel; no account needed.
> The API sleeps after 15 minutes idle, so the first request may take up to a minute.

---

## Roles

| Role | Can do |
|---|---|
| **University admin** | Manage colleges and their admins, own the master syllabus, open and close exam windows, view cross-college statistics |
| **College admin** | Choose which streams the college offers; create faculty, clerk, and student accounts |
| **Faculty** | Activate subjects from the university catalogue for the current semester |
| **Clerk** | Search students, verify or reject exam forms, approve profile-correction tickets |
| **Student** | Fill and submit the exam form, print it, raise correction tickets |

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · TanStack Query — Express 5 · Mongoose 9 ·
Zod 4 · MongoDB — Vitest · ESLint · Prettier

## Running it locally

Requires Node.js 20.11+ and Docker.

```bash
git clone <this-repo>
cd university-exam-system

docker compose up -d                 # MongoDB on :27017
npm install

cp server/.env.example server/.env         # defaults already point at local MongoDB
cp client/.env.example client/.env.local

npm run dev:server                   # API    → http://localhost:5000
npm run dev:client                   # client → http://localhost:5173
```

Confirm the API is healthy:

```bash
curl http://localhost:5000/api/health
```

### Other commands

```bash
npm test              # server tests
npm run build         # build all three workspaces
npm run lint          # ESLint across the monorepo
npm run format        # Prettier
```

## Layout

```
shared/   types and academic rules used by both sides
server/   Express API — config, models, services, controllers, routes, middleware
client/   React SPA — api, features by role, routes, styles
```

## Documentation

**[PROJECT.md](PROJECT.md)** is the single source of truth: architecture, the data model,
the tenant-isolation strategy, every design decision with its rationale, the phase
tracker, and the deployment runbook.

## Status

**All nine phases complete and deployed**, 230 tests passing. Photograph uploads are
configured and the Cloudinary round trip is verified in production. See the phase tracker
in [PROJECT.md](PROJECT.md#7-phase-tracker).

| Piece | Where |
|---|---|
| Client | [university-exam-system-one.vercel.app](https://university-exam-system-one.vercel.app) (Vercel) |
| API | [ues-api.onrender.com](https://ues-api.onrender.com/api/health) (Render) |
| Database | MongoDB Atlas M0, Mumbai |
| Images | Cloudinary, signed direct upload |

### How an exam form comes to exist

Five roles each contribute one step, and none can do another's job:

1. **University admin** publishes the syllabus for a stream and semester, and opens the
   registration window.
2. **College admin** enrols the student into a stream the college offers.
3. **Faculty** choose which of the university's subjects this college actually runs.
4. **Student** registers for a subset of those, inside the open window, then prints the
   form.
5. **Clerk** verifies it against the student's documents, or sends it back with a written
   reason the student can act on.

A student's name, date of birth and photograph are printed on their marksheet, so those
are not editable directly. The student raises a correction ticket, is told exactly which
documents to bring to the office, and a clerk approves it after seeing them.

The university admin sees registration progress across every college, including how many
students have not started their form at all.

### Tenant isolation

Each college is a tenant, and the isolation is enforced in three layers rather than one:

1. Middleware sets the caller's college from the **verified JWT only** — never from a
   request body, query string, or header.
2. A `scopeFilter` helper injects that college into every query against a college-owned
   collection. Chosen over a Mongoose hook, which `aggregate` and `bulkWrite` bypass.
3. Tests sign in as one college and attempt to read the other's records by id, expecting
   a **404** — not a 403, because a 403 would confirm the record exists.

Sign in as both colleges' clerks on the demo panel to see it.
