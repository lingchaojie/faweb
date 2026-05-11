import type { WorkflowType } from "@prisma/client";

const workerUrls: Record<WorkflowType, string> = {
  doc_processing: process.env.DOC_WORKER_URL ?? "http://localhost:8001",
  ppt_template: process.env.PPT_WORKER_URL ?? "http://localhost:8002",
  chat_extraction: process.env.CHAT_WORKER_URL ?? "http://localhost:8003",
};

function getWorkerUrl(workflowType: WorkflowType): string {
  return workerUrls[workflowType];
}

export async function submitJob(
  workflowType: WorkflowType,
  payload: {
    taskId: string;
    taskType: string;
    inputPath: string;
    outputDir: string;
    config?: Record<string, unknown>;
  },
): Promise<{ jobId: string }> {
  const baseUrl = getWorkerUrl(workflowType);
  const res = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker ${workflowType} returned ${res.status}: ${text}`);
  }

  return res.json();
}

export async function pollJob(
  workflowType: WorkflowType,
  jobId: string,
): Promise<{
  status: "processing" | "completed" | "failed";
  resultPath?: string;
  error?: string;
}> {
  const baseUrl = getWorkerUrl(workflowType);
  const res = await fetch(`${baseUrl}/jobs/${jobId}`);

  if (!res.ok) {
    throw new Error(`Worker ${workflowType} poll returned ${res.status}`);
  }

  return res.json();
}
