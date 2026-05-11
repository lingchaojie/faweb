# FlowAssist — Architecture

## Overview

FlowAssist is a workflow tool web application. Users log in, select a workflow tool, upload files, and dispatch processing tasks to dedicated Docker worker containers.

## System Architecture

```
Caddy (:80/:443) — reverse proxy, auto HTTPS
  └─ Next.js Web App (:3000) — frontend + backend API
       ├─ PostgreSQL (:5432) — users, sessions, tasks, file metadata
       ├─ Shared Volume (/app/storage)
       │   ├─ /uploads — user-uploaded files
       │   └─ /output — worker output files
       └─ Workers (always-on, HTTP API)
            ├─ Doc Processing Worker (:8001)
            ├─ PPT Template Worker (:8002) [placeholder]
            └─ Chat Extraction Worker (:8003) [placeholder]
```

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS 4, Lucide icons
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** Cookie-based sessions with SHA-256 hashed tokens
- **Deployment:** Docker Compose + Caddy reverse proxy

## Authentication

Dual-layer auth adapted from Factory System (`/home/alvin/FactorySystem`):

1. **User auth** — `User` + `Session` models. Cookie-based. Roles: `admin` (manage users in-app), `user` (normal).
2. **Platform admin auth** — `PlatformAdmin` + `PlatformAdminSession` models. Separate cookie, separate login page (`/admin/login`).

No workspace/multi-tenancy. Simpler than Factory System.

Key files:
- `src/lib/session.ts` — user session management
- `src/lib/auth.ts` — user login, `requireUser()`
- `src/lib/admin-session.ts` — admin session management
- `src/lib/admin-auth.ts` — admin login, `requirePlatformAdmin()`

## Workflows

Each workflow runs in an independent Docker container exposing a standard HTTP API.

| Workflow | Container | Port | Status |
|----------|-----------|------|--------|
| Document Processing | `doc-worker` | 8001 | Stub implemented |
| PPT Template Adaptation | `ppt-worker` | 8002 | Placeholder |
| Chat Log Extraction | `chat-worker` | 8003 | Placeholder |

### Worker API Contract

All workers implement:

- `POST /jobs` — submit job: `{ taskId, taskType, inputPath, outputDir, config? }` → `{ jobId }`
- `GET /jobs/:jobId` — poll status: → `{ status, resultPath?, error? }`
- `GET /health` — health check: → `{ ok: true }`

### Task Dispatch Flow

1. User uploads file → `POST /api/files/upload` → saved to shared volume
2. User selects task → `POST /api/tasks` → backend creates Task record, calls worker `POST /jobs`
3. Frontend polls `GET /api/tasks/:id` → backend queries worker `GET /jobs/:jobId`
4. On completion → `GET /api/files/download/:taskId` streams result from shared volume

## Data Model

See `prisma/schema.prisma`. Key models:

- `PlatformAdmin`, `PlatformAdminSession` — platform admin auth
- `User`, `Session` — user auth
- `UploadedFile` — uploaded file metadata (one user → many files)
- `Task` — processing task (one file → many tasks, tracks status + worker job ID)

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/login` | User login |
| `/` | Tool selector dashboard |
| `/workflows/doc-processing` | Document processing: upload + preview + AI chat shell |
| `/admin/login` | Platform admin login |
| `/admin` | Admin console: user management, system overview |

## Deployment

### Development

```bash
docker compose up --build
```

Starts: PostgreSQL, web app, doc-processing worker. Web at `http://localhost:3000`.

### Production

```bash
cd deploy/production
cp .env.production.example .env.production
# Edit .env.production with real values
docker compose --env-file .env.production up --build -d
```

Starts: PostgreSQL, web app, doc-processing worker, Caddy. Auto HTTPS via Caddy.

### Environment Variables

See `.env.example` (dev) and `deploy/production/.env.production.example` (prod).

Critical variables:
- `DATABASE_URL` — PostgreSQL connection string
- `PLATFORM_ADMIN_USERNAME` / `PLATFORM_ADMIN_PASSWORD` — bootstrapped on first run
- `DOC_WORKER_URL` / `PPT_WORKER_URL` / `CHAT_WORKER_URL` — worker HTTP endpoints
- `UPLOAD_DIR` / `OUTPUT_DIR` — shared volume paths

## Adding a New Worker

1. Create `workers/<name>/` with `Dockerfile`, `server.js` (or any language), `package.json`
2. Implement the 3-endpoint API contract (`POST /jobs`, `GET /jobs/:jobId`, `GET /health`)
3. Add the service to `docker-compose.yml` and `deploy/production/docker-compose.yml`
4. Add environment variable `<NAME>_WORKER_URL` pointing to the container
5. Add the workflow type to `WorkflowType` enum in `prisma/schema.prisma`, run migration
6. Add the worker URL to `src/lib/workers.ts` registry
7. Create the workflow's frontend page under `src/app/(dashboard)/workflows/<name>/`
