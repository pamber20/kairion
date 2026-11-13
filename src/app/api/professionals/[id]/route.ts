import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  deleteProfessional,
  getProfessional,
  updateProfessional,
} from "@/server/agenda/professionals";
import type { WeeklyHours } from "@/server/agenda/settings";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (session, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    if (!agendaEnabled()) return agendaDisabledResponse();
    const { id } = await params;
    const prof = await getProfessional(session.organizationId, id);
    if (!prof) return apiError(404, "not_found", "Profesional no encontrado");
    return Response.json({ professional: prof });
  }
);

const intervalSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  specialty: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  phone: z.string().nullish(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  weeklyHours: z.record(z.string(), z.array(intervalSchema)).nullish(),
  slotMinutes: z.number().int().min(5).max(360).nullish(),
  userId: z.string().nullish(),
});

export const PATCH = withAuth(
  async (session, req: Request, { params }: { params: Promise<{ id: string }> }) => {
    if (!agendaEnabled()) return agendaDisabledResponse();
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Permisos insuficientes");
    }
    const { id } = await params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const prof = await updateProfessional(session.organizationId, id, {
      name: body.data.name,
      specialty: body.data.specialty,
      email: body.data.email === "" ? null : body.data.email,
      phone: body.data.phone,
      color: body.data.color,
      isActive: body.data.isActive,
      weeklyHours: (body.data.weeklyHours as WeeklyHours) ?? null,
      slotMinutes: body.data.slotMinutes,
      userId: body.data.userId,
    });

    if (!prof) return apiError(404, "not_found", "Profesional no encontrado");
    return Response.json({ professional: prof });
  }
);

export const DELETE = withAuth(
  async (session, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    if (!agendaEnabled()) return agendaDisabledResponse();
    if (!canConfigure(session.role)) {
      return apiError(403, "forbidden", "Permisos insuficientes");
    }
    const { id } = await params;
    const res = await deleteProfessional(session.organizationId, id);
    if (!res.ok) {
      return apiError(400, "cannot_delete", res.error ?? "No se pudo eliminar");
    }
    return Response.json({ ok: true });
  }
);
