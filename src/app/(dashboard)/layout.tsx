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
