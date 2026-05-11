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
