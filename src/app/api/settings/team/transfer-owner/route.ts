import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { transferOwnershipByMemberId } from "@/server/tenants/ownership";

export const dynamic = "force-dynamic";

const schemaBody = z.object({
  memberId: z.string().trim().min(1),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && !session.isSuperAdmin) {
    return apiError(
      403,
      "forbidden",
      "Solo el propietario de la organización puede transferir la propiedad"
    );
  }

  const body = await parseBody(req, schemaBody);
  if (!body.ok) return body.response;

  const result = await transferOwnershipByMemberId({
    organizationId: session.organizationId,
    memberId: body.data.memberId,
  });

  if (!result.ok) {
    return apiError(404, "not_found", "Miembro no encontrado en esta organización");
  }

  return Response.json({ ok: true, owner: result.owner });
});
