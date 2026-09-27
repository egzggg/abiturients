import { Dashboard } from "@/components/dashboard";
import { datasetStats, readReports } from "@/lib/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const [reports, datasets] = await Promise.all([
    readReports(),
    datasetStats(),
  ]);
  return <Dashboard initialReports={reports} datasets={datasets} />;
}
