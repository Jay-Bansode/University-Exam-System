# PROJECT.md — University Examination Management System

> **This file is the single source of truth.** Anyone — a new teammate or a fresh Claude
> Code session — should be able to read this and continue the work without replaying the
> conversation that produced it. Keep it updated at the end of every phase and whenever a
> decision changes.

---

## 1. Overview and current status

A multi-tenant examination management system for an **affiliated university** and the
**many colleges affiliated to it**, modelled on the University of Mumbai (`mu.ac.in`).
The university sets a central curriculum and controls exam registration windows;
each affiliated college teaches that curriculum and manages its own students and staff.

**Current status: all nine phases complete, deployed, and verified in production
on 2026-09-13.**

- Client — https://university-exam-system.vercel.app (Vercel)
- API — https://ues-api.onrender.com (Render)
- Database — MongoDB Atlas M0, `ap-south-1`, seeded with the two-college demo data
- Images — Cloudinary, cloud `jvqvvl3p`; the signed direct upload is **verified live**

No deferred setup remains. Section 9 records the runbook as actually executed, including
two corrections to what was originally written there.

The complete registration cycle now works end to end: a student fills and submits a form,
a clerk verifies it or sends it back with a reason, the student corrects and resubmits,
and the form is verified and printed.

### Why this project exists

It is a portfolio project built to support a career move from **.NET developer to MERN
stack developer**. Three goals, in priority order:

1. **Deployed and publicly linkable** — a live URL a recruiter can click.
2. **Interview-defensible** — every design decision has a recorded reason (section 10).
3. **Realistic in scope** — a real workflow with real constraints, not a to-do app.

### Author background (shapes how this repo is written)

~2 years at Invimatic Technologies: ASP.NET MVC, Web Forms, WPF/MVVM, .NET Windows
services, with JavaScript/TypeScript front ends. Strong on identity and SSO (SAML,
OAuth 2.0, JWT, Azure AD) and on remediating security defects. Prior exposure to a
**multi-tenant enterprise platform**, which is why multi-tenancy is the centrepiece here
rather than an afterthought.

Concepts already known, and their equivalents in this stack:

| .NET | Here |
|---|---|
| ASP.NET MVC controller | Express route handler + controller module |
| Action filter / middleware | Express middleware (`requireAuth`, `requireRole`, `tenantScope`) |
| Entity Framework / DbContext | Mongoose models and a shared connection pool |
| Model binding + DataAnnotations | Zod schema parsing at the route boundary |
| WPF MVVM data binding | React state and component composition |
| `async`/`await` over threads | `async`/`await` over a single-threaded event loop |
| Relational normalization | Document modeling: embed vs. reference |

---

## 2. Tech stack

Versions are pinned deliberately. Do not upgrade casually; see the TypeScript note.

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 24.14.1 | Current LTS line, native `--env-file` support |
| Language | TypeScript | **~6.0.3** | See the constraint below |
| API | Express | 5.2.1 | Async errors auto-forward to the error handler; no `asyncHandler` needed |
| ODM | Mongoose | 9.9.5 | Schema validation and populate, closest thing to an ORM here |
| Validation | Zod | 4.5.4 | Runtime validation that also produces the TypeScript type |
| UI | React | 19.2.8 | Baseline requirement for MERN roles |
| Build | Vite | 8.2.2 | Fast dev server, simple static output for Vercel |
| Routing | React Router | 7.18.3 | Standard SPA routing |
| Server state | TanStack Query | 5.102.8 | Caching, retries, and loading state without hand-rolled `useEffect` |
| Styling | Tailwind CSS | 4.3.3 | v4 configures in CSS, no `tailwind.config.js` |
| HTTP client | axios | 1.20.0 | Interceptors, needed for silent token refresh in Phase 1 |
| Tests | Vitest + Supertest | 5.0.0 / 7.1.4 | Same config style as Vite; Supertest drives the app without a port |
| Lint / format | ESLint 10 + Prettier 3 | 10.10.0 / 3.9.6 | Standard |

### ⚠️ TypeScript is held at 6.x on purpose

TypeScript **7.0.2** is published as `latest`. It is the new native (Go) compiler.
**`typescript-eslint@8.69.0` declares a peer range of `>=4.8.4 <6.1.0`**, so installing
TypeScript 7 breaks `npm install` with an `ERESOLVE` error and leaves the project without
type-aware linting.

**Decision: pin `typescript@~6.0.3`** — the newest version the lint toolchain accepts.
Revisit once `typescript-eslint` ships TypeScript 7 support.

Related: TypeScript 6 deprecates `baseUrl` (removed in 7). `client/tsconfig.json`
therefore uses `paths` **without** `baseUrl`, which has resolved relative to the config
file since TypeScript 5.

### Hosting

| Piece | Host | Notes |
|---|---|---|
| Client | Vercel | Static build, free |
| API | Render | Free tier **sleeps after 15 min idle, ~1 min cold start**; filesystem is **ephemeral** |
| Database | MongoDB Atlas M0 | 512 MB, 500 connections, ~100 ops/sec, free forever |
| Images | Cloudinary | Free tier; required because Render's disk does not persist |

Render's ephemeral disk is the reason **no uploaded file is ever written locally**.

---

## 3. Architecture

```
university-exam-system/
├── PROJECT.md                  ← this file
├── docker-compose.yml          ← local MongoDB (replica set) for development
├── tsconfig.base.json          ← compiler options shared by all three workspaces
├── shared/                     ← types and rules used by BOTH client and server
│   └── src/{roles,academics,api}.ts
├── server/
│   ├── src/
│   │   ├── config/             env validation, db connection, CORS
│   │   ├── models/             Mongoose schemas                    (Phase 1+)
│   │   ├── controllers/        HTTP in, HTTP out                   (Phase 1+)
│   │   ├── services/           business logic, no req/res          (Phase 1+)
│   │   ├── routes/             the API's route table
│   │   ├── middleware/         error handler; auth + tenant scope  (Phase 1+)
│   │   ├── validators/         Zod schemas                         (Phase 1+)
│   │   ├── utils/              AppError, response envelope helpers
│   │   ├── seed/               demo data                           (Phase 1+)
│   │   ├── app.ts              builds the Express app (no listen)
│   │   └── index.ts            connect → listen → graceful shutdown
│   └── tests/
└── client/
    └── src/
        ├── api/                axios instance + typed query hooks
        ├── config/             compile-time environment
        ├── styles/             Tailwind entry, design tokens, print rules
        ├── features/           one folder per role                 (Phase 1+)
        ├── routes/             router + role-protected routes      (Phase 1+)
        └── App.tsx
```

### Three workspaces, one repository

npm workspaces. `shared` is compiled to `dist/` and consumed by both sides, so a role
name or a semester rule is defined exactly once. `server` and `client` each run
`npm run build --workspace=@ues/shared` in a `predev`/`prebuild` hook, so the shared
build is never stale.

### Controllers vs. services

Controllers translate HTTP into domain calls. Services hold the logic and never touch
`req` or `res`, so they are unit-testable without HTTP. This is the layering already
familiar from ASP.NET, and it is the piece most often missing from junior MERN
portfolios.

### The response envelope

Every endpoint returns the same shape, defined in `shared/src/api.ts`:

```ts
{ success: true,  data: T }
{ success: false, error: { code, message, details? } }
```

`code` is a stable machine-readable string; `message` is for humans and may change.
Routes write bodies only through `sendSuccess` / `sendFailure`, so the shape cannot
drift. The client unwraps it once in `api/client.ts` and callers receive `data` directly.

---

## 4. Data model

**Not yet implemented — this is the agreed design for Phase 1 onward.**

The defining split is **university-owned** (global) versus **college-owned** (tenant).

### University-owned — no `collegeId`

| Collection | Purpose |
|---|---|
| `College` | name, code, address, affiliation date, `isActive` |
| `Stream` | Computer, IT, Mechanical…, with `programType` (`BE` \| `Diploma`) |
| `Subject` | master syllabus entry keyed to stream + semester. **Only the university admin may create or delete one.** |
| `ExamWindow` | academic year + semester + open/close dates. Colleges cannot accept forms outside an open window. |

### College-owned — every document carries `collegeId`

| Collection | Purpose |
|---|---|
| `User` | all five roles in one collection with a `role` discriminator; `studentProfile` sub-document only for students. University admins have `collegeId: null`. |
| `CollegeStream` | which university streams this college actually offers |
| `SemesterOffering` | subjects faculty activated for a live semester at this college |
| `ExamForm` | a student's registration: subjects, `status` (`draft` → `submitted` → `verified` \| `rejected`), form number |
| `CorrectionRequest` | student ticket with an allotted number, requested changes, status, and a **required** rejection reason |
| `AuditLog` | who changed what, when |

### Modeling decisions worth defending

