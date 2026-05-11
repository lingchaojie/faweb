# FlowAssist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workflow web application with dual auth, file upload, Docker-based task dispatch, and a document processing workflow UI.

**Architecture:** Monolith Next.js 15 app (frontend + API) with Prisma/PostgreSQL. Worker containers run as always-on HTTP services. Shared Docker volume for file exchange. Caddy reverse proxy for production.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, Prisma, PostgreSQL 16, Lucide React, Docker Compose, Caddy

**Reference:** Factory System at `/home/alvin/FactorySystem` — adapt auth patterns, deployment structure, and Dockerfile approach from there.

---

## File Structure

```
FAWeb_final/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── .gitignore
├── .dockerignore
├── .env.example
├── Dockerfile
├── docker-entrypoint.sh
├── docker-compose.yml                    # dev
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx                    # root layout
│   │   ├── login/
│   │   │   └── page.tsx                  # user login
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # auth guard + nav
│   │   │   ├── page.tsx                  # tool selector
│   │   │   └── workflows/
│   │   │       └── doc-processing/
│   │   │           └── page.tsx          # upload + preview + chat
│   │   ├── admin/
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # admin login
│   │   │   └── (console)/
│   │   │       ├── layout.tsx            # admin auth guard
│   │   │       └── page.tsx              # admin dashboard
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   └── logout/route.ts
│   │       ├── admin/auth/
│   │       │   ├── login/route.ts
│   │       │   └── logout/route.ts
│   │       ├── files/
│   │       │   ├── upload/route.ts
│   │       │   └── download/[taskId]/route.ts
│   │       └── tasks/
│   │           ├── route.ts              # POST create task
│   │           └── [id]/route.ts         # GET poll status
│   ├── lib/
│   │   ├── db.ts
│   │   ├── password.ts
│   │   ├── session.ts
│   │   ├── auth.ts
│   │   ├── admin-session.ts
│   │   ├── admin-auth.ts
│   │   ├── redirect-url.ts
│   │   └── workers.ts                    # worker registry + HTTP dispatch
│   └── components/
│       ├── nav-bar.tsx                   # top navigation bar
│       └── admin-shell.tsx               # admin console layout shell
├── workers/
│   └── doc-processing/
│       ├── Dockerfile
│       ├── package.json
│       └── server.js                     # stub Express server
├── deploy/
│   └── production/
│       ├── docker-compose.yml
│       ├── Caddyfile
│       ├── .env.production.example
│       └── .gitignore
├── storage/                              # gitignored, mounted as volume
└── agents.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`, `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/alvin/FAWeb_final
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "flowassist",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 0.0.0.0",
    "build": "prisma generate && next build",
    "start": "next start --hostname 0.0.0.0",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.19.3",
    "bcryptjs": "^3.0.3",
    "clsx": "^2.1.1",
    "lucide-react": "^1.14.0",
    "next": "^15.5.18",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^15.5.18",
    "prisma": "^6.19.3",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Create tailwind.config.ts**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
```

- [ ] **Step 6: Create postcss.config.mjs**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 7: Create eslint.config.mjs**

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];

export default eslintConfig;
```

- [ ] **Step 8: Create .gitignore**

```
node_modules/
.next/
.env
.env.local
.env.production
storage/
*.tsbuildinfo
next-env.d.ts
.superpowers/
```

- [ ] **Step 9: Create .env.example**

```
DATABASE_URL="postgresql://flowassist:flowassist_password@localhost:5433/flowassist?schema=public"
APP_ORIGIN="http://localhost:3000"

POSTGRES_DB="flowassist"
POSTGRES_USER="flowassist"
POSTGRES_PASSWORD="flowassist_password"

PLATFORM_ADMIN_USERNAME="admin"
PLATFORM_ADMIN_DISPLAY_NAME="平台管理员"
PLATFORM_ADMIN_PASSWORD="change-me-before-use"

BOOTSTRAP_USER_USERNAME=""
BOOTSTRAP_USER_DISPLAY_NAME=""
BOOTSTRAP_USER_PASSWORD=""

SESSION_COOKIE_NAME="flowassist_session"
ADMIN_SESSION_COOKIE_NAME="flowassist_admin_session"
SESSION_TTL_DAYS="30"
SESSION_COOKIE_SECURE="false"

DOC_WORKER_URL="http://doc-worker:8001"
PPT_WORKER_URL="http://ppt-worker:8002"
CHAT_WORKER_URL="http://chat-worker:8003"

UPLOAD_DIR="/app/storage/uploads"
OUTPUT_DIR="/app/storage/output"
```

- [ ] **Step 10: Create src/app/globals.css**

```css
@import "tailwindcss";

:root {
  --background: #fafafa;
  --foreground: #18181b;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 11: Create src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowAssist",
  description: "工作流工具平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

- [ ] **Step 12: Install dependencies and verify**

```bash
cp .env.example .env
npm install
npx next build 2>&1 | head -20
```

Expected: build succeeds (may warn about no pages yet, that's fine).

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs eslint.config.mjs .gitignore .env.example src/app/globals.css src/app/layout.tsx
git commit -m "feat: scaffold Next.js 15 project with Tailwind CSS 4"
```

---

### Task 2: Prisma Schema and Seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`, `src/lib/password.ts`

- [ ] **Step 1: Create src/lib/db.ts**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Create src/lib/password.ts**

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 3: Create prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  admin
  user
}

enum WorkflowType {
  doc_processing
  ppt_template
  chat_extraction
}

enum TaskStatus {
  pending
  processing
  completed
  failed
}

model PlatformAdmin {
  id           String   @id @default(cuid())
  username     String   @unique
  displayName  String
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions PlatformAdminSession[]
}

model PlatformAdminSession {
  id        String   @id @default(cuid())
  adminId   String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  admin PlatformAdmin @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId])
  @@index([expiresAt])
}

