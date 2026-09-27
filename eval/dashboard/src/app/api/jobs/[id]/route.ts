import { cancelJob } from "@/lib/jobs";
import { sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    return Response.json(cancelJob((await context.params).id));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to stop experiment",
      },
      { status: 400 },
    );
  }
}