- **One `User` collection, not five.** Authentication is identical across roles and the
  role-specific fields are few. Five collections would mean five lookups on every login.
- **`Subject` is global, `SemesterOffering` is per-college.** This is what makes
  "faculty picks from the admin's list" possible without letting faculty create subjects.
  The permission boundary is a data boundary, not just a UI one.
- **Lateral entry (DSE) is computed, not hardcoded.** A student has an `entryType` of
  `regular` or `lateral`. Lateral-entry students skip semesters 1 and 2 and begin at
  semester 3, completing six semesters of an eight-semester degree. The valid range comes
  from `semesterRangeFor()` in `shared/src/academics.ts`.

---

## 5. Tenant isolation

The security core of the project. **Three layers, because one is not enough.**

1. **`tenantScope` middleware** sets `req.collegeId` from the *verified JWT only* —
   never from a body, query string, or header. A client cannot nominate its own tenant.
2. **A `scopedQuery` helper** in the service layer injects `collegeId` into every read
   and write against a college-owned collection. Explicit and greppable, chosen over a
   Mongoose `pre` hook because hooks are silently bypassed by `aggregate` and `bulkWrite`.
3. **Cross-tenant leak tests** authenticate as college A and attempt to read and mutate
   college B's records by id, expecting **404**. These tests are the actual proof.

**Cross-tenant reads return 404, not 403.** A 403 would confirm the id exists somewhere,
which is itself a leak. Encoded in `AppError.notFound()`.

The university admin deliberately bypasses the scope. That bypass lives in exactly one
reviewable place, which is the point of centralising it.

---

## 6. Decision log

| Date | Decision | Alternatives rejected | Why |
|---|---|---|---|
| 2026-09-06 | Multi-college university, not a single college | Single-college system | Matches the real Mumbai University model, and multi-tenancy is the strongest interview topic available. Connects to the author's Invimatic experience. |
| 2026-09-06 | 5 roles: university admin, college admin, faculty, clerk, student | 4 roles per the original notes | Someone must own the university tier; a single admin over 800+ colleges is not credible. |
| 2026-09-06 | University owns the syllabus; colleges consume it | Per-college syllabus | Reflects an affiliated university. Also creates the clean global-vs-tenant split the whole design rests on. |
| 2026-09-06 | Tenant derived from the user account | College picker at login; subdomain per college | Anything client-supplied must be re-verified anyway. Subdomains need wildcard DNS and cross-subdomain cookies, which is real work on free hosting. Recorded as deferred. |
| 2026-09-06 | Custom JWT: 15-min access token + 7-day httpOnly refresh cookie | Auth0/Clerk; express-session | The author already knows JWT and OAuth from work. Best interview story, no vendor limits, and refresh tokens are stored hashed so they can be revoked. |
| 2026-09-06 | React + Vite + TypeScript | Plain JS; Next.js | TypeScript is natural coming from C# and is on most job specs. Next.js would absorb the Express layer and blur the "E" and "N" in MERN. |
| 2026-09-06 | Vercel + Render + Atlas | All-Render; Railway/Fly | All free. Constraints are documented rather than discovered late. |
| 2026-09-06 | Monorepo with npm workspaces | Two repositories | One link on a resume; shared types defined once. |
| 2026-09-06 | **OCR marksheet scanning dropped** | Tesseract.js; Google/Azure Vision | Highest complexity in the original notes, poor demo quality when self-hosted, and interviewers rarely probe it. |
| 2026-09-06 | Marks and marksheets deferred; exam registration first | Both at once | Keeps Phase 1–9 shippable. Registration is the coherent core. |
| 2026-09-06 | No public signup; admins create accounts | Public student signup | Matches a real college and removes an abuse surface on a public demo. Seeded demo logins solve recruiter access instead. |
| 2026-09-06 | Cloudinary for images | Local disk; base64 in Mongo; S3 | Render's disk is ephemeral, so local is impossible. Base64 would consume the 512 MB Atlas quota. S3 needs a card. |
| 2026-09-06 | **TypeScript pinned to ~6.0.3** | TypeScript 7.0.2 (`latest`) | `typescript-eslint@8.69.0` peer-requires `<6.1.0`. TypeScript 7 breaks install and type-aware linting. Revisit when supported. |
| 2026-09-06 | Deploy an empty app in Phase 0 | Deploy once features exist | Surfaces CORS, cookie, and env-var faults while there is almost no code to blame. |
| 2026-09-06 | Single-node replica set for local Mongo | Standalone `mongod` | Atlas is always a replica set. Transactions and change streams do not work standalone, so a standalone local DB lets code pass locally and fail in production. |

---

## 7. Phase tracker

| Phase | Scope | Status |
|---|---|---|
| **0** | Foundation, health endpoint, deploy both halves | ✅ **Done and deployed** |
| **1** | Auth, five roles, tenant scoping, seeded demo logins | ✅ **Done and deployed** |
| **2** | University admin: colleges and their admins | ✅ **Done and deployed** |
| **3** | University admin: master syllabus and exam windows | ✅ **Done and deployed** |
| **4** | College admin: people and programmes | ✅ **Done and deployed** |
| **5** | Faculty: semester offerings | ✅ **Done and deployed** |
| **6** | Student: the exam form (the core feature) | ✅ **Done and deployed** |
| **7** | Clerk: verification and student search | ✅ **Done and deployed** |
| **8** | Correction requests (ticketing) with Cloudinary uploads | ✅ **Done and deployed** — Cloudinary round trip verified live |
| **9** | Cross-college statistics, lazy loading, hardening | ✅ **Done and deployed** |

### Phase 0 — what was actually built

- npm workspaces monorepo: `shared`, `server`, `client`; shared `tsconfig.base.json`.
- `shared`: `Role` (5 roles), `ProgramType`/`EntryType`, semester rules including lateral
  entry, and the `ApiResponse` envelope. Const objects with derived union types rather
  than TS `enum`, because `enum` emits runtime JavaScript and defeats type stripping.
- `server`: env validation with Zod that **throws at boot** on bad config; Mongoose
  connection with a 10s server-selection timeout and a 10-connection pool; a credentialed
  CORS allowlist; `AppError` plus a central error handler covering Zod, Mongoose
  `CastError`, `ValidationError`, and duplicate-key 11000; `GET /api/health` reporting
  database state and uptime; graceful SIGTERM shutdown.
- `client`: Vite + React 19 + Tailwind 4; axios wrapper that unwraps the envelope and
  normalises every failure into one `ApiError`; TanStack Query with a 90-second timeout
  and backoff retries for Render cold starts; a responsive status page that explains a
  cold start instead of looking broken.
- `docker-compose.yml` running MongoDB 8 as a single-node replica set for local work.
- 5 passing tests covering the health payload, the 404 envelope, and CORS allow/deny.

### Phase 1 — what was actually built

**Server**

- `College`, `User`, `RefreshToken`, and `Stream` models. `Stream` is defined early
  because `studentProfile.streamId` references it, and an unregistered referenced model
  makes `populate()` throw. A `models/index.ts` barrel is imported by `app.ts` so every
  model is registered before any route runs.
- The tenancy invariant is enforced in a `pre('validate')` hook: a college-scoped role
  must have a `collegeId`, and a university admin must not.
- JWT access tokens (15 min, `sub`/`role`/`collegeId`, issuer and audience verified) plus
  opaque refresh tokens stored as SHA-256 hashes with a TTL index.
- **Refresh-token rotation with replay detection.** Each refresh issues a new token and
  revokes the old one. Presenting an already-rotated token revokes every session for that
  user, because two parties holding one token means one of them stole it.
- `requireAuth`, `requireRole`, and `tenantScope` as three separate middlewares, plus the
  `scopeFilter` / `scopeCreate` helpers.
