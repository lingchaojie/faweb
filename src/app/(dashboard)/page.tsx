import { FileText, Monitor, MessageSquare } from "lucide-react";
import Link from "next/link";

const workflows = [
  {
    href: "/workflows/doc-processing",
    icon: FileText,
    label: "文档处理",
    description: "PDF 转 PPT、格式转换",
  },
  {
    href: "/workflows/ppt-template",
    icon: Monitor,
    label: "PPT 模板适配",
    description: "内容适配到指定 PPT 模板",
  },
  {
    href: "/workflows/chat-extraction",
    icon: MessageSquare,
    label: "聊天记录提取",
    description: "从聊天记录提取信息并填入表格",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-base font-semibold text-zinc-900">工作流工具</h1>
      <p className="mt-1 text-[13px] text-zinc-500">选择要使用的工具</p>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {workflows.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className="flex items-center gap-3.5 rounded-[10px] border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-900"
          >
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
              <w.icon className="h-[18px] w-[18px] text-zinc-600" />
            </div>
            <div>
              <div className="text-[13px] font-medium text-zinc-900">
                {w.label}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-500">
                {w.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
