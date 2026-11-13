import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  createProfessional,
  listProfessionals,
} from "@/server/agenda/professionals";
import type { WeeklyHours } from "@/server/agenda/settings";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const url = new URL(req.url);
  const onlyActive = url.searchParams.get("active") === "true";

  const professionals = await listProfessionals(session.organizationId, {
    onlyActive,
  });
  return Response.json({ professionals });
});

const intervalSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const postSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  specialty: z.string().nullish(),
  email: z.string().email("Email inválido").nullish().or(z.literal("")),
  phone: z.string().nullish(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  weeklyHours: z.record(z.string(), z.array(intervalSchema)).nullish(),
  slotMinutes: z.number().int().min(5).max(360).nullish(),
  userId: z.string().nullish(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Permisos insuficientes");
  }

  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const prof = await createProfessional(session.organizationId, {
    name: body.data.name,
    specialty: body.data.specialty,
    email: body.data.email || null,
    phone: body.data.phone,
    color: body.data.color,
    isActive: body.data.isActive,
    weeklyHours: (body.data.weeklyHours as WeeklyHours) ?? null,
    slotMinutes: body.data.slotMinutes,
    userId: body.data.userId,
  });

  return Response.json({ professional: prof }, { status: 201 });
});
