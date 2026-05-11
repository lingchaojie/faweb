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
