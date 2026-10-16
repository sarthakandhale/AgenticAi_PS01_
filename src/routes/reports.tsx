import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { ReportsView } from "@/components/views/reports";

export const Route = createFileRoute("/reports")({
  head: () => seo("Reports", "ProjectPilot Reports page."),
  component: () => (<><PageHeader title="Reports" /><ReportsView /></>),
});