- Routes: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`,
  `GET /auth/demo-accounts`, `GET /users`, `GET /users/:id`.
- `helmet`, `cookie-parser`, and rate limiting on the login route (10 failures per IP per
  15 minutes, disabled under test).
- Seed script creating two colleges with a full staff and student roster each.

**Client**

- Access token held in a module variable — never `localStorage`, so an XSS bug cannot
  read it. The httpOnly refresh cookie survives a reload and is exchanged for a new access
  token at start-up.
- axios interceptors: attach the token, and on a `TOKEN_EXPIRED` 401 refresh once and
  replay the request. Concurrent refreshes share one in-flight promise, because parallel
  rotations would trip the replay detector and sign the user out.
- `AuthProvider`, `useAuth`, and `ProtectedRoute` with per-role allowlists.
- Login page with a one-click demo panel covering all five roles across both colleges.
- Five role dashboards, each `React.lazy`-loaded into its own chunk.
- Signing out clears the React Query cache, so the next user on that tab cannot see the
  previous user's college data.

### Verified locally

```
shared build ✅   server typecheck ✅   server tests 230/230 ✅   client build ✅
ESLint ✅          Prettier ✅
```

Manually verified against a running server and MongoDB:

| Check | Result |
|---|---|
| Login returns user + access token, no refresh token in body | ✅ |
| Refresh cookie is `HttpOnly`, `Path=/api/auth` | ✅ |
| Wrong password and unknown account return byte-identical responses | ✅ |
| Refresh rotates the token | ✅ |
| Replaying a rotated token kills every session for that user | ✅ |
| Each clerk sees only their own college's 5 users | ✅ |
| University admin sees all 11 users | ✅ |
| Clerk fetching another college's student by valid id gets **404** | ✅ |
| Student calling `/users` gets **403** | ✅ |
| `collegeId` in a query string or header is ignored | ✅ |

### Phase 2 — what was actually built

**Server**

- Full college lifecycle: list with per-role headcounts, create, edit, activate and
  deactivate, delete, and create a college administrator.
- **Headcounts come from one aggregation**, not a query per college. Two round trips
  regardless of how many colleges exist, rather than N+1 — the difference between a page
  that stays fast at 800 affiliated colleges and one that does not.
- **Deactivating a college revokes its users' refresh tokens** as well as blocking login.
  Without that, anyone already signed in would keep working for days until their refresh
  token expired.
- `refreshSession` re-checks the college's status on every refresh, not only at login.
- **Deletion is refused once a college has users**, with a message pointing at
  deactivation instead. A cascade delete would silently destroy exam history.
- Administrator passwords are **generated server-side** with `crypto.randomInt` and
  returned exactly once. Only a bcrypt hash is stored, so the password cannot be
  retrieved again. The alphabet omits `0`/`O` and `1`/`l`/`I`, since a person reads this
  out to another person.
- Status lives on its own `PATCH /colleges/:id/status` route rather than as a field on the
  edit form, because signing out an entire college should not be a side effect of an
  untouched checkbox.

**Client**

- Colleges page: list with headcounts, create and edit dialogs, activate and deactivate
  with a confirmation naming how many users are affected, and delete offered only when a
  college has none.
- The generated password is shown once with a copy button and an explicit warning.
- Reusable `Modal`, `FormField`, and `Button` components, plus a `toFormErrors` helper
  that routes a 422's per-field details to the right input and anything else to the top
  of the form.
- Role-aware navigation tabs, shown only once a role has more than one destination.

### Phase 3 — what was actually built

**Server**

- Three new models: `Subject` (university-owned master syllabus), `ExamWindow`, and
  `SemesterOffering`. The offering schema is defined here, ahead of its Phase 5 screens,
  so the subject-deletion guard is real rather than silently counting zero.
- **The access split that defines the whole system.** Reading the syllabus is open to any
  signed-in user; writing is university-admin only. That single rule is what makes this an
  affiliated university rather than colleges each inventing their own curriculum.
- **Semester validity depends on the stream, not the request.** A BE has eight semesters
  and a Diploma six, so the Zod schema can only bound it at 8. The service loads the
  stream and rejects anything beyond that programme's count.
- Changing a stream's programme is refused when subjects already exist beyond the new
  semester count, which would otherwise strand them in a semester that no longer exists.
- Deleting a stream is refused when it has subjects or enrolled students; deleting a
  subject is refused when a college offering references it.
- **Publication is separate from the dates.** An unpublished exam window is never open,
  whatever its dates say, so a window can be drafted and reviewed in advance.
- Whether a window is open is computed server-side against the server's clock, never
  trusted from the browser — the same rule has to hold when Phase 6 accepts a submission.
- Deleting a currently-open window is refused, since students may be mid-submission.

**Client**

- Syllabus page: a stream list on the left, its subjects grouped by semester on the
  right. The semester dropdown offers only the semesters that stream actually has.
- Exam windows page with open, upcoming, closed, and draft states, and a confirmation
  before unpublishing a window that is open right now.
- `SelectField` component matching `FormField`'s error handling.
- `datetime-local` inputs convert properly between local wall-clock time and the API's
  UTC. Slicing the ISO string would shift every date by the viewer's offset — five and a
  half hours in India.

**Seed data**

Five streams and 19 subjects using real University of Mumbai codes (`CSC501`, `CSL502`,
`CSDLO5011`), plus two exam windows: semester 5 open now, semester 3 scheduled as a
draft. Seeded students are enrolled in Computer Engineering, so their syllabus is real.

### Phase 4 — what was actually built

**Server**

- `CollegeStream`, the first genuinely tenant-owned join: which university streams a
  college teaches. It stores only the reference, never a copy of the stream's name or
  semester count, so a college's idea of a branch cannot drift from the university's.
- Full roster management: create faculty, clerks and students; edit; deactivate and
  reactivate; issue a new password.
- **A college admin cannot create another college admin.** Those roles are absent from
  the request schema entirely, so the attempt fails validation before any handler runs.
  Only the university creates college admins, so a tenant cannot expand its own
  administration.
- **Student enrolment validates three things together**: the stream must be one this
  college offers, the programme is taken *from* that stream rather than supplied, and the
  semester must suit both the programme and the entry type. A Direct Second Year student
  begins at semester 3, so semesters 1 and 2 are rejected for them.
- Email is unique university-wide because it is the login identifier; roll numbers are
  unique per college, since two colleges legitimately reuse them.
- Removing a stream is refused while students are enrolled in it.
- A password reset revokes every session for that person — a reset usually means the
  account may be compromised, so leaving old refresh tokens valid would keep an intruder
  signed in.
- An admin cannot deactivate their own account, which would lock the college out of its
  own administration.

**Client**

- People page with role filters, name search, and per-person actions.
- Streams page for choosing from the university's published branches.
- The semester dropdown follows both the programme and the entry type, so an impossible
  semester cannot be picked. The server applies the same rule regardless.
- Generated passwords shown once, shared by the create and reset flows.

**Refactors done along the way**

- Removed a `fullName` virtual from the User schema. `Model.create()` does not return a
  type carrying virtuals, so every mapper was computing the name by hand anyway — in four
  places. It is now one `formatFullName` helper, and a full name is treated as a property
  of the response rather than of the document.
- `GET /users` now returns the shared `ManagedUser` shape, replacing a thinner
  server-side type that the client duplicated. One list representation instead of two.

### Phase 5 — what was actually built

**Server**

- Semester offerings: faculty compose them by selecting from the university's published
  subjects. **There is no route in this feature that creates a `Subject`**, so "faculty
  cannot invent a subject" is a property of the routing table rather than a check someone
  has to remember.
- `ExamForm` model defined here, ahead of its Phase 6 screens, so the withdrawal guard
  below is real rather than counting zero. Same reasoning as `SemesterOffering` in Phase 3.
- **Every chosen subject must belong to that stream *and* that semester.** The failure
  this prevents is quiet: a semester-3 subject stored in a semester-5 offering looks
  correct in the database and only surfaces when a student registers for a subject they
  are not taking.
- **A subject students have registered for cannot be withdrawn.** Adding is always safe;
  removing is not, because a submitted form points at subjects. The error names the
  subject codes and how many students are affected.
- Retired subjects are rejected, duplicates are rejected, and the offering must contain
  at least one subject.
- `PUT /offerings` is an upsert. There is exactly one offering per college, stream,
  semester and year, so "save what we teach for semester 5" is one intention rather than
  a create-or-update decision the caller has to make.
- A separate tenant-checked `available-subjects` endpoint, so the picker cannot show
  subjects for a branch this college does not teach.

**Client**

- Offerings page: pick a year, stream and semester, then tick subjects from the
  university's syllabus. Live count and credit total.
- Retired subjects are shown but not selectable, which is more honest than hiding them —
  an offering that already contains one needs to show why it must be removed.
- The faculty dashboard warns when registration is open for a semester that has no
  offering yet, since students cannot register until subjects are chosen and the window
  closing does not wait.

**A note on denormalisation**

`ExamForm` copies `streamId`, `academicYear`, `semester` and `subjectIds` rather than
reading them through its offering. An offering describes what a college teaches *now*; a
form records what a student registered for *then*. Reading through the offering would
rewrite history the moment faculty edited it.

### Phase 6 — what was actually built

This is the feature the previous six phases existed to make possible. Three chained
constraints decide what a student may register for, and all three are enforced server-side:

1. The university publishes a syllabus for the stream and semester.
2. The college offers a subset of it.
3. The student registers for a subset of *that*.

**Server**

- `GET /exam-forms/me` returns the form, the available subjects, the window and a
  **named block reason** in one request. The page cannot render anything useful without
  all four, and three round trips would mean three loading states for one screen.
- The block is a specific value, not a boolean: "your college has not published subjects
  yet" and "registration closed on Friday" need different words and involve different
  people.
- **A draft may be saved before the window opens; only submission is time-bound.**
  Preparing early is reasonable.
- Submission is refused unless the window is open, checked against the *server's* clock.
- **Form numbers come from an atomic counter**, not from counting existing forms. See the
  concurrency note below.
- A resubmitted form keeps its original number, and a stale rejection reason is cleared.
- Students may read only their own form; staff may read any in their own college. Both
  fail with 404, so a wrong id never confirms a form exists.

**Client**

- Subject picker with live credit total, save-draft and submit.
- The selection is tracked locally only once the student touches it, so a background
  refetch cannot overwrite work in progress.
- A locked form renders as the printable document.
- `PrintableExamForm` is laid out as a paper document: university and college header,
  candidate block with a photo box, numbered subject table with a credit total, and two
  signature lines. Deliberately monochrome and border-based, because browsers commonly
  strip background colours when printing.

### The form-number race

Counting existing forms and adding one is the obvious implementation and it is a race:
two students submitting at the same moment both read the same count and both receive the
same number. The failure only appears under the load of a registration deadline, which is
exactly when it must not.

`nextSequence` uses `findOneAndUpdate` with `$inc` and `upsert` — a single atomic document
operation, so MongoDB serialises concurrent callers and each gets a distinct value. No
transaction and no application lock.

There is a test for it: ten students submit simultaneously with `Promise.all`, and it
asserts ten distinct numbers.

### Phase 7 — what was actually built

**Server**

- The clerk's queue: forms filtered by status, searchable by student name or roll number,
  with counts per status returned alongside the list.
- **Counts ignore the status filter**, so the tabs keep showing how much is in each state
  while one of them is being viewed.
- **Rejection requires a reason of at least ten characters.** The student is the only
  person who can fix the form, and "rejected" alone tells them nothing to act on. A
  minimum length is enforced because "no" would pass a presence check while being just as
  useless.
- Only a `submitted` form can be acted on. A draft has not been handed in; a verified or
  rejected form already carries a decision, and overwriting it would silently discard
  another clerk's work.
- **Verification is terminal.** A problem found afterwards goes through a correction
  request rather than an edit.
- A rejected form returns to an editable state, keeps its number, and has its
  `submittedAt` cleared so the resubmission records its own timestamp.
- Faculty are excluded from verifying: they decide what is taught, not whether a
  registration is in order. College admins can verify, since a small college may have no
  clerk on duty.

**Searching by student name across two collections**

The name lives on `User`, the form on `ExamForm`. Rather than an aggregation with
`$lookup`, matching students are found first — a query the
`{ collegeId, role, lastName, firstName }` index already serves — and their ids filter
the forms. Two indexed queries beat one pipeline that can use neither index well.

**Client**

- Verification page with status tabs carrying live counts, search, and per-form actions.
- The rejection dialog is essentially just the reason box, with the same minimum length
  enforced client-side and a hint explaining that the student reads it.
- Verifying asks for confirmation and says plainly that it is final.
- The clerk dashboard leads with how many forms are waiting.

### Phase 8 — what was actually built

**Server**

- Correction tickets: a student asks to change their name, date of birth or photograph;
  a clerk approves or declines with a reason.
- **A student cannot edit these fields directly.** They appear on a marksheet, so
  changing one is an administrative act backed by documents. Approval is the only path
  by which they change.
- **Required documents are derived from what is changing**, so every student asking for
  the same correction is told the same thing and the office is never asked for paperwork
  that proves nothing.
- Only values that genuinely differ are stored. Submitting the form untouched creates no
  work for the office.
- **The previous values are snapshotted onto the ticket.** Looking them up at display
  time would show what the record says *now*, which after approval is the new value —
  making every approved ticket look like it changed nothing.
- **One open ticket per student**, enforced by a partial unique index. Two pending
  tickets could ask for conflicting changes with no way to know which was meant.
- An empty middle name is a real correction, stored as null rather than treated as "no
  change".
- Ticket numbers come from the same atomic counter as form numbers, scoped per college.

**Client**

- Student page that states plainly why these fields are not directly editable, then shows
  the ticket number and exactly which documents to bring — the instruction the original
  requirements asked for.
- Clerk queue showing the current value beside the requested one, plus the document
  checklist, so the decision is made from that screen against the papers on the counter.

### Phase 9 — what was actually built

**Cross-college statistics**

- Registration progress per college and per semester, for the university tier only.
- **Three aggregations, not three per college.** Every figure comes from a fixed number
  of round trips regardless of how many colleges exist; the naive approach would be
  hundreds of queries for one page at Mumbai University's real affiliate count.
- The most useful column is **not started** — students with no form at all. A draft is
  someone who began; not-started is someone who has not, and they are who a college needs
  to chase before the window closes.
- Students outside the reporting semesters are excluded, so a semester-2 student does not
  depress the figures for the semester-5 window.
- A deactivated college still appears, so its history does not silently vanish.

**Hardening**

- **Error boundary.** A render error previously produced a blank document. This is the
  one place in the codebase where a class component is correct rather than legacy —
  `componentDidCatch` still has no hook equivalent in React 19.
- **A real 404 page** instead of a silent redirect to the dashboard, which made a typo
  look identical to a permissions problem.
- **Cold-start notice.** The banner reappears after three seconds of waiting on the
  session restore, so a sleeping free-tier API reads as "waking up" rather than "broken".
- **Skip link** and a focusable `<main>`, so a keyboard user can jump past the header and
  navigation on every page.
- Statistics tables carry `<caption>`, `scope` on every header cell, and the progress bar
  states its percentage as text rather than relying on bar length or colour.

Already in place from earlier phases and re-checked here: route-level lazy loading (16
chunks), `helmet`, login rate limiting, and skeleton loaders throughout.

### Bug found and fixed during Phase 9

The by-college and by-semester tables disagreed on the same page: one showed one verified
form, the other showed two.

Neither aggregation was wrong. **The seed script never cleared exam forms, correction
requests or counters**, so reseeding left orphaned forms pointing at colleges that no
longer existed. Grouping by college dropped them; grouping by semester counted them.

Two things worth taking from it. A partial reset is worse than no reset, because it looks
like it worked. And the symptom appeared two features away from the cause — which is why
the fix is a comment on the delete list explaining that it must stay exhaustive.

The orphan state is unreachable in production: `deleteCollege` refuses while a college has
users. It was purely an artifact of reseeding a development database.

### Cloudinary — verified in production on 2026-09-13

Photograph uploads use a **signed direct upload**: the browser sends the file straight to
Cloudinary and the API only signs the request. The file never passes through the server,
which matters because Render's free tier has no persistent disk.

**The round trip is now exercised end to end against the live API.** A signature was
requested from `/api/uploads/photo-signature` as a student and used to POST an image
directly to `api.cloudinary.com`; Cloudinary accepted it and stored the file under
`ues/student-photos`. The signing scheme in `createUploadSignature` is therefore correct,
not merely plausible.

The three variables remain optional together. Without them the API answers
`configured: false`, the photo field is hidden, and name and date-of-birth corrections
work normally. They are set on Render for cloud `jvqvvl3p`.

**The security detail worth knowing.** The browser uploads directly and then *tells* the
API where the file landed, so that URL is user-supplied. `isOwnCloudinaryUrl` pins it to
`res.cloudinary.com`, to our own cloud name, and to our own folder. Without that check a
student could submit any address on the internet and have the system store and display
it. That is the classic weakness of a direct-upload flow, and there are tests for it.

Confirmed live on the deployed API: a `photoUrl` on a foreign host was rejected **400**,
and so was one on the real `res.cloudinary.com` under a *different* cloud name — the case
a hostname-only check would have let through.

### Bug found and fixed during Phase 1

Populating an unregistered `Stream` model threw inside the login service. That turned the
wrong-password path into a **500** while the unknown-account path stayed a **401** —
which handed an attacker a way to tell registered addresses from unregistered ones, the
exact leak the shared error message exists to prevent.

Fixed by registering all models at bootstrap. The regression test
`responds identically to a wrong password and an unknown account` in `tests/auth.test.ts`
now compares the two response bodies directly, so this cannot come back unnoticed.

### Phase 0 remaining

All complete as of 2026-09-13.

- [x] Create the MongoDB Atlas cluster and put its URI in `server/.env`
- [x] Deploy the API to Render
- [x] Deploy the client to Vercel, then add the Vercel origin to `CORS_ORIGINS`
- [x] Confirm the live client reports **Healthy** against the live API
- [x] Version control — `git init`, repo-local identity, pushed to
      [Jay-Bansode/University-Exam-System](https://github.com/Jay-Bansode/University-Exam-System)

### Version control — done 2026-09-13

Initialised and pushed to
[Jay-Bansode/University-Exam-System](https://github.com/Jay-Bansode/University-Exam-System)
(public), branch `main`.

A repo-local identity was set before the first commit, using
`kumarjay505@gmail.com` rather than the `bansodejay50@` address this section previously
specified:

```bash
git init
git config user.name  "Jaykumar Bansode"
git config user.email "kumarjay505@gmail.com"
```

**The original warning here is now out of date.** It cautioned that the machine's global
`~/.gitconfig` resolved to the employer address `Jaykumar.Bansode@nextw.com`. At the time
of deployment the global identity already read `kumarjay505@gmail.com`, so no employer
domain was ever at risk. The repo-local identity is set regardless, so this repository
stays correct even if the global config changes again.

`.gitignore` and `.gitattributes` are already written and correct: `.env` and
`.env.local` are excluded while the `.env.example` files are tracked, and line endings
normalise to LF so the repo is identical on Windows and on the Linux build containers
at Render and Vercel.

---

## 8. API reference

| Method | Path | Role | Tenant scoped | Notes |
|---|---|---|---|---|
| GET | `/api/health` | public | n/a | Service and database state, plus uptime |
| POST | `/api/auth/login` | public | n/a | Rate limited. Sets the refresh cookie. Returns user + access token |
| POST | `/api/auth/refresh` | refresh cookie | n/a | Rotates the refresh token, returns a new access token |
| POST | `/api/auth/logout` | public | n/a | Revokes the session. Idempotent |
| GET | `/api/auth/me` | any signed-in | n/a | The caller's own record, re-read from the database |
| GET | `/api/auth/demo-accounts` | public | n/a | Only accounts flagged `isDemo`. Includes the shared demo password by design |
| GET | `/api/users` | staff | **yes** | Optional `role` and `search`. University admin is unscoped |
| GET | `/api/users/:id` | staff | **yes** | **404** for another college's user, never 403 |
| GET | `/api/colleges` | university admin | n/a | Every college with a per-role headcount |
| POST | `/api/colleges` | university admin | n/a | 201. Code is uppercased and must be unique |
| GET | `/api/colleges/:id` | university admin | n/a | |
| PATCH | `/api/colleges/:id` | university admin | n/a | Partial update. An empty body is a 422 |
| PATCH | `/api/colleges/:id/status` | university admin | n/a | Deactivating signs out every user of that college |
| DELETE | `/api/colleges/:id` | university admin | n/a | **409** once the college has users |
| POST | `/api/colleges/:id/admins` | university admin | n/a | 201. Returns a generated password **once** |
| GET | `/api/streams` | any signed-in | n/a | With a subject count each |
| POST | `/api/streams` | university admin | n/a | `totalSemesters` derived from the programme |
| PATCH | `/api/streams/:id` | university admin | n/a | **409** if a programme change would strand subjects |
| DELETE | `/api/streams/:id` | university admin | n/a | **409** if it has subjects or enrolled students |
| GET | `/api/subjects` | any signed-in | n/a | Optional `streamId` and `semester` |
| POST | `/api/subjects` | university admin | n/a | **400** if the semester exceeds the stream's programme |
| PATCH | `/api/subjects/:id` | university admin | n/a | |
| DELETE | `/api/subjects/:id` | university admin | n/a | **409** if a college offering references it |
| GET | `/api/exam-windows` | any signed-in | n/a | `isOpenNow` and `status` computed server-side |
| POST | `/api/exam-windows` | university admin | n/a | One window per semester per academic year |
| PATCH | `/api/exam-windows/:id` | university admin | n/a | Publishing and unpublishing happen here |
| DELETE | `/api/exam-windows/:id` | university admin | n/a | **409** while the window is open |
| GET | `/api/college-streams` | staff | **yes** | The streams this college offers, with student counts |
| POST | `/api/college-streams` | college admin | **yes** | Chosen from the university's catalogue |
| DELETE | `/api/college-streams/:id` | college admin | **yes** | **409** while students are enrolled |
| POST | `/api/users` | college admin | **yes** | Faculty, clerk or student only. Returns a password **once** |
| PATCH | `/api/users/:id` | college admin | **yes** | Re-validates enrolment when it changes |
| PATCH | `/api/users/:id/status` | college admin | **yes** | Deactivating revokes their sessions. Cannot target yourself |
| POST | `/api/users/:id/reset-password` | college admin | **yes** | New password **once**; revokes all their sessions |
| GET | `/api/offerings` | any college member | **yes** | Optional `streamId`, `semester`, `academicYear` |
| GET | `/api/offerings/available-subjects` | faculty, college admin | **yes** | Refuses a stream this college does not offer |
| PUT | `/api/offerings` | faculty, college admin | **yes** | Upsert. **400** on a wrong-semester subject, **409** on withdrawing a registered one |
| DELETE | `/api/offerings/:id` | faculty, college admin | **yes** | **409** while exam forms reference it |
| GET | `/api/exam-forms/me` | student | **yes** | Form, available subjects, window and block reason in one call |
| GET | `/api/exam-forms/me/history` | student | **yes** | Their own forms across semesters |
| PUT | `/api/exam-forms/me/draft` | student | **yes** | Allowed before the window opens. **409** once submitted |
| POST | `/api/exam-forms/me/submit` | student | **yes** | Assigns the form number. **400** outside the window |
| GET | `/api/exam-forms/:id` | student (own), staff | **yes** | **404** for a classmate's form or another college's |
| GET | `/api/exam-forms` | staff | **yes** | The clerk's queue. Optional `status` and `search`; counts ignore the filter |
| PATCH | `/api/exam-forms/:id/verify` | clerk, college admin | **yes** | Terminal. **409** unless the form is `submitted` |
| PATCH | `/api/exam-forms/:id/reject` | clerk, college admin | **yes** | Reason required, min 10 characters. Returns the form to editable |
| GET | `/api/uploads/photo-signature` | student | **yes** | Signed Cloudinary params, or `configured: false` |
| POST | `/api/correction-requests` | student | **yes** | 201 with a ticket number. **409** if one is already open |
| GET | `/api/correction-requests/me` | student | **yes** | Their own tickets |
| GET | `/api/correction-requests` | clerk, college admin | **yes** | The ticket queue. Optional `status` |
| PATCH | `/api/correction-requests/:id/approve` | clerk, college admin | **yes** | Applies the change to the student record |
| PATCH | `/api/correction-requests/:id/decline` | clerk, college admin | **yes** | Reason required, min 10 characters |
| GET | `/api/statistics` | university admin | **no — deliberately** | The only unscoped read. The role guard is the entire protection |

"staff" means university admin, college admin, faculty, or clerk. A student is excluded
from both `/users` routes and reads their own record through `/auth/me`.

---

## 9. Environment and deployment

### Environment variables

**`server/.env`** (from `server/.env.example`)

| Key | Required | Notes |
|---|---|---|
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `PORT` | no | Defaults to 5000. Render sets this itself. |
| `MONGODB_URI` | **yes** | Boot fails without it |
| `CORS_ORIGINS` | no | Comma-separated exact origins, no trailing slash |
| `JWT_ACCESS_SECRET` | **yes** | Minimum 32 characters. **Use a different value in production.** Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ACCESS_TOKEN_MINUTES` | no | Default 15 |
| `REFRESH_TOKEN_DAYS` | no | Default 7 |
| `SEED_DEMO_PASSWORD` | no | Default `Demo@12345`. Published on the login page by design |
| `CLOUDINARY_CLOUD_NAME` | no | All three are optional **together**. Absent means photo uploads are disabled and the rest of the correction workflow still works |
| `CLOUDINARY_API_KEY` | no | Sent to the browser as part of a signed upload |
| `CLOUDINARY_API_SECRET` | no | **Never leaves the server.** Signs upload requests |

