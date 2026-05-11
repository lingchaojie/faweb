import { NextResponse } from "next/server";
import { appRedirectUrl } from "@/lib/redirect-url";
import { destroyCurrentSession, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  const response = NextResponse.redirect(appRedirectUrl(request, "/login"), 303);
  response.cookies.delete(sessionCookieName);
  return response;
}
