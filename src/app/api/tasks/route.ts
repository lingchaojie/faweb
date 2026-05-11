import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { submitJob } from "@/lib/workers";
import type { WorkflowType } from "@prisma/client";

const outputDir = process.env.OUTPUT_DIR ?? "./storage/output";

const validWorkflowTypes = new Set<string>([
  "doc_processing",
  "ppt_template",
  "chat_extraction",
]);

export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { fileId, workflowType, taskType } = body;

  if (!fileId || !workflowType || !taskType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!validWorkflowTypes.has(workflowType)) {
    return NextResponse.json({ error: "Invalid workflowType" }, { status: 400 });
  }

  const file = await prisma.uploadedFile.findUnique({
    where: { id: fileId },
    select: { id: true, userId: true, storedPath: true },
  });

  if (!file || file.userId !== user.id) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      fileId: file.id,
      userId: user.id,
      workflowType: workflowType as WorkflowType,
      taskType,
      status: "pending",
    },
  });

  try {
    const { jobId } = await submitJob(workflowType as WorkflowType, {
      taskId: task.id,
      taskType,
      inputPath: file.storedPath,
      outputDir,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "processing", workerJobId: jobId },
    });

    return NextResponse.json({
      id: task.id,
      status: "processing",
      workerJobId: jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker dispatch failed";
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "failed", errorMessage: message },
    });

    return NextResponse.json({
      id: task.id,
      status: "failed",
      error: message,
    }, { status: 502 });
  }
}
