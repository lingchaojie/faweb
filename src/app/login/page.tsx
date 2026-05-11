export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white">
              FA
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-zinc-900">
              FlowAssist
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            登录以访问工作流工具
          </p>
        </div>
        <form
          action="/api/auth/login"
          method="post"
          className="rounded-xl border border-zinc-200 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          {error ? (
            <p className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              账号或密码不正确
            </p>
          ) : null}
          <label className="block text-[13px] font-medium text-zinc-900">
            账号
            <input
              name="username"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />
          </label>
          <label className="mt-5 block text-[13px] font-medium text-zinc-900">
            密码
            <input
              name="password"
              type="password"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
            登录
          </button>
        </form>
      </div>
    </main>
  );
}