model User {
  id           String   @id @default(cuid())
  username     String   @unique
  displayName  String
  role         UserRole @default(user)
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions Session[]
  files    UploadedFile[]
  tasks    Task[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model UploadedFile {
  id           String   @id @default(cuid())
  userId       String
  originalName String
  storedPath   String
  sizeBytes    Int
  mimeType     String?
  createdAt    DateTime @default(now())

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@index([userId])
}

model Task {
  id           String       @id @default(cuid())
  fileId       String
  userId       String
  workflowType WorkflowType
  taskType     String
  status       TaskStatus   @default(pending)
  workerJobId  String?
  resultPath   String?
  errorMessage String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  file UploadedFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([fileId])
  @@index([userId, workflowType])
  @@index([status])
}
```

- [ ] **Step 4: Create prisma/seed.ts**

```ts
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const adminUsername = process.env.PLATFORM_ADMIN_USERNAME;
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  const adminDisplayName =
    process.env.PLATFORM_ADMIN_DISPLAY_NAME ?? adminUsername;

  if (!adminUsername || !adminPassword) {
    throw new Error(
      "PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD are required",
    );
  }

  const adminPasswordHash = await hashPassword(adminPassword);

  await prisma.platformAdmin.upsert({
    where: { username: adminUsername },
    update: {
      displayName: adminDisplayName ?? adminUsername,
      passwordHash: adminPasswordHash,
    },
    create: {
      username: adminUsername,
      displayName: adminDisplayName ?? adminUsername,
      passwordHash: adminPasswordHash,
    },
  });

  const userUsername = process.env.BOOTSTRAP_USER_USERNAME;
  const userPassword = process.env.BOOTSTRAP_USER_PASSWORD;

  if (userUsername && userPassword) {
    const userPasswordHash = await hashPassword(userPassword);
    const userDisplayName =
      process.env.BOOTSTRAP_USER_DISPLAY_NAME ?? userUsername;

    await prisma.user.upsert({
      where: { username: userUsername },
      update: {
        displayName: userDisplayName,
        role: "admin",
        passwordHash: userPasswordHash,
      },
      create: {
        username: userUsername,
        displayName: userDisplayName,
        role: "admin",
        passwordHash: userPasswordHash,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Start dev database and run migration**

```bash
# Start just the database via docker-compose (Task 14 creates the full file,
# but we need the DB now). Run this manually:
docker run -d --name flowassist-dev-db \
  -e POSTGRES_DB=flowassist \
  -e POSTGRES_USER=flowassist \
  -e POSTGRES_PASSWORD=flowassist_password \
  -p 5433:5432 \
  postgres:16-alpine

# Wait for healthy, then migrate
sleep 3
npx prisma migrate dev --name init
```

Expected: migration creates all tables successfully.

- [ ] **Step 6: Run seed**

```bash
npm run db:seed
```

Expected: seed completes, platform admin created.

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/lib/db.ts src/lib/password.ts
git commit -m "feat: add Prisma schema with auth + task models, seed script"
```

---

### Task 3: Auth Library

**Files:**
- Create: `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/admin-session.ts`, `src/lib/admin-auth.ts`, `src/lib/redirect-url.ts`

- [ ] **Step 1: Create src/lib/redirect-url.ts**

Adapted from Factory System.

```ts
export function appRedirectUrl(request: Request, pathname: string) {
  if (process.env.APP_ORIGIN) {
    return new URL(pathname, process.env.APP_ORIGIN);
  }

  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (url.hostname === "0.0.0.0" && host) {
    url.host = host;
  }

  return new URL(pathname, url);
}
```

- [ ] **Step 2: Create src/lib/session.ts**

```ts
import crypto from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const sessionCookieName =
  process.env.SESSION_COOKIE_NAME ?? "flowassist_session";

export type AuthenticatedUser = Pick<
  User,
  "id" | "username" | "displayName" | "role" | "createdAt" | "updatedAt"
>;

export const authenticatedUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getSessionTtlDays(): number {
  const value = Number(process.env.SESSION_TTL_DAYS ?? "30");
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function getSessionCookieSecure(): boolean {
  const configured = process.env.SESSION_COOKIE_SECURE?.toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
    },
  });

  return token;
}

export async function readSessionUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      expiresAt: true,
      user: { select: authenticatedUserSelect },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return;

  await prisma.session.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
```

- [ ] **Step 3: Create src/lib/auth.ts**

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  type AuthenticatedUser,
  authenticatedUserSelect,
  createSession,
  getSessionCookieSecure,
  getSessionTtlDays,
  readSessionUser,
  sessionCookieName,
} from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      ...authenticatedUserSelect,
      passwordHash: true,
    },
  });

  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getSessionCookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * getSessionTtlDays(),
  });

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 4: Create src/lib/admin-session.ts**

```ts
import crypto from "node:crypto";
import type { PlatformAdmin, Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSessionCookieSecure, getSessionTtlDays } from "@/lib/session";

export const adminSessionCookieName =
  process.env.ADMIN_SESSION_COOKIE_NAME ?? "flowassist_admin_session";

export type AuthenticatedPlatformAdmin = Pick<
  PlatformAdmin,
  "id" | "username" | "displayName" | "createdAt" | "updatedAt"
>;

export const authenticatedPlatformAdminSelect = {
  id: true,
  username: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlatformAdminSelect;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createPlatformAdminSession(
  adminId: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000,
  );

  await prisma.platformAdminSession.create({
    data: {
      adminId,
      tokenHash: sha256(token),
      expiresAt,
    },
  });

  return token;
}

export async function readPlatformAdminSession(): Promise<AuthenticatedPlatformAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.platformAdminSession.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      expiresAt: true,
      admin: { select: authenticatedPlatformAdminSelect },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return session.admin;
}

export async function destroyCurrentPlatformAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;
  if (!token) return;

  await prisma.platformAdminSession.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}

export function platformAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getSessionCookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * getSessionTtlDays(),
  };
}
```

- [ ] **Step 5: Create src/lib/admin-auth.ts**

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  type AuthenticatedPlatformAdmin,
  adminSessionCookieName,
  authenticatedPlatformAdminSelect,
  createPlatformAdminSession,
  platformAdminCookieOptions,
  readPlatformAdminSession,
} from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export async function loginPlatformAdminWithPassword(
  username: string,
  password: string,
): Promise<AuthenticatedPlatformAdmin | null> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { username },
    select: {
      ...authenticatedPlatformAdminSelect,
      passwordHash: true,
    },
  });

  if (!admin) return null;

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) return null;

  const token = await createPlatformAdminSession(admin.id);
  const cookieStore = await cookies();
  cookieStore.set(adminSessionCookieName, token, platformAdminCookieOptions());

  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

export async function requirePlatformAdmin() {
  const admin = await readPlatformAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/redirect-url.ts src/lib/session.ts src/lib/auth.ts src/lib/admin-session.ts src/lib/admin-auth.ts
git commit -m "feat: add dual auth library (user + platform admin sessions)"
```