**`client/.env.local`** (from `client/.env.example`)

| Key | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | **yes** | Compiled into the bundle, therefore public. Never a secret. |

### Running locally

```bash
docker compose up -d                  # MongoDB on :27017
npm install                           # once, from the repo root
npm run seed                          # two colleges + demo accounts for all five roles
npm run dev:server                    # API   → http://localhost:5000
npm run dev:client                    # client → http://localhost:5173
```

Then open http://localhost:5173 and use the demo panel. Sign in as one college's clerk,
then the other's, to see tenant isolation.

### Deployment runbook

As executed on 2026-09-13. **Both hosts build from the repository root, not from the
workspace subdirectory** — see the correction below.

**Render (API)** — root directory **blank**, build
`npm ci --include=dev && npm run build --workspace=@ues/server`, start
`npm start --workspace=@ues/server`, health check path `/api/health`. Set
`NODE_ENV=production`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `SEED_DEMO_PASSWORD`, the three
`CLOUDINARY_*` variables, and `CORS_ORIGINS` (the Vercel URL). Do not set `PORT`; Render
injects it. Add `0.0.0.0/0` to the Atlas IP access list, since Render does not publish
static egress IPs on the free tier.

**Vercel (client)** — root directory **`./`**, framework Vite, build
`npm run build --workspace=@ues/client`, output directory `client/dist`. Set
`VITE_API_BASE_URL` to the Render URL. `vercel.json` at the repository root rewrites all
paths to `index.html`; without it a hard refresh on any nested route 404s.

