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