---

### Task 4: Auth API Routes

**Files:**
- Create: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/admin/auth/login/route.ts`, `src/app/api/admin/auth/logout/route.ts`

- [ ] **Step 1: Create src/app/api/auth/login/route.ts**

```ts
import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";
import { appRedirectUrl } from "@/lib/redirect-url";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await loginWithPassword(username, password);
  if (!user) {
    return NextResponse.redirect(
      appRedirectUrl(request, "/login?error=1"),
      303,
    );
  }

  return NextResponse.redirect(appRedirectUrl(request, "/"), 303);
}
```

- [ ] **Step 2: Create src/app/api/auth/logout/route.ts**

```ts
import { NextResponse } from "next/server";
import { appRedirectUrl } from "@/lib/redirect-url";
import { destroyCurrentSession, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  const response = NextResponse.redirect(appRedirectUrl(request, "/login"), 303);
  response.cookies.delete(sessionCookieName);
  return response;
}
```

- [ ] **Step 3: Create src/app/api/admin/auth/login/route.ts**

```ts
import { NextResponse } from "next/server";
import { loginPlatformAdminWithPassword } from "@/lib/admin-auth";
import { appRedirectUrl } from "@/lib/redirect-url";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  const admin = await loginPlatformAdminWithPassword(username, password);
  if (!admin) {
    return NextResponse.redirect(
      appRedirectUrl(request, "/admin/login?error=1"),
      303,
    );
  }

  return NextResponse.redirect(appRedirectUrl(request, "/admin"), 303);
}
```

- [ ] **Step 4: Create src/app/api/admin/auth/logout/route.ts**

```ts
import { NextResponse } from "next/server";
import { appRedirectUrl } from "@/lib/redirect-url";
import {
  adminSessionCookieName,
  destroyCurrentPlatformAdminSession,
} from "@/lib/admin-session";

export async function POST(request: Request) {
  await destroyCurrentPlatformAdminSession();
  const response = NextResponse.redirect(
    appRedirectUrl(request, "/admin/login"),
    303,
  );
  response.cookies.delete(adminSessionCookieName);
  return response;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: add auth API routes (login/logout for user + admin)"
```

---

### Task 5: Login Pages

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/admin/login/page.tsx`

- [ ] **Step 1: Create src/app/login/page.tsx**

Design: zinc neutrals, #fafafa background, white card, black login button, FA logo.

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white">
              FA
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-zinc-900">
              FlowAssist
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            登录以访问工作流工具
          </p>
        </div>
        <form
          action="/api/auth/login"
          method="post"
          className="rounded-xl border border-zinc-200 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          {error ? (
            <p className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              账号或密码不正确
            </p>
          ) : null}
          <label className="block text-[13px] font-medium text-zinc-900">
            账号
            <input
              name="username"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />
          </label>
          <label className="mt-5 block text-[13px] font-medium text-zinc-900">
            密码
            <input
              name="password"
              type="password"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
            登录
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create src/app/admin/login/page.tsx**