**⚠️ Why the root directory must not be `server` or `client`.** This was originally
documented the other way round and does not work. npm 11 *does* resolve the workspace
correctly from a subdirectory — it walks up to the root lockfile and links `@ues/shared`.
The problem is narrower: installing from `server/` scopes the install to that one
workspace (227 packages instead of 383), and **`typescript` is a root devDependency, not
one of `server`'s**. `tsc` is never installed and the build dies at `prebuild`.

This is easy to miss locally, because a global `typescript` on the developer's machine
silently satisfies `tsc` — at the wrong version, and absent on the build host. Re-run the
build with the global npm directory stripped from `PATH` to see the real behaviour.

**The order matters.** Deploy the API first, then the client with the API URL, then add
the Vercel origin to the API's `CORS_ORIGINS` and redeploy the API.

**Seeding Atlas.** Run `npm run seed` from a developer machine with `server/.env`
temporarily pointed at the Atlas URI; the seed runs through `tsx`, a devDependency, and is
not intended to run on Render. `SEED_DEMO_PASSWORD` must then match on Render, because
`/api/auth/demo-accounts` serves that value to the login page — a mismatch publishes
credentials that silently do not work.

**⚠️ `mongodb+srv://` may fail from a developer machine.** If Node reports
`querySrv ECONNREFUSED` while `nslookup` resolves the same name, Node's resolver is
pointed somewhere that cannot answer SRV queries (check `require('dns').getServers()`).
Render is unaffected. Locally, use the non-SRV form — the shard hosts plus
`?ssl=true&replicaSet=…&authSource=admin` — which resolves through the OS resolver
instead.

