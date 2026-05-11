import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { pollJob } from "@/lib/workers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      workflowType: true,
      taskType: true,
      workerJobId: true,
      resultPath: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status === "processing" && task.workerJobId) {
    try {
      const result = await pollJob(task.workflowType, task.workerJobId);

      if (result.status !== "processing") {
        const updated = await prisma.task.update({
          where: { id: task.id },
          data: {
            status: result.status,
            resultPath: result.resultPath ?? null,
            errorMessage: result.error ?? null,
          },
        });
        return NextResponse.json({
          id: updated.id,
          status: updated.status,
          resultPath: updated.resultPath,
          errorMessage: updated.errorMessage,
        });
      }
    } catch {
      // Worker unreachable — return current DB state
    }
  }

  return NextResponse.json({
    id: task.id,
    status: task.status,
    resultPath: task.resultPath,
    errorMessage: task.errorMessage,
  });
}