```tsx
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white">
              FA
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-zinc-900">
              FlowAssist
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            平台管理后台
          </p>
        </div>
        <form
          action="/api/admin/auth/login"
          method="post"
          className="rounded-xl border border-zinc-200 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          {error ? (
            <p className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              账号或密码不正确
            </p>
          ) : null}
          <label className="block text-[13px] font-medium text-zinc-900">
            账号
            <input
              name="username"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入管理员账号"
              autoComplete="username"
              required
            />
          </label>
          <label className="mt-5 block text-[13px] font-medium text-zinc-900">
            密码
            <input
              name="password"
              type="password"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
            登录后台
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify login pages render**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/login | grep "FlowAssist"
curl -s http://localhost:3000/admin/login | grep "平台管理后台"
kill %1
```

Expected: both pages return HTML containing the expected text.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/ src/app/admin/login/
git commit -m "feat: add user and admin login pages"
```

---

### Task 6: Dashboard Layout, Nav Bar, and Tool Selector

**Files:**
- Create: `src/components/nav-bar.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create src/components/nav-bar.tsx**

```tsx
import { FileText, Monitor, MessageSquare, ChevronRight } from "lucide-react";
import Link from "next/link";

export function NavBar({
  user,
  breadcrumb,
}: {
  user: { displayName: string };
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-zinc-900 text-[10px] font-semibold text-white">
            FA
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            FlowAssist
          </span>
        </Link>
        {breadcrumb?.map((item) => (
          <span key={item.label} className="flex items-center gap-3">
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            {item.href ? (
              <Link
                href={item.href}
                className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-[13px] font-medium text-zinc-600">
                {item.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <form action="/api/auth/logout" method="post">
          <button className="text-xs text-zinc-500 hover:text-zinc-700">
            退出
          </button>
        </form>
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-[11px] font-medium text-zinc-600">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create src/app/(dashboard)/layout.tsx**

```tsx
import { NavBar } from "@/components/nav-bar";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar
        user={{ displayName: user.displayName }}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create src/app/(dashboard)/page.tsx**

Tool selector dashboard with three workflow cards.

```tsx
import { FileText, Monitor, MessageSquare } from "lucide-react";
import Link from "next/link";

const workflows = [
  {
    href: "/workflows/doc-processing",
    icon: FileText,
    label: "文档处理",
    description: "PDF 转 PPT、格式转换",
  },
  {
    href: "/workflows/ppt-template",
    icon: Monitor,
    label: "PPT 模板适配",
    description: "内容适配到指定 PPT 模板",
  },
  {
    href: "/workflows/chat-extraction",
    icon: MessageSquare,
    label: "聊天记录提取",
    description: "从聊天记录提取信息并填入表格",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-base font-semibold text-zinc-900">工作流工具</h1>
      <p className="mt-1 text-[13px] text-zinc-500">选择要使用的工具</p>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {workflows.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className="flex items-center gap-3.5 rounded-[10px] border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-900"
          >
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
              <w.icon className="h-[18px] w-[18px] text-zinc-600" />
            </div>
            <div>
              <div className="text-[13px] font-medium text-zinc-900">
                {w.label}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-500">
                {w.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/nav-bar.tsx src/app/\(dashboard\)/
git commit -m "feat: add dashboard layout with nav bar and tool selector"
```

---

### Task 7: Worker Dispatch Library

**Files:**
- Create: `src/lib/workers.ts`

- [ ] **Step 1: Create src/lib/workers.ts**

Registry of worker URLs by workflow type, plus HTTP client to call the standard worker API contract.

```ts
import type { WorkflowType } from "@prisma/client";

const workerUrls: Record<WorkflowType, string> = {
  doc_processing: process.env.DOC_WORKER_URL ?? "http://localhost:8001",
  ppt_template: process.env.PPT_WORKER_URL ?? "http://localhost:8002",
  chat_extraction: process.env.CHAT_WORKER_URL ?? "http://localhost:8003",
};

function getWorkerUrl(workflowType: WorkflowType): string {
  return workerUrls[workflowType];
}

export async function submitJob(
  workflowType: WorkflowType,
  payload: {
    taskId: string;
    taskType: string;
    inputPath: string;
    outputDir: string;
    config?: Record<string, unknown>;
  },
): Promise<{ jobId: string }> {
  const baseUrl = getWorkerUrl(workflowType);
  const res = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker ${workflowType} returned ${res.status}: ${text}`);
  }

  return res.json();
}

