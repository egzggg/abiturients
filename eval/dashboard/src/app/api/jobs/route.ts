import { allJobs, startJob } from "@/lib/jobs";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(allJobs());
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    return Response.json(await startJob(await request.json()), { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to start experiment",
      },
      { status: 400 },
    );
  }
}