---

## 10. Interview notes

Short answers to the questions this codebase invites. Extended each phase.

**Why validate environment variables at startup?**
Reading `process.env` where it is used means a missing value surfaces as an undefined
bug on some later request. `config/env.ts` parses the whole environment once with Zod
and throws, so the process exits non-zero and the host reports a failed deploy instead of
serving a broken instance.

**Why is there no `asyncHandler` wrapper?**
That is an Express 4 workaround. Express 5 forwards rejected promises from async handlers
to the error middleware automatically, so routes need neither a wrapper nor try/catch.

**Why does the error handler take four parameters when one is unused?**
Arity is how Express distinguishes error middleware from ordinary middleware. Removing
the unused `next` would silently turn it into a normal handler and errors would stop
reaching it.

**Why `trust proxy` in production?**
Render terminates TLS at its proxy and forwards plain HTTP. Without it Express sees an
insecure request and refuses to set `secure` cookies — so the refresh token works on
localhost and fails in production, which is a miserable bug to chase.

**Why can't CORS use a wildcard?**
The refresh-token cookie makes auth requests credentialed, and browsers reject
`Access-Control-Allow-Origin: *` on credentialed requests. An exact-origin allowlist is
mandatory, not a preference.

**Why const objects instead of TypeScript `enum`?**
A TS `enum` emits real runtime JavaScript. That breaks Node's type-stripping and
`isolatedModules` assumptions. `as const` plus a derived union gives the same ergonomics
with a plain object at runtime.

**Why does a cross-tenant read return 404 rather than 403?**
A 403 confirms the record exists somewhere. Across tenants, that confirmation is itself
the leak.

**Why two different token mechanisms?**
An access token is a signed JWT, so authorising a request needs no database round trip.
The price of that is that it cannot be revoked, which is why it lives 15 minutes. The
refresh token is opaque random bytes stored server-side precisely so it *can* be revoked,
by logout, a password change, or a deactivated college. Using a JWT for both would mean
no revocation at all; using a database lookup for both would mean a query on every request.

**Why is the refresh token in a cookie and the access token in memory?**
The refresh token is the long-lived credential, so it goes somewhere page JavaScript
cannot read it — an httpOnly cookie. The access token is short-lived and needs to go in an
`Authorization` header, so it lives in a module variable and dies with the tab. Neither is
in `localStorage`, because anything there is readable by any script on the page, so one
XSS bug would hand over a working credential.

**What is refresh-token rotation, and why bother?**
Every refresh issues a new token and revokes the one presented. That makes theft
*detectable*: a stolen token works exactly once, and when the real user next refreshes
their now-revoked token is replayed. There is no way to tell victim from thief at that
point, so every session for the user is dropped and both must sign in again.

**Why does the client serialise concurrent refreshes?**
If four requests expire at once, four parallel refresh calls would rotate the token four
times, and rotation treats a reused token as theft — logging the user out for doing
nothing wrong. So the first caller starts the refresh and the others await the same
promise.

**Why SHA-256 for refresh tokens but bcrypt for passwords?**
bcrypt is deliberately slow to make guessing a low-entropy human password expensive. A
refresh token is already 256 bits of CSPRNG output, so there is nothing to guess and
nothing to slow down. SHA-256 is also deterministic, so the stored hash can be looked up
directly by index, which bcrypt cannot do.

**Why do wrong-password and unknown-account return exactly the same response?**
Any difference — status, message, or even timing — lets an attacker enumerate which email
addresses are registered. On a system whose users are students at a named college, that is
a privacy leak in itself. A dummy bcrypt comparison runs when the account does not exist,
so the timings match too.

**How is tenant isolation actually enforced?**
Three layers. `tenantScope` sets the college from the verified token and from nothing
else. `scopeFilter` injects it into every query against a college-owned collection. And
the tests in `tests/tenant-isolation.test.ts` sign in as one college and try to reach the
other's data, expecting 404. The third layer is the one that matters, because the first
two are just claims until something checks them.

**Why not a Mongoose `pre` hook instead of the `scopeFilter` helper?**
A hook looks tidier but is silently bypassed by `aggregate`, `bulkWrite`, and `distinct`
— so one aggregation pipeline would quietly read every tenant. An explicit call is
greppable: it is either in the service or it is not, and its absence shows up in review.

**Why is `passwordHash` marked `select: false`?**
It keeps the hash out of query results by default, so it can only leave the database when
a caller asks for it explicitly. That turns "remember to strip the password" from a thing
people must remember into the default behaviour.

**Why does signing out clear the query cache?**
Cached data belongs to the user who just left. Without clearing it, the next person to
sign in on that tab briefly sees the previous user's data — which in a multi-tenant system
can mean one college's records shown to another.

**Why deactivate a college rather than delete it?**
Exam records have to survive an affiliation lapsing — a student's history does not stop
mattering because their college left the university. Deactivation blocks every one of its
users while deleting nothing, and it is reversible. Deletion is allowed only while a
college still has no users at all.

**Why does deactivating a college revoke refresh tokens?**
Blocking login alone would do nothing to people already signed in: they would keep
working until their refresh token expired, up to a week later. Revoking the stored tokens
ends those sessions at once. The one remaining gap is a live access token, valid for up
to 15 minutes — the accepted cost of stateless access tokens.

**Why is the college status a separate endpoint from the edit form?**
Deactivating signs out an entire college. That is far too consequential to happen because
an edit form submitted a checkbox nobody deliberately touched. A distinct route makes it
an explicit act.

**Why generate the administrator's password instead of letting an admin choose it?**
Passwords chosen by one person for another are reliably weak and reliably reused. The
server generates 14 characters from `crypto.randomInt` — not `Math.random`, which is
predictable and not a cryptographic source — and stores only the bcrypt hash, so it is
shown exactly once and cannot be looked up again.

**Why one aggregation for the college headcounts?**
Counting users per college with a query per college is N+1: fine with two colleges,
800 round trips with 800. One `$group` over the users collection gives every count in a
single pass, so the page cost does not grow with the number of colleges.

**Why does the modal have no `isOpen` prop?**
Because it is mounted only while open. An always-mounted dialog needs an effect to copy
props into form state on each open, which React 19 flags as a cascading render. Mounting
fresh makes the initial state simply correct, with no synchronisation at all.

**Why can anyone read the syllabus but only the university write to it?**
That split is the system. An affiliated university publishes one curriculum and its
colleges teach it; if a college could add subjects, marksheets from different colleges
would stop being comparable. Faculty need to read the catalogue to build an offering, and
students need subject names on their forms, so reading is open to everyone signed in.

**Why is the semester limit checked in the service rather than the Zod schema?**
The valid range depends on the stream being written to — eight semesters for a BE, six
for a Diploma — and the schema only sees the request. Zod bounds it at 8, which is the
most any programme has; the service loads the stream and applies the real limit.

**Why is publishing an exam window separate from its dates?**
So a window can be scheduled and reviewed before it goes live. An unpublished window is
never open regardless of its dates, which makes "draft" a real state rather than a
convention someone has to remember.