export async function pollJob(
  workflowType: WorkflowType,
  jobId: string,
): Promise<{
  status: "processing" | "completed" | "failed";
  resultPath?: string;
  error?: string;
}> {
  const baseUrl = getWorkerUrl(workflowType);
  const res = await fetch(`${baseUrl}/jobs/${jobId}`);

  if (!res.ok) {
    throw new Error(`Worker ${workflowType} poll returned ${res.status}`);
  }

  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/workers.ts
git commit -m "feat: add worker dispatch library with HTTP client"
```

---

### Task 8: File Upload and Download API

**Files:**
- Create: `src/app/api/files/upload/route.ts`, `src/app/api/files/download/[taskId]/route.ts`

- [ ] **Step 1: Create src/app/api/files/upload/route.ts**

```ts
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import crypto from "node:crypto";

const uploadDir = process.env.UPLOAD_DIR ?? "./storage/uploads";

export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = file.name.includes(".")
    ? "." + file.name.split(".").pop()
    : "";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const userDir = join(uploadDir, user.id);
  await mkdir(userDir, { recursive: true });
  const storedPath = join(userDir, storedName);

  await writeFile(storedPath, buffer);

  const record = await prisma.uploadedFile.create({
    data: {
      userId: user.id,
      originalName: file.name,
      storedPath,
      sizeBytes: buffer.length,
      mimeType: file.type || null,
    },
  });

  return NextResponse.json({
    id: record.id,
    originalName: record.originalName,
    sizeBytes: record.sizeBytes,
    mimeType: record.mimeType,
  });
}
```

- [ ] **Step 2: Create src/app/api/files/download/[taskId]/route.ts**

```ts
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { userId: true, resultPath: true, status: true, taskType: true },
  });

  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.resultPath) {
    return NextResponse.json({ error: "Task not completed" }, { status: 400 });
  }

  if (!existsSync(task.resultPath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileStat = await stat(task.resultPath);
  const stream = createReadStream(task.resultPath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  const ext = task.resultPath.split(".").pop() ?? "bin";
  const filename = `result-${task.taskType}.${ext}`;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/files/
git commit -m "feat: add file upload and download API routes"
```

---

### Task 9: Task API (Create + Poll)

**Files:**
- Create: `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Create src/app/api/tasks/route.ts**

POST creates a task and dispatches to the worker.

```ts
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { submitJob } from "@/lib/workers";
import type { WorkflowType } from "@prisma/client";

const outputDir = process.env.OUTPUT_DIR ?? "./storage/output";

const validWorkflowTypes = new Set<string>([
  "doc_processing",
  "ppt_template",
  "chat_extraction",
]);

export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { fileId, workflowType, taskType } = body;

  if (!fileId || !workflowType || !taskType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!validWorkflowTypes.has(workflowType)) {
    return NextResponse.json({ error: "Invalid workflowType" }, { status: 400 });
  }

  const file = await prisma.uploadedFile.findUnique({
    where: { id: fileId },
    select: { id: true, userId: true, storedPath: true },
  });

  if (!file || file.userId !== user.id) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      fileId: file.id,
      userId: user.id,
      workflowType: workflowType as WorkflowType,
      taskType,
      status: "pending",
    },
  });

  try {
    const { jobId } = await submitJob(workflowType as WorkflowType, {
      taskId: task.id,
      taskType,
      inputPath: file.storedPath,
      outputDir,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "processing", workerJobId: jobId },
    });

    return NextResponse.json({
      id: task.id,
      status: "processing",
      workerJobId: jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker dispatch failed";
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "failed", errorMessage: message },
    });

    return NextResponse.json({
      id: task.id,
      status: "failed",
      error: message,
    }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create src/app/api/tasks/[id]/route.ts**

GET polls the worker for status updates.

```ts
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { pollJob } from "@/lib/workers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      workflowType: true,
      taskType: true,
      workerJobId: true,
      resultPath: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status === "processing" && task.workerJobId) {
    try {
      const result = await pollJob(task.workflowType, task.workerJobId);

      if (result.status !== "processing") {
        const updated = await prisma.task.update({
          where: { id: task.id },
          data: {
            status: result.status,
            resultPath: result.resultPath ?? null,
            errorMessage: result.error ?? null,
          },
        });
        return NextResponse.json({
          id: updated.id,
          status: updated.status,
          resultPath: updated.resultPath,
          errorMessage: updated.errorMessage,
        });
      }
    } catch {
      // Worker unreachable — return current DB state
    }
  }

  return NextResponse.json({
    id: task.id,
    status: task.status,
    resultPath: task.resultPath,
    errorMessage: task.errorMessage,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/
git commit -m "feat: add task create and poll API routes with worker dispatch"
```

---

### Task 10: Document Processing Workflow Page

**Files:**
- Create: `src/app/(dashboard)/workflows/doc-processing/page.tsx`

- [ ] **Step 1: Create the doc-processing workflow page**

This is a client component with file upload, task selection, preview area, and chat input shell.

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Send } from "lucide-react";
import { NavBar } from "@/components/nav-bar";

type UploadedFile = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
};

type TaskRecord = {
  id: string;
  status: string;
  resultPath?: string | null;
  errorMessage?: string | null;
};

const taskOptions = [
  { value: "pdf_to_ppt", label: "PDF 转 PPT" },
  { value: "pdf_to_word", label: "PDF 转 Word" },
  { value: "pdf_extract_text", label: "PDF 提取文本" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function DocProcessingPage() {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (fileObj: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileObj);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setFile(data);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleUpload(droppedFile);
    },
    [handleUpload],
  );

  const handleSubmit = useCallback(async () => {
    if (!file || selectedTasks.size === 0) return;
    setProcessing(true);

    const newTasks: TaskRecord[] = [];
    for (const taskType of selectedTasks) {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            workflowType: "doc_processing",
            taskType,
          }),
        });
        const data = await res.json();
        newTasks.push(data);
      } catch {
        newTasks.push({ id: "error", status: "failed", errorMessage: "Request failed" });
      }
    }

    setTasks(newTasks);
    setProcessing(false);

    // Poll for completion
    for (const task of newTasks) {
      if (task.status === "processing") {
        pollTask(task.id);
      }
    }
  }, [file, selectedTasks]);

  const pollTask = useCallback(async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const data = await res.json();
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? data : t)),
        );
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  const toggleTask = (value: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Left panel */}
      <div className="flex w-[340px] shrink-0 flex-col border-r border-zinc-200 bg-white p-5">
        <div className="mb-3 text-[13px] font-semibold text-zinc-900">
          上传文件
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-zinc-300 bg-zinc-50 transition-colors hover:border-zinc-400"
        >
          <Upload className="h-8 w-8 text-zinc-400" />
          <div className="text-[13px] font-medium text-zinc-600">
            {uploading ? "上传中..." : "拖放文件到此处"}
          </div>
          <div className="text-[12px] text-zinc-400">或点击选择文件</div>
          <div className="text-[11px] text-zinc-400">支持 PDF, DOCX, XLSX</div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.pptx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>

        {/* Uploaded file */}
        {file && (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50">
              <span className="text-[11px] font-semibold text-red-600">
                {file.originalName.split(".").pop()?.toUpperCase() ?? "FILE"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-zinc-900">
                {file.originalName}
              </div>
              <div className="text-[11px] text-zinc-400">
                {formatFileSize(file.sizeBytes)}
              </div>
            </div>
            <button onClick={() => setFile(null)}>
              <X className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          </div>
        )}

        {/* Task selection */}
        <div className="mt-4">
          <div className="mb-2 text-[13px] font-semibold text-zinc-900">
            选择任务
          </div>
          {taskOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 py-2"
            >
              <input
                type="checkbox"
                checked={selectedTasks.has(opt.value)}
                onChange={() => toggleTask(opt.value)}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
              />
              <span className="text-[13px] text-zinc-700">{opt.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!file || selectedTasks.size === 0 || processing}
          className="mt-auto rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {processing ? "处理中..." : "开始处理"}
        </button>
      </div>

      {/* Right area */}
      <div className="flex flex-1 flex-col">
        {/* Preview */}
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-zinc-900">
              预览
            </span>
            {tasks.some((t) => t.status === "completed") && (
              <a
                href={`/api/files/download/${tasks.find((t) => t.status === "completed")?.id}`}
                className="rounded-md bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
              >
                下载结果
              </a>
            )}
          </div>
          <div className="flex flex-1 items-center justify-center rounded-[10px] border border-zinc-200 bg-white">
            {tasks.length === 0 ? (
              <div className="text-center">
                <FileText className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
                <div className="text-[13px] text-zinc-500">
                  上传文件并选择任务后
                </div>
                <div className="text-[13px] text-zinc-500">
                  转换结果将在此预览
                </div>
              </div>
            ) : (
              <div className="w-full p-6">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="mb-2 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-700">{t.id}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        t.status === "completed"
                          ? "bg-green-50 text-green-700"
                          : t.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : "bg-yellow-50 text-yellow-700"
                      }`}
                    >
                      {t.status === "processing"
                        ? "处理中"
                        : t.status === "completed"
                          ? "已完成"
                          : t.status === "failed"
                            ? "失败"
                            : "等待中"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat input */}
        <div className="border-t border-zinc-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="对 AI 说些什么来调整结果..."
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
            />
            <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900">
              <Send className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-400">
            处理完成后，可以通过对话让 AI 继续调整输出结果
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: This page uses the dashboard layout which already provides `<NavBar>`. The breadcrumb needs to be passed. We need to adjust the dashboard layout to support per-page breadcrumbs. Instead, let's make the doc-processing page a full page that renders its own nav bar.

Actually, the dashboard layout already renders the NavBar without breadcrumbs. For the workflow pages, we should override the nav. The simpler approach: the dashboard layout renders NavBar for the root page, and workflow pages are nested within the same layout group. We can make the breadcrumb conditional by checking the path. But in Next.js App Router, the simplest approach is: the doc-processing page is a client component rendered inside the dashboard layout. The layout provides the NavBar (without breadcrumb for `/`), but for workflow pages, we want breadcrumb.

The cleanest approach: add a workflows layout that overrides the nav. But that complicates things. For now, the dashboard layout provides a plain NavBar for all pages. We can add breadcrumb support later. The doc-processing page is rendered inside the dashboard layout, which already provides auth check and nav.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/workflows/
git commit -m "feat: add document processing workflow page with upload, task select, preview, and chat shell"
```

---

### Task 11: Admin Console

**Files:**
- Create: `src/components/admin-shell.tsx`, `src/app/admin/(console)/layout.tsx`, `src/app/admin/(console)/page.tsx`

- [ ] **Step 1: Create src/components/admin-shell.tsx**

```tsx
import Link from "next/link";

export function AdminShell({
  adminDisplayName,
  children,
}: {
  adminDisplayName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-zinc-900 text-[10px] font-semibold text-white">
            FA
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            FlowAssist
          </span>
          <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            管理后台
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{adminDisplayName}</span>
          <form action="/api/admin/auth/logout" method="post">
            <button className="text-xs text-zinc-500 hover:text-zinc-700">
              退出
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 bg-[#fafafa]">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create src/app/admin/(console)/layout.tsx**

```tsx
import { AdminShell } from "@/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/admin-auth";

export default async function AdminConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requirePlatformAdmin();

  return (
    <AdminShell adminDisplayName={admin.displayName}>{children}</AdminShell>
  );
}
```

- [ ] **Step 3: Create src/app/admin/(console)/page.tsx**

Displays user list with ability to see all users. Full CRUD deferred.

```tsx
import { prisma } from "@/lib/db";

export default async function AdminDashboardPage() {
  const userCount = await prisma.user.count();
  const taskCount = await prisma.task.count();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-base font-semibold text-zinc-900">系统概览</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
          <div className="text-[12px] text-zinc-500">用户总数</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {userCount}
          </div>
        </div>
        <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
          <div className="text-[12px] text-zinc-500">任务总数</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {taskCount}
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">用户列表</h2>
      <div className="mt-3 overflow-hidden rounded-[10px] border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left">
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                用户名
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                显示名称
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                角色
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                任务数
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2.5 text-zinc-900">{user.username}</td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {user.displayName}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      user.role === "admin"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {user.role === "admin" ? "管理员" : "用户"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {user._count.tasks}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-[13px] text-zinc-400"
                >
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin-shell.tsx src/app/admin/\(console\)/
git commit -m "feat: add admin console with user list and system overview"
```

---

### Task 12: Stub Doc-Processing Worker

**Files:**
- Create: `workers/doc-processing/package.json`, `workers/doc-processing/server.js`, `workers/doc-processing/Dockerfile`

- [ ] **Step 1: Create workers/doc-processing/package.json**

```json
{
  "name": "doc-processing-worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create workers/doc-processing/server.js**

Stub worker: accepts jobs, waits 5 seconds, writes a placeholder output file.

```js
const express = require("express");
const { randomUUID } = require("node:crypto");
const { writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const app = express();
app.use(express.json());

const jobs = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/jobs", async (req, res) => {
  const { taskId, taskType, inputPath, outputDir } = req.body;

  if (!taskId || !taskType || !inputPath || !outputDir) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "processing", taskId, taskType, inputPath, outputDir });

  // Simulate processing: after 5 seconds, create a stub output
  setTimeout(async () => {
    try {
      await mkdir(outputDir, { recursive: true });
      const ext = taskType === "pdf_to_ppt" ? "pptx"
        : taskType === "pdf_to_word" ? "docx"
        : "txt";
      const resultPath = join(outputDir, `${taskId}-result.${ext}`);
      await writeFile(resultPath, `Stub output for ${taskType} from ${inputPath}`);
      jobs.set(jobId, { status: "completed", resultPath });
    } catch (err) {
      jobs.set(jobId, { status: "failed", error: err.message });
    }
  }, 5000);

  res.json({ jobId });
});

app.get("/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({
    status: job.status,
    resultPath: job.resultPath ?? undefined,
    error: job.error ?? undefined,
  });
});

