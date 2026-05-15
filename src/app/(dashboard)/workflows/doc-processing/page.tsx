"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Send } from "lucide-react";

type UploadedFile = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
};

type TaskRecord = {
  id: string;
  status: string;
  resultPath?: string | null;
  errorMessage?: string | null;
};

const taskOptions = [
  { value: "pdf_to_ppt", label: "PDF 转 PPT" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function DocProcessingPage() {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (fileObj: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileObj);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setFile(data);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleUpload(droppedFile);
    },
    [handleUpload],
  );

  const pollTask = useCallback(async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const data = await res.json();
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? data : t)),
        );
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file || selectedTasks.size === 0) return;
    setProcessing(true);

    const newTasks: TaskRecord[] = [];
    for (const taskType of selectedTasks) {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            workflowType: "doc_processing",
            taskType,
          }),
        });
        const data = await res.json();
        newTasks.push(data);
      } catch {
        newTasks.push({ id: "error", status: "failed", errorMessage: "Request failed" });
      }
    }

    setTasks(newTasks);
    setProcessing(false);

    for (const task of newTasks) {
      if (task.status === "processing") {
        pollTask(task.id);
      }
    }
  }, [file, selectedTasks, pollTask]);

  const toggleTask = (value: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Left panel */}
      <div className="flex w-[340px] shrink-0 flex-col border-r border-zinc-200 bg-white p-5">
        <div className="mb-3 text-[13px] font-semibold text-zinc-900">
          上传文件
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-zinc-300 bg-zinc-50 transition-colors hover:border-zinc-400"
        >
          <Upload className="h-8 w-8 text-zinc-400" />
          <div className="text-[13px] font-medium text-zinc-600">
            {uploading ? "上传中..." : "拖放文件到此处"}
          </div>
          <div className="text-[12px] text-zinc-400">或点击选择文件</div>
          <div className="text-[11px] text-zinc-400">支持 PDF</div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>

        {/* Uploaded file */}
        {file && (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50">
              <span className="text-[11px] font-semibold text-red-600">
                {file.originalName.split(".").pop()?.toUpperCase() ?? "FILE"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-zinc-900">
                {file.originalName}
              </div>
              <div className="text-[11px] text-zinc-400">
                {formatFileSize(file.sizeBytes)}
              </div>
            </div>
            <button onClick={() => setFile(null)}>
              <X className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          </div>
        )}

        {/* Task selection */}
        <div className="mt-4">
          <div className="mb-2 text-[13px] font-semibold text-zinc-900">
            选择任务
          </div>
          {taskOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 py-2"
            >
              <input
                type="checkbox"
                checked={selectedTasks.has(opt.value)}
                onChange={() => toggleTask(opt.value)}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
              />
              <span className="text-[13px] text-zinc-700">{opt.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!file || selectedTasks.size === 0 || processing}
          className="mt-auto rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {processing ? "处理中..." : "开始处理"}
        </button>
      </div>

      {/* Right area */}
      <div className="flex flex-1 flex-col">
        {/* Preview */}
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-zinc-900">
              预览
            </span>
            {tasks.some((t) => t.status === "completed") && (
              <a
                href={`/api/files/download/${tasks.find((t) => t.status === "completed")?.id}`}
                className="rounded-md bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
              >
                下载结果
              </a>
            )}
          </div>
          <div className="flex flex-1 items-center justify-center rounded-[10px] border border-zinc-200 bg-white">
            {tasks.length === 0 ? (
              <div className="text-center">
                <FileText className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
                <div className="text-[13px] text-zinc-500">
                  上传文件并选择任务后
                </div>
                <div className="text-[13px] text-zinc-500">
                  转换结果将在此预览
                </div>
              </div>
            ) : (
              <div className="w-full p-6">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="mb-2 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-700">{t.id}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        t.status === "completed"
                          ? "bg-green-50 text-green-700"
                          : t.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : "bg-yellow-50 text-yellow-700"
                      }`}
                    >
                      {t.status === "processing"
                        ? "处理中"
                        : t.status === "completed"
                          ? "已完成"
                          : t.status === "failed"
                            ? "失败"
                            : "等待中"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat input */}
        <div className="border-t border-zinc-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="对 AI 说些什么来调整结果..."
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
            />
            <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900">
              <Send className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-400">
            处理完成后，可以通过对话让 AI 继续调整输出结果
          </div>
        </div>
      </div>
    </div>
  );
}
