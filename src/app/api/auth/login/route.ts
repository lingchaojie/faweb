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
