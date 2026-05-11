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
