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
