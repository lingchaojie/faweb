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
