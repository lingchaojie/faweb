import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Readable } from "node:stream";

const baseUrl = process.env.FLOWASSIST_BASE_URL || "http://localhost:60001";
const username = process.env.FLOWASSIST_USERNAME || "admin";
const password = process.env.FLOWASSIST_PASSWORD || "123456";
const samplePdf = resolve(process.env.SAMPLE_PDF || "workers/doc-processing/samples/test_final.pdf");
const outputPptx = resolve(process.env.OUTPUT_PPTX || "/tmp/flowassist-pdf-to-ppt-result.pptx");
const pollTimeoutMs = Number(process.env.E2E_TIMEOUT_MS || 20 * 60 * 1000);

let cookie = "";

function rememberCookies(res) {
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const raw = setCookie.length > 0 ? setCookie : [res.headers.get("set-cookie")].filter(Boolean);
  if (raw.length > 0) {
    cookie = raw.map((value) => value.split(";")[0]).join("; ");
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  rememberCookies(res);
  return res;
}

async function login() {
  const form = new FormData();
  form.set("username", username);
  form.set("password", password);
  const res = await request("/api/auth/login", { method: "POST", body: form });
  if (![302, 303].includes(res.status)) {
    throw new Error(`Login failed with status ${res.status}: ${await res.text()}`);
  }
}

async function uploadPdf() {
  const handle = await open(samplePdf, "r");
  const blob = new Blob([await handle.readFile()], { type: "application/pdf" });
  await handle.close();

  const form = new FormData();
  form.set("file", blob, basename(samplePdf));
  const res = await request("/api/files/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createTask(fileId) {
  const res = await request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, workflowType: "doc_processing", taskType: "pdf_to_ppt" }),
  });
  if (!res.ok) throw new Error(`Create task failed with status ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < pollTimeoutMs) {
    const res = await request(`/api/tasks/${taskId}`);
    if (!res.ok) throw new Error(`Poll failed with status ${res.status}: ${await res.text()}`);
    const task = await res.json();
    if (task.status === "completed") return task;
    if (task.status === "failed") throw new Error(`Task failed: ${task.errorMessage || "unknown error"}`);
    await delay(5000);
  }
  throw new Error(`Task did not complete within ${pollTimeoutMs}ms`);
}

async function downloadResult(taskId) {
  const res = await request(`/api/files/download/${taskId}`);
  if (!res.ok) throw new Error(`Download failed with status ${res.status}: ${await res.text()}`);
  const file = createWriteStream(outputPptx);
  await once(Readable.fromWeb(res.body).pipe(file), "finish");
  return outputPptx;
}

await login();
const uploaded = await uploadPdf();
const created = await createTask(uploaded.id);
await pollTask(created.id);
const downloaded = await downloadResult(created.id);
console.log(JSON.stringify({ ok: true, taskId: created.id, outputPptx: downloaded }, null, 2));