const PORT = process.env.PORT ?? 8001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Doc processing worker listening on :${PORT}`);
});
```

- [ ] **Step 3: Create workers/doc-processing/Dockerfile**

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY server.js ./

EXPOSE 8001

CMD ["node", "server.js"]
```

- [ ] **Step 4: Install worker dependencies and verify**

```bash
cd /home/alvin/FAWeb_final/workers/doc-processing
npm install
node server.js &
sleep 1
curl -s http://localhost:8001/health
kill %1
cd /home/alvin/FAWeb_final
```

Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add workers/
git commit -m "feat: add stub doc-processing worker with Express HTTP API"
```

---

### Task 13: Docker Compose (Development)

**Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`

- [ ] **Step 1: Create docker-entrypoint.sh**

```bash
#!/bin/sh
set -eu

npx prisma migrate deploy
npm run db:seed

exec "$@"
```

- [ ] **Step 2: Create .dockerignore**

```
node_modules/
.next/
.git/
.env
.env.local
storage/
workers/doc-processing/node_modules/
.superpowers/
```

- [ ] **Step 3: Create Dockerfile**

```dockerfile
FROM node:22-alpine AS deps

ARG ALPINE_MIRROR=""
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
ARG NPM_CONFIG_REGISTRY=""
RUN if [ -n "$NPM_CONFIG_REGISTRY" ]; then \
      npm config set registry "$NPM_CONFIG_REGISTRY"; \
    fi \
    && npm ci \
      --fetch-retries=5 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000