**Why is `isOpenNow` computed on the server?**
Because the same rule decides whether a submission is accepted. Deciding it in the
browser would let anyone open registration by changing their system clock.

**Why define `SemesterOffering` in Phase 3 when its screens arrive in Phase 5?**
Subject deletion must refuse to orphan an offering. Without the model, that guard would
count zero every time and always allow the delete — a check that looks present and does
nothing, which is worse than no check at all.

**Why convert `datetime-local` values rather than slicing the ISO string?**
`datetime-local` speaks local wall-clock time with no zone; the API speaks UTC. Slicing
the ISO string hands the browser a UTC time labelled as local, shifting every date by the
viewer's offset — five and a half hours in India.

**Why can't a college admin create another college admin?**
A tenant that can appoint its own administrators can grow its own authority without the
university's involvement. Keeping that with the university means the tenant boundary is
administered from outside the tenant. The roles are absent from the request schema, so
the attempt fails as a validation error rather than reaching a handler that has to
remember to check.

**Why does a student's programme come from the stream instead of the form?**
Because two sources for one fact will eventually disagree. The stream already knows
whether it is a BE or a Diploma, and that determines how many semesters exist, so asking
separately would only create a way for them to contradict each other.

**Why is email unique university-wide but roll number unique per college?**
Email is the login identifier, so it has to be unique across the whole system to identify
one account. Roll numbers are issued independently by each college and genuinely repeat,
so uniqueness there is scoped to the tenant with a compound index.

**Why does a password reset revoke sessions?**
A reset usually means the account may be compromised. Issuing a new password while
leaving old refresh tokens valid would let an intruder stay signed in for days, which
defeats the point of resetting it.

**Why can't an admin deactivate their own account?**
It would lock the college out of its own administration, and it is never what anyone
meant to do. The check is server-side, not just a hidden button.

**Why was the `fullName` virtual removed from the User schema?**
`Model.create()` does not return a type carrying virtuals, so declaring one forced every
mapper to compute the name by hand regardless — the same three lines in four files. A
full name is a property of the response shape, not of the stored document, so it lives in
one helper now.

**How is "faculty cannot invent a subject" actually enforced?**
By omission. The offering feature has no route that creates a `Subject` — faculty select
ids from the university's catalogue, and the service validates that each one exists for
that stream and semester. Creating subjects lives on a different router behind a
university-admin role guard. A structural absence is harder to regress than a check.

**Why validate that a subject belongs to the semester when the picker only shows valid ones?**
Because the picker is in the browser and the request is not. A hand-made request could
carry any id. This is also the failure that would be quietest if missed: the data would
look correct and only surface as a student registered for a subject they are not taking.

**Why can a subject be added to an offering but not withdrawn?**
Adding harms nobody. Withdrawing one that students have already registered for would
leave them registered for an examination the college no longer runs. The guard checks
exam forms pointing at the offering and refuses, naming the subject codes.

**Why does `ExamForm` copy the stream, semester and subjects instead of reading the offering?**
An offering describes what a college teaches now; a form records what a student
registered for then. Reading through the offering would rewrite a student's history the
moment faculty edited it. This is deliberate denormalisation for an audit reason, not a
performance one.

**Why is `PUT /offerings` an upsert rather than separate create and update routes?**
There is exactly one offering per college, stream, semester and academic year. "Save what
we teach for semester 5" is a single intention, so two endpoints would only make the
caller work out which one applies.

**How are form numbers generated, and why does it matter?**
From an atomic counter: `findOneAndUpdate` with `$inc` and `upsert`, scoped to college,
year and semester. Counting existing forms and adding one is a race — two simultaneous
submitters read the same count and get the same number, and it only breaks under
deadline load. A single atomic document operation means MongoDB serialises the callers.
There is a test that submits ten students concurrently and asserts ten distinct numbers.

**Why does one endpoint return the form, the subjects, the window and a block reason?**
Because the page cannot render anything meaningful without all four. Splitting them would
give one screen three independent loading states and three chances to show a half-built
page. The block is a named value rather than a boolean so the UI can name a next step.

**Why can a draft be saved outside the registration window?**
Preparing early is reasonable and harmless. Only submission is the act the university is
scheduling, so only submission is time-bound.

**Why does a resubmitted form keep its original number?**
A form number identifies one registration. Issuing a second on resubmission would leave a
student holding two numbers for one registration, and the college office reconciling
paper against the system would find a mismatch.

**Why 404 rather than 403 when a student requests a classmate's form?**
Same reason as everywhere else: a 403 confirms the record exists. A student probing ids
would learn which forms had been submitted even without reading them.

**Why does the printable form avoid background colours?**
Browsers commonly strip backgrounds when printing, so anything conveyed only by a
coloured fill disappears on paper. Borders and text weight survive.

**Why is a rejection reason required, and why a minimum length?**
The student is the only person who can fix the form. "Rejected" on its own sends them to
the office to ask what was wrong, which is the trip the system exists to save. A presence
check alone would accept "no", so the schema requires ten characters — enough to name the
problem.

**Why can only a `submitted` form be verified or rejected?**
A draft has not been handed in. A verified or rejected form already carries a decision
someone recorded, and acting again would silently overwrite it. Restricting the action to
one state means two clerks working the same queue cannot undo each other.

**Why is verification terminal?**
Reversing it would erase a recorded decision, and audit trails that can be edited are not
audit trails. A problem found after verification is a correction request, which leaves
both the original decision and the correction visible.

**Why does rejecting clear `submittedAt`?**
So the resubmission records its own timestamp. Otherwise a corrected form would appear to
have been submitted before the correction was made, which misleads anyone reading the
queue by submission date.

**How does searching forms by student name work across two collections?**
The name is on `User` and the form is on `ExamForm`. Matching students are found first,
using the `{ collegeId, role, lastName, firstName }` index, and their ids then filter the
forms. An aggregation with `$lookup` would be one query but could use neither index well.

**Why can't a student edit their own name or date of birth?**
Those fields are printed on a marksheet. Changing one is an administrative act that needs
evidence, so the student raises a ticket, brings documents to the office, and a clerk
approves it. This is the one workflow that deliberately refuses to be self-service.

**Why store the previous values on the ticket instead of looking them up?**
Because after approval the record holds the *new* value. A ticket that read its "before"
column live would show the new value in both columns, making every approved ticket look
like it changed nothing. The snapshot keeps the history readable years later.

**Why only one open ticket per student?**
Two pending tickets could ask for conflicting changes, and the office would have no way
to know which the student meant. Enforced by a **partial unique index** on `studentId`,
filtered to pending rows — so a student may have any number of resolved tickets in their
history but only one open at a time.

**Why does the photo upload bypass the API entirely?**
The browser uploads straight to Cloudinary with a signature the server produced. Render's
free tier has no persistent disk to buffer a file on, and streaming an image through Node
would cost memory and request time for nothing.

**What stops a student submitting any URL as their photograph?**
Nothing about the flow itself — the client uploads directly and then *reports* where the
file landed, so that URL is user input. `isOwnCloudinaryUrl` pins it to
`res.cloudinary.com`, to our own cloud name, and to our own folder. This is the classic
weakness of a direct-upload flow and the reason the check exists.

**Why did the correction model need an explicit index name?**
`index: true` on the field and a separate `schema.index({ studentId: 1 }, …)` both derive
the name `studentId_1`, and Mongo refuses to create the second. Both indexes are wanted —
one serves a student's ticket history, the other enforces the single-open-ticket rule —
so the partial one is named explicitly.

**Which route is not tenant-scoped, and why is that safe?**
`GET /api/statistics` — the cross-college report. It is the only unscoped read in the
system, so `requireRole(UniversityAdmin)` is the whole of its protection, and that is
stated in a comment on the route so a future change widening those roles is an obvious
decision rather than an accident. There are tests asserting a clerk, a college admin and
a student all get 403.

**Why is "not started" the number that matters on the statistics page?**
A draft is a student who began and can be reminded; not-started is a student with no form
at all. Those are the people a college has to chase before the window closes, and no
other column surfaces them.

**Why is the error boundary a class component?**
Because `componentDidCatch` and `getDerivedStateFromError` still have no hook equivalent
in React 19. It is the one place where a class is the correct choice rather than a
legacy one. It catches errors thrown while *rendering* — event handlers and promises are
handled where they occur, which is why every mutation has its own try/catch.

**Why show a 404 page instead of redirecting to the dashboard?**
A redirect drops the user somewhere they did not ask for with no explanation, and makes a
mistyped URL indistinguishable from a permissions problem. Saying what happened and
offering the way back is clearer.

**Why does the cold-start notice derive its visibility instead of storing it?**
Resetting a visibility flag inside the effect body sets state synchronously during
render, which React 19 flags as a cascading render. Only the timer callback sets state;
the notice disappears because `isWaiting` became false, not because anything cleared it.

