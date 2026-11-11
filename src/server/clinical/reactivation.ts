import { and, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { sendText } from "@/server/inbox/send";
import { replyWindow } from "@/server/inbox/window";
import { getClinicLocationInfo } from "./protocols";

export interface ReactivationCandidate {
  contactId: string;
  name: string;
  phone: string | null;
  waIdentity: string;
  lastProcedureType: string | null;
  lastProcedureAt: Date;
  daysInactive: number;
}

/**
 * Escanea la base de datos de pacientes que llevan 180 o más días desde su último procedimiento
 * y que no tengan citas futuras ni hayan sido contactados para reactivación en los últimos 30 días.
 */
export async function scanPatientsForReactivation(
  organizationId: string,
  minDaysInactive = 180
): Promise<ReactivationCandidate[]> {
  const db = getDb();
  const thresholdDate = new Date(Date.now() - minDaysInactive * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Pacientes con último procedimiento anterior a 180 días
  const candidates = await db
    .select({
      contactId: schema.contact.id,
      name: schema.contact.name,
      phone: schema.contact.phone,
      waIdentity: schema.contact.waIdentity,
      lastProcedureType: schema.contact.lastProcedureType,
      lastProcedureAt: schema.contact.lastProcedureAt,
    })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        and(
          sql`${schema.contact.lastProcedureAt} is not null`,
          lte(schema.contact.lastProcedureAt, thresholdDate),
          eq(schema.contact.aiPaused, false)
        )
      )
    )
    .limit(50);

  const eligible: ReactivationCandidate[] = [];

  for (const c of candidates) {
    if (!c.lastProcedureAt) continue;

    // Verificar que no tenga cita futura
    const futureBooking = await db
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(
        scoped(
          schema.booking.organizationId,
          organizationId,
          and(
            eq(schema.booking.contactId, c.contactId),
            sql`${schema.booking.scheduledAt} >= NOW()`,
            eq(schema.booking.status, "agendada")
          )
        )
      )
      .limit(1);

    if (futureBooking.length > 0) continue;

    // Verificar que no se le haya enviado mensaje de reactivación en los últimos 30 días
    const recentLog = await db
      .select({ id: schema.patientReactivationLog.id })
      .from(schema.patientReactivationLog)
      .where(
        scoped(
          schema.patientReactivationLog.organizationId,
          organizationId,
          and(
            eq(schema.patientReactivationLog.contactId, c.contactId),
            sql`${schema.patientReactivationLog.sentAt} >= ${thirtyDaysAgo}`
          )
        )
      )
      .limit(1);

    if (recentLog.length > 0) continue;

    const diffDays = Math.floor(
      (Date.now() - new Date(c.lastProcedureAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    eligible.push({
      contactId: c.contactId,
      name: c.name,
      phone: c.phone,
      waIdentity: c.waIdentity,
      lastProcedureType: c.lastProcedureType,
      lastProcedureAt: new Date(c.lastProcedureAt),
      daysInactive: diffDays,
    });
  }

  return eligible;
}

/**
 * Dispara la secuencia de reactivación a los pacientes inactivos.
 */
export async function runReactivationBatch(
  organizationId: string,
  limit = 10
): Promise<{ processed: number; sent: number }> {
  const candidates = await scanPatientsForReactivation(organizationId);
  const toProcess = candidates.slice(0, limit);
  const db = getDb();
  let sent = 0;

  const clinic = getClinicLocationInfo();

  for (const c of toProcess) {
    // Buscar conversación existente no de prueba
    const convRows = await db
      .select({
        id: schema.conversation.id,
        channel: schema.conversation.channel,
        lastInboundAt: schema.conversation.lastInboundAt,
      })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          and(
            eq(schema.conversation.contactId, c.contactId),
            eq(schema.conversation.isTest, false)
          )
        )
      )
      .limit(1);

    if (convRows.length === 0) continue;
    const conv = convRows[0]!;
    const conversationId = conv.id;
    const windowState = replyWindow(conv.channel, conv.lastInboundAt);

    if (!windowState.standardOpen) {
      console.warn(
        `[reactivacion] ventana de 24h cerrada para paciente ${c.contactId} en ${conv.channel}; Meta prohíbe texto libre sin plantilla aprobada`
      );
      await db.insert(schema.patientReactivationLog).values({
        id: newId("reactivationLog"),
        organizationId,
        contactId: c.contactId,
        lastProcedureName: c.lastProcedureType ?? "Control Odontológico",
        daysInactive: c.daysInactive,
        messageSent: "[Omitido: ventana de 24h cerrada; requiere plantilla aprobada de WhatsApp]",
        sentAt: new Date(),
        status: "dismissed",
      });
      continue;
    }

    const procedimiento = c.lastProcedureType
      ? c.lastProcedureType.toLowerCase()
      : "tu última visita y profilaxis láser";

    const mensaje = [
      `Hola ${c.name} 👋, esperamos que te encuentres muy bien.`,
      "",
      `En *${clinic.name}* recordamos que han pasado 6 meses desde ${procedimiento}.`,
      "",
      `Para mantener el brillo natural de tu sonrisa y proteger tus encías, este es el momento ideal para tu control preventivo semestral con ${clinic.director}. ✨`,
      "",
      "¿Te gustaría que revisemos disponibilidad de horarios para esta semana?",
    ].join("\n");

    try {
      await sendText({
        organizationId,
        conversationId,
        text: mensaje,
        aiGenerated: true,
      });

      await db.insert(schema.patientReactivationLog).values({
        id: newId("reactivationLog"),
        organizationId,
        contactId: c.contactId,
        lastProcedureName: c.lastProcedureType ?? "Control Odontológico",
        daysInactive: c.daysInactive,
        messageSent: mensaje,
        sentAt: new Date(),
        status: "sent",
      });

      sent++;
    } catch (err) {
      console.warn(`[reactivacion] no se pudo enviar reactivacion a paciente ${c.contactId}:`, err);
    }
  }

  return { processed: toProcess.length, sent };
}
