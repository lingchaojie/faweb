import { prisma } from "@/lib/db";

export default async function AdminDashboardPage() {
  const userCount = await prisma.user.count();
  const taskCount = await prisma.task.count();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-base font-semibold text-zinc-900">系统概览</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
          <div className="text-[12px] text-zinc-500">用户总数</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {userCount}
          </div>
        </div>
        <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
          <div className="text-[12px] text-zinc-500">任务总数</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {taskCount}
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">用户列表</h2>
      <div className="mt-3 overflow-hidden rounded-[10px] border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left">
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                用户名
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                显示名称
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                角色
              </th>
              <th className="px-4 py-2.5 text-[12px] font-medium text-zinc-500">
                任务数
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2.5 text-zinc-900">{user.username}</td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {user.displayName}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      user.role === "admin"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {user.role === "admin" ? "管理员" : "用户"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {user._count.tasks}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-[13px] text-zinc-400"
                >
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
