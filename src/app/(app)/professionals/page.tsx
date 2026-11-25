import { notFound } from "next/navigation";
import { ProfessionalsClient } from "@/components/settings/professionals-client";
import { agendaEnabled } from "@/server/agenda/flag";

export const dynamic = "force-dynamic";

export default function ProfessionalsPage() {
  if (!agendaEnabled()) notFound();
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <ProfessionalsClient />
    </div>
  );
}
