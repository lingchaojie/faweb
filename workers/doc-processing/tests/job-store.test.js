const test = require("node:test");
const assert = require("node:assert/strict");

const { createJobStore } = require("../src/job-store");

test("createJob stores processing job state", () => {
  const store = createJobStore(() => "job-1");

  const job = store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  assert.equal(job.jobId, "job-1");
  assert.equal(job.status, "processing");
  assert.equal(job.taskId, "task-1");
  assert.equal(store.getJob("job-1").taskType, "pdf_to_ppt");
});

test("completeJob records result path", () => {
  const store = createJobStore(() => "job-1");
  store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  store.completeJob("job-1", "/tmp/result.pptx");

  assert.deepEqual(store.getPublicJob("job-1"), {
    status: "completed",
    resultPath: "/tmp/result.pptx",
    error: undefined,
  });
});

test("failJob records error message", () => {
  const store = createJobStore(() => "job-1");
  store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  store.failJob("job-1", new Error("Claude failed"));

  assert.deepEqual(store.getPublicJob("job-1"), {
    status: "failed",
    resultPath: undefined,
    error: "Claude failed",
  });
});

test("getPublicJob returns null for unknown job", () => {
  const store = createJobStore(() => "job-1");
  assert.equal(store.getPublicJob("missing"), null);
});
