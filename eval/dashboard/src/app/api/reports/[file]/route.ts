import { readReport, readReportSource } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  context: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await context.params;
    await readReport(file);
    const report = await readReportSource(file);
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