**Why is the health check more than `res.send('ok')`?**
The interesting failure is an app that answers HTTP while its database connection is
gone. The payload reports database state, and `uptimeSeconds` lets the UI recognise a
Render cold start and explain the delay rather than appearing broken.

---

## 11. Known limitations and deferred work

**Accepted limitations**

- Render's free tier sleeps after 15 minutes; the first request can take ~1 minute. The
  UI explains this rather than hiding it.
- Atlas M0 offers 512 MB and ~100 ops/sec. Fine for a demo, not for real load.
- TypeScript is held at 6.x pending `typescript-eslint` support for 7.

**Deferred, in rough priority order**

1. Marks entry and marksheet generation
2. Hall tickets and exam timetables
3. Bulk student import from CSV
4. Email notifications
5. Exam fee payment
6. CI/CD with GitHub Actions
7. OCR marksheet scanning (explicitly dropped, recorded for completeness)
8. Subdomain-per-college tenant routing

---

## 12. Changelog

### 2026-09-06 — Phase 0

- Requirements captured from `Online Exam Form Filling System.txt` and extended to a
  multi-college university model after confirming the Mumbai University structure.
- All architectural decisions in section 6 agreed.
- Monorepo scaffolded; foundation built and verified locally.
- TypeScript pinned to 6.x after TypeScript 7 broke dependency resolution.
- Deployment still outstanding.
- **Left untracked by git on purpose.** Version control and commit authorship are the
  author's to set up; see the warning in section 7 about the work email in the machine's
  global git config.

### 2026-09-06 — Phase 1

- Authentication built: JWT access tokens plus rotating refresh tokens with replay
  detection, five roles, and three-layer tenant scoping.
- `Stream` model introduced early (schema only, no admin screens until Phase 3) because
  `studentProfile.streamId` references it.
- Added `models/index.ts` so every model registers at bootstrap, fixing a `populate()`
  failure that had become an account-enumeration leak on the login route.
- Client auth added: in-memory access token, silent refresh with a shared in-flight
  promise, role-guarded routes, and lazy-loaded dashboards.
- Seed data: two real Mumbai University affiliates with a full roster each.
- Test suite grew from 5 to 32, including a dedicated tenant-isolation file.
- Mongoose 9 API differences recorded: `QueryFilter` replaces `FilterQuery`, and
  pre-hooks no longer take a `next` callback.

### 2026-09-06 — Phase 2

- College lifecycle built end to end: list with aggregated headcounts, create, edit,
  activate and deactivate, guarded delete, and administrator creation.
- Deactivation now revokes refresh tokens, and refresh re-checks college status.
- Administrator passwords generated server-side and shown exactly once.
- Reusable UI components added: `Modal`, `FormField`, `Button`, and the `toFormErrors`
  helper that maps a 422's field details onto the right inputs.
- Role-aware navigation added to the app shell.
- Modals restructured to mount-when-open after React 19's `set-state-in-effect` rule
  correctly flagged the prop-into-state effect as a cascading render.
- Test suite grew from 32 to 56.

### 2026-09-06 — Phase 3

- Master syllabus built: streams and subjects, readable by all, writable only by the
  university tier.
- Exam registration windows added, with publication separate from the dates and open
  status computed server-side.
- `Subject`, `ExamWindow`, and `SemesterOffering` models added. The offering schema is
  deliberately ahead of its Phase 5 screens so the subject-deletion guard is enforceable.
- Referential guards: stream deletion, subject deletion, programme changes, and deletion
  of an open window are all refused with an explanation rather than allowed to orphan data.
- Seed data extended to five streams, 19 real Mumbai University subject codes, and two
  exam windows in different states.
- Test suite grew from 56 to 88.

### 2026-09-06 — Phase 4

- College admins can now run their own roster: create faculty, clerks and students, edit
  them, deactivate them, and issue new passwords.
- `CollegeStream` added — the first tenant-owned join, linking a college to the
  university streams it teaches.
- Privilege escalation closed off: a college admin cannot create administrators.
- Student enrolment validates stream availability, programme, and semester together,
  including the Direct Second Year rule.
- Two refactors: the `fullName` virtual was removed in favour of one helper, and
  `GET /users` now returns the shared `ManagedUser` type instead of a duplicated one.
- Seed data links both colleges to Computer Engineering and Information Technology.
- Test suite grew from 88 to 118.

### 2026-09-06 — Phase 5

- Semester offerings built: faculty select from the university's syllabus, and there is
  no route in the feature through which a subject could be created.
- `ExamForm` model defined ahead of Phase 6, so the "cannot withdraw a registered
  subject" guard is enforceable rather than a no-op.
- Cross-semester contamination blocked: a subject must belong to the offering's stream
  and semester.
- Seed data now includes a semester-5 Computer Engineering offering at both colleges,
  matching the exam window that is open, so Phase 6 has something to build on. Semester 3
  is left without one so the empty state is visible.
- Test suite grew from 118 to 142.

### 2026-09-06 — Phase 6

- **The core feature works end to end**: a student sees the subjects their college runs,
  saves a draft, submits, receives a form number, and prints an A4 document.
- Submission is gated on the university's exam window, checked against the server clock.
- Form numbers come from an atomic counter, with a concurrency test proving ten
  simultaneous submissions get ten distinct numbers.
- A `Counter` model added for atomic sequences.
- `ExamFormStatus` moved to `@ues/shared` so the client and the database enforce the same
  values from one definition.
- Fixed a Mongoose 9 deprecation: `findOneAndUpdate` now takes
  `returnDocument: 'after'` rather than `new: true`.
- Test suite grew from 142 to 166.

### 2026-09-06 — Phase 7

- **The registration cycle is now complete**: submit, send back with a reason, correct,
  resubmit, verify. Verified against the running server end to end.
- Clerk queue with status tabs, live counts, and search by name or roll number.
- Rejection reasons are mandatory and must be long enough to be useful.
- Verification is terminal; only `submitted` forms can be acted on.
- Faculty excluded from verification; college admins included.
- Test suite grew from 166 to 187.

### 2026-09-06 — Phase 8

- Correction tickets built: raise, review, approve or decline with a reason.
- Required documents derived from what is being changed.
- Previous values snapshotted, so an approved ticket still reads correctly.
- One open ticket per student, enforced by a partial unique index.
- Cloudinary signed direct uploads implemented, with the returned URL pinned to our own
  account and folder. **The Cloudinary round trip is untested** — no account is
  configured; see the warning in section 7.
- Fixed a duplicate index definition that collided on the auto-generated name
  `studentId_1`. Caught by the test suite on first run.
- Test suite grew from 187 to 215.

### 2026-09-06 — Phase 9 (final phase)

- Cross-college statistics built on three aggregations, with per-college and per-semester
  breakdowns and a not-started count.
- Hardening: error boundary, real 404 page, cold-start notice, skip link, accessible
  tables.
- **Fixed a seed bug**: exam forms, correction requests and counters were never cleared,
  leaving orphaned records that made two tables on the statistics page disagree.
- Test suite grew from 215 to 230.
- **All nine phases complete.** Remaining work is deployment and optional Cloudinary
  configuration.

### 2026-09-13 — Deployment

- **Deployed.** Client on Vercel (`university-exam-system.vercel.app`), API on Render
  (`ues-api.onrender.com`), MongoDB Atlas M0 in `ap-south-1`, Cloudinary for photographs.
- Version control initialised and pushed to
  [Jay-Bansode/University-Exam-System](https://github.com/Jay-Bansode/University-Exam-System),
  with a repo-local identity set before the first commit.
- Added `vercel.json` at the repository root so SPA routes survive a hard refresh.
- **Corrected the deployment runbook in section 9.** It specified root directory `server`
  for Render, which cannot work: installing from a workspace subdirectory omits the root
  `typescript` devDependency, so `tsc` is missing at build time. A global TypeScript on
  the developer machine had been masking this. Both hosts now build from the repository
  root with `--workspace` flags. Verified on a clean tree with `PATH` stripped of the
  global npm directory.
- **Cloudinary is no longer untested.** A signature from `/api/uploads/photo-signature`
  was used to upload directly to Cloudinary, which accepted it and stored the file under
  `ues/student-photos`. The `isOwnCloudinaryUrl` guard was confirmed live: a foreign host
  was rejected 400, and so was the real `res.cloudinary.com` under a different cloud name.
- Verified in production: health and database connectivity, CORS from the Vercel origin,
  login returning `HttpOnly; Secure; SameSite=None` on the refresh cookie, and tenant
  isolation answering **404** rather than 403 across colleges.
- Recorded a developer-machine caveat: Node's resolver here cannot answer SRV queries, so
  `mongodb+srv://` fails locally with `querySrv ECONNREFUSED` while `nslookup` succeeds.
  Seeding used the non-SRV connection string. Render is unaffected.