FROM deps AS build

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

ARG ALPINE_MIRROR=""
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
```

- [ ] **Step 4: Create docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: flowassist
      POSTGRES_USER: flowassist
      POSTGRES_PASSWORD: flowassist_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flowassist -d flowassist"]
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - postgres-data:/var/lib/postgresql/data

  web:
    build:
      context: .
    environment:
      NODE_ENV: production
      APP_ORIGIN: ${APP_ORIGIN:-http://localhost:3000}
      DATABASE_URL: postgresql://flowassist:flowassist_password@db:5432/flowassist?schema=public
      PLATFORM_ADMIN_USERNAME: ${PLATFORM_ADMIN_USERNAME:-admin}
      PLATFORM_ADMIN_DISPLAY_NAME: ${PLATFORM_ADMIN_DISPLAY_NAME:-平台管理员}
      PLATFORM_ADMIN_PASSWORD: ${PLATFORM_ADMIN_PASSWORD:-change-me-before-use}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-flowassist_session}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}
      UPLOAD_DIR: /app/storage/uploads
      OUTPUT_DIR: /app/storage/output
      DOC_WORKER_URL: http://doc-worker:8001
      PPT_WORKER_URL: http://ppt-worker:8002
      CHAT_WORKER_URL: http://chat-worker:8003
    ports:
      - "3000:3000"
    volumes:
      - shared-storage:/app/storage
    depends_on:
      db:
        condition: service_healthy

  doc-worker:
    build:
      context: ./workers/doc-processing
    environment:
      PORT: 8001
    volumes:
      - shared-storage:/app/storage
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  shared-storage:
```

