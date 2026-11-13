import { notFound } from "next/navigation";
import { ProfessionalsClient } from "@/components/settings/professionals-client";
import { agendaEnabled } from "@/server/agenda/flag";

export const dynamic = "force-dynamic";

export default function ProfessionalsSettingsPage() {
  if (!agendaEnabled()) notFound();
  return <ProfessionalsClient />;
}
