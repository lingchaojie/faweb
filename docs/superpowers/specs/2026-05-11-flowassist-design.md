# FlowAssist — Workflow Web Application Design

## Overview

FlowAssist is a workflow tool web application. Users log in, select a workflow tool, upload files, and dispatch processing tasks to dedicated Docker worker containers. Each workflow runs in an independent always-on container exposing a standard HTTP API.

## Architecture

**Monolith Web + Sidecar Workers**

- **Caddy** — reverse proxy, auto HTTPS (:80/:443)
- **Next.js 15** — single app handling frontend (React) + backend (API routes)
- **PostgreSQL 16** — users, sessions, task records, file metadata
- **Shared Docker Volume** — file exchange between web app and workers
- **3 Worker Containers** — always-on, each exposes HTTP API on dedicated port

```
Caddy (:80/:443)
  └─ Next.js Web App (:3000)
       ├─ PostgreSQL (:5432)
       ├─ Shared Volume (/data/uploads, /data/output)
       └─ Workers
            ├─ Doc Processing Worker (:8001)
            ├─ PPT Template Worker (:8002)
            └─ Chat Extraction Worker (:8003)
```

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS 4, Lucide icons
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** Cookie-based sessions with SHA-256 hashed tokens (same pattern as Factory System)
- **Deployment:** Docker Compose + Caddy reverse proxy
- **Workers:** Independent Docker containers, any language/runtime, standard HTTP API contract

## Authentication

Dual-layer auth system (adapted from Factory System):

### User Auth
- Users have `username`, `displayName`, `passwordHash`, `role` (admin/user)
- No workspace/multi-tenancy — simpler than Factory System
- Session tokens: random 32 bytes, stored as SHA-256 hash in DB
- Cookie: httpOnly, sameSite=lax, secure in production
- `admin` role can manage users within the app
- `user` role is for normal users

### Platform Admin Auth
- Separate model and session table
- Separate login page (`/admin/login`) and console (`/admin`)
- Manages all users, views system-wide usage
- Bootstrap credentials via environment variables

## Data Model

### Auth Layer

```
PlatformAdmin
  id, username (unique), displayName, passwordHash, createdAt, updatedAt
  → PlatformAdminSession[]

PlatformAdminSession
  id, adminId → PlatformAdmin, tokenHash (unique), expiresAt, createdAt

User
  id, username (unique), displayName, role (admin|user), passwordHash, createdAt, updatedAt
  → Session[], UploadedFile[], Task[]

Session
  id, userId → User, tokenHash (unique), expiresAt, createdAt
```

### Business Layer

```
UploadedFile
  id, userId → User, originalName, storedPath, sizeBytes, mimeType, createdAt
  → Task[]

Task
  id, fileId → UploadedFile, userId → User
  workflowType (enum: doc_processing | ppt_template | chat_extraction)
  taskType (string, e.g. "pdf_to_ppt", "pdf_to_word")
  status (enum: pending | processing | completed | failed)
  workerJobId, resultPath, errorMessage
  createdAt, updatedAt
```

Key relationships:
- One user → many files
- One file → many tasks (upload once, run multiple tasks)
- `workflowType` determines which worker container handles the task
- `taskType` specifies the operation within that workflow
- `resultPath` points to output file on shared volume

## Worker HTTP API Contract

All worker containers implement the same 3 endpoints:

### POST /jobs
Submit a new job.
- Request: `{ taskId, taskType, inputPath, outputDir, config? }`
- Response: `{ jobId }`

### GET /jobs/:jobId
Poll job status.
- Response: `{ status: "processing"|"completed"|"failed", resultPath?, error? }`

### GET /health
Health check for Docker Compose dependency.
- Response: `{ ok: true }`

## Task Dispatch Flow