- [ ] **Step 5: Verify docker-compose config is valid**

```bash
docker compose config --quiet
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml Dockerfile docker-entrypoint.sh .dockerignore
git commit -m "feat: add Docker Compose dev setup with web, db, and doc-worker"
```

---

### Task 14: Production Deployment

**Files:**
- Create: `deploy/production/docker-compose.yml`, `deploy/production/Caddyfile`, `deploy/production/.env.production.example`, `deploy/production/.gitignore`

- [ ] **Step 1: Create deploy/production/.gitignore**

```
.env.production
```

- [ ] **Step 2: Create deploy/production/.env.production.example**

```
APP_SITE_ADDRESS=example.com
APP_ORIGIN=https://example.com

POSTGRES_DB=flowassist
POSTGRES_USER=flowassist
POSTGRES_PASSWORD=replace-with-a-long-random-password

NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ALPINE_MIRROR=https://mirrors.tencent.com/alpine

PLATFORM_ADMIN_USERNAME=admin
PLATFORM_ADMIN_DISPLAY_NAME=平台管理员
PLATFORM_ADMIN_PASSWORD=replace-with-a-long-random-password

SESSION_COOKIE_NAME=flowassist_session
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECURE=true
```

- [ ] **Step 3: Create deploy/production/Caddyfile**

```
{$APP_SITE_ADDRESS} {
	encode zstd gzip
	reverse_proxy web:3000
}
```

- [ ] **Step 4: Create deploy/production/docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB is required}
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER is required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - flowassist-postgres-data:/var/lib/postgresql/data

  web:
    build:
      context: ../..
      dockerfile: Dockerfile
      args:
        NPM_CONFIG_REGISTRY: ${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}
        ALPINE_MIRROR: ${ALPINE_MIRROR:-https://mirrors.tencent.com/alpine}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      APP_ORIGIN: ${APP_ORIGIN:?APP_ORIGIN is required}
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      PLATFORM_ADMIN_USERNAME: ${PLATFORM_ADMIN_USERNAME:?PLATFORM_ADMIN_USERNAME is required}
      PLATFORM_ADMIN_DISPLAY_NAME: ${PLATFORM_ADMIN_DISPLAY_NAME:-平台管理员}
      PLATFORM_ADMIN_PASSWORD: ${PLATFORM_ADMIN_PASSWORD:?PLATFORM_ADMIN_PASSWORD is required}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-flowassist_session}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-true}
      UPLOAD_DIR: /app/storage/uploads
      OUTPUT_DIR: /app/storage/output
      DOC_WORKER_URL: http://doc-worker:8001
      PPT_WORKER_URL: http://ppt-worker:8002
      CHAT_WORKER_URL: http://chat-worker:8003
    volumes:
      - flowassist-shared-storage:/app/storage
    depends_on:
      db:
        condition: service_healthy

  doc-worker:
    build:
      context: ../../workers/doc-processing
      args:
        NPM_CONFIG_REGISTRY: ${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}
    restart: unless-stopped
    environment:
      PORT: 8001
    volumes:
      - flowassist-shared-storage:/app/storage
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      APP_SITE_ADDRESS: ${APP_SITE_ADDRESS:?APP_SITE_ADDRESS is required}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - flowassist-caddy-data:/data
      - flowassist-caddy-config:/config
    depends_on:
      - web

volumes:
  flowassist-postgres-data:
    name: flowassist-postgres-data
  flowassist-shared-storage:
    name: flowassist-shared-storage
  flowassist-caddy-data:
    name: flowassist-caddy-data
  flowassist-caddy-config:
    name: flowassist-caddy-config
```

- [ ] **Step 5: Commit**

```bash
git add deploy/
git commit -m "feat: add production deployment config (Caddy + Docker Compose)"
```

---

### Task 15: Architecture Documentation (agents.md)

**Files:**
- Create: `agents.md`

- [ ] **Step 1: Create agents.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add agents.md
git commit -m "docs: add architecture documentation in agents.md"
```

---

### Task 16: Smoke Test

- [ ] **Step 1: Build and start everything**

```bash
docker compose up --build -d
sleep 10
docker compose ps
```

Expected: all services (db, web, doc-worker) running and healthy.

- [ ] **Step 2: Verify login page**

```bash
curl -s http://localhost:3000/login | grep "FlowAssist"
```

Expected: HTML containing "FlowAssist".

- [ ] **Step 3: Verify worker health**

```bash
docker compose exec doc-worker wget -qO- http://localhost:8001/health
```

Expected: `{"ok":true}`

- [ ] **Step 4: Verify admin login page**

```bash
curl -s http://localhost:3000/admin/login | grep "平台管理后台"
```

Expected: HTML containing "平台管理后台".

- [ ] **Step 5: Final commit with all remaining files**

```bash
git add -A
git status
git commit -m "chore: final smoke test pass, project ready"
```
