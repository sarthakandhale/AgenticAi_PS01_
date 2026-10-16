import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { SettingsView } from "@/components/views/settings";

export const Route = createFileRoute("/settings")({
  head: () => seo("Settings", "ProjectPilot Settings page."),
  component: () => (<><PageHeader title="Settings" /><SettingsView /></>),
});
