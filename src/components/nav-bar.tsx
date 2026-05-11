import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function NavBar({
  user,
  breadcrumb,
}: {
  user: { displayName: string };
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-zinc-900 text-[10px] font-semibold text-white">
            FA
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            FlowAssist
          </span>
        </Link>
        {breadcrumb?.map((item) => (
          <span key={item.label} className="flex items-center gap-3">
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            {item.href ? (
              <Link
                href={item.href}
                className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-[13px] font-medium text-zinc-600">
                {item.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <form action="/api/auth/logout" method="post">
          <button className="text-xs text-zinc-500 hover:text-zinc-700">
            退出
          </button>
        </form>
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-[11px] font-medium text-zinc-600">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
