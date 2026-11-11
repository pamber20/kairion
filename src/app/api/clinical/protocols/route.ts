import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  seedMdentalClinic,
  MDENTAL_TREATMENTS,
  CLINIC_LOCATION_INFO,
} from "@/server/clinical/protocols";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinical/protocols
 * Obtiene el catálogo de protocolos y tratamientos odontológicos de la organización.
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const orgId = session.organizationId;

  const protocols = await db
    .select()
    .from(schema.clinicalProcedureGuide)
    .where(scoped(schema.clinicalProcedureGuide.organizationId, orgId));

  return Response.json({
    location: CLINIC_LOCATION_INFO,
    protocols: protocols.length > 0 ? protocols : MDENTAL_TREATMENTS,
  });
});

/**
 * POST /api/clinical/protocols
 * Inicializa o resetea los protocolos de MDental Láser en la organización.
 */
export const POST = withAuth(async (session) => {
  const orgId = session.organizationId;
  await seedMdentalClinic(orgId);
  return Response.json({ success: true, message: "Protocolos y configuración de MDental Láser inicializados" });
});
