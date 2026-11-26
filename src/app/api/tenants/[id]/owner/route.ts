import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { transferOrganizationOwnership } from "@/server/tenants/ownership";

export const dynamic = "force-dynamic";

const assignOwnerSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Cambia el propietario ("owner") de cualquier organización (exclusivo SuperAdmin).
 * Si el correo ya existe en la plataforma, lo vincula directamente; si es nuevo,
 * crea su cuenta con nombre y contraseña temporal.
 */
export const POST = withAuth(async (session, req: Request, { params }: Params) => {
  if (!session.isSuperAdmin) {
    return apiError(
      403,
      "forbidden",
      "Solo el SuperAdmin puede cambiar el propietario de una organización"
    );
  }

  const { id } = await params;
  const body = await parseBody(req, assignOwnerSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const normalizedEmail = body.data.email.toLowerCase();

  const existingUsers = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, normalizedEmail))
    .limit(1);

  let targetUserId: string;
  let createdAccount = false;

  if (existingUsers[0]) {
    targetUserId = existingUsers[0].id;
  } else {
    if (!body.data.name || !body.data.password) {
      return apiError(
        422,
        "user_not_found",
        "Este correo aún no tiene cuenta. Ingresa nombre y contraseña temporal para crearla."
      );
    }

    const auth = getAuth();
    try {
      const result = await runInternalSignup(() =>
        auth.api.signUpEmail({
          body: {
            name: body.data.name!,
            email: normalizedEmail,
            password: body.data.password!,
          },
        })
      );
      targetUserId = result.user.id;
      createdAccount = true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear la cuenta del propietario";
      return apiError(422, "invalid", message);
    }
  }

  const transfer = await transferOrganizationOwnership({
    organizationId: id,
    targetUserId,
  });

  if (!transfer.ok) {
    return apiError(404, "not_found", "La organización no existe");
  }

  return Response.json({
    ok: true,
    owner: transfer.owner,
    createdAccount,
  });
});