1. **Upload:** Frontend POST file → backend saves to shared volume, creates UploadedFile record
2. **Create task:** User selects task type → backend creates Task (pending), calls worker `POST /jobs`
3. **Processing:** Worker reads input from shared volume, processes, writes output back
4. **Polling:** Frontend polls `GET /api/tasks/:id` → backend queries worker `GET /jobs/:jobId`, updates Task record
5. **Download:** On completion, frontend calls `GET /api/files/download/:taskId` → backend streams result from shared volume

## Workflows

### 1. Document Processing (Worker :8001)
Task types: `pdf_to_ppt`, `pdf_to_word`, `pdf_extract_text`

### 2. PPT Template Adaptation (Worker :8002)
Content adaptation to specified PPT templates.

### 3. Chat Log Extraction (Worker :8003)
Extract information from chat records and fill into forms/spreadsheets.

Each workflow will have its own unique UI within the app. Business logic for all three is deferred — only the architecture, API contract, and stub workers are implemented now.

## Frontend Design

### Design System
- **Palette:** Zinc-based neutrals (#18181b, #52525b, #71717a, #a1a1aa). Black primary buttons.
- **Icons:** Lucide line icons, monochrome, consistent stroke weight.
- **Typography:** Tight letter-spacing, medium weight. Inter or system font.
- **Cards:** Subtle 1px borders (#e4e4e7), border-radius max 12px, minimal shadows.
- **Feel:** Clean, utilitarian, enterprise SaaS (Linear/Vercel/Notion aesthetic).

### Pages

**`/login`** — User login. Light background (#fafafa), centered white card with logo, username/password fields, black login button.

**`/`** — Tool selector dashboard. Top nav (logo + user avatar, no global task history). Three workflow cards displayed horizontally with Lucide icons.

**`/workflows/doc-processing`** — Document processing workflow.
- Breadcrumb nav: FlowAssist > 文档处理. "历史任务" link in top right (scoped to this workflow).
- Left panel (340px): File upload dropzone, uploaded file display, task checkboxes (PDF 转 PPT, PDF 转 Word, etc.), "开始处理" button.
- Right area: Top is PPT/document preview pane. Bottom is AI chat input for iterative refinement of results.

**`/workflows/ppt-template`** — PPT template adaptation (UI TBD, different from doc processing).

**`/workflows/chat-extraction`** — Chat log extraction (UI TBD, different from doc processing).

**`/admin/login`** — Platform admin login.

**`/admin`** — Admin console. User management, system usage overview.

## File Storage

Local disk with Docker volumes (same as Factory System):
- `/data/uploads` — user-uploaded files
- `/data/output` — worker output files
- Mounted as shared volume accessible by web app and all workers

## Deployment

### Development
- `docker-compose.yml` at project root: web + db + 3 workers
- Hot reload via volume mounts for Next.js

### Production
- `deploy/production/docker-compose.yml`: web + db + 3 workers + Caddy
- `deploy/production/Caddyfile`: reverse proxy with auto TLS
- `deploy/production/.env.production.example`: all required environment variables
- China mirror support for npm registry and Alpine packages (same as Factory System)
- Named volumes for persistence: postgres data, uploaded files, output files, Caddy data

## Scope — What Gets Implemented Now

1. Full Next.js project scaffolding with Tailwind CSS 4, Prisma, TypeScript
2. Database schema (all models above) with migrations
3. User auth (login, session, logout) + Platform admin auth
4. Frontend: login page, dashboard/tool selector, document processing workflow UI (upload + preview + chat shell)
5. Backend: file upload API, task creation API, task status polling API, file download API
6. Task dispatch to workers via HTTP
7. Stub worker container (doc-processing) that accepts jobs and returns mock results
8. Docker Compose for dev and production
9. Caddy reverse proxy config
10. Deployment scripts and .env examples
11. Architecture documentation in agents.md

## What Is NOT Implemented Now

- Actual PDF-to-PPT conversion logic (worker returns stub/mock)
- PPT template adaptation workflow UI and logic
- Chat extraction workflow UI and logic
- AI chat refinement functionality (chat input is rendered but non-functional)
- PPT preview rendering
