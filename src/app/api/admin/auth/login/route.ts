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
