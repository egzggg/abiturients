import { readReports } from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await readReports());
}
