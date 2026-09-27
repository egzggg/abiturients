import { readReport } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  context: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await context.params;
    const { file: _file, ...report } = await readReport(file);
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${file}"`,
      },
    });
  } catch {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }
}
