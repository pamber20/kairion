import { and, eq, isNull, lte, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { sendText } from "@/server/inbox/send";
import { replyWindow } from "@/server/inbox/window";
import { CLINIC_LOCATION_INFO, getClinicLocationInfo, MDENTAL_TREATMENTS } from "./protocols";

export interface ClinicalNotificationStats {
  preOpSent: number;
  locationSent: number;
  postOpSent: number;
}

/**
 * Busca las recomendaciones pre y post para un tratamiento dado.
 */
export function getProcedureTips(procedureName?: string | null): {
  preOpTips: string;
  postOpTips: string;
} {
  if (!procedureName) {
    return {
      preOpTips: "• Ven con 10 minutos de anticipación para tu registro en recepción (Of. 408).\n• Realiza un cepillado dental suave antes de asistir.",
      postOpTips: "• Mantén un cepillado suave con cerdas suaves.\n• Evita alimentos excesivamente duros, irritantes o muy calientes las primeras 24 horas.",
    };
  }

  const match = MDENTAL_TREATMENTS.find(
    (t) => t.name.toLowerCase() === procedureName.trim().toLowerCase()
  );

  return {
    preOpTips:
      match?.preOpTips ??
      "• Ven con 10 minutos de anticipación para tu registro en recepción (Of. 408).\n• Realiza tu higiene bucal habitual antes de acudir.",
    postOpTips:
      match?.postOpTips ??
      "• Mantén un cepillado suave y sigue las indicaciones del Dr. Mario David.\n• Toma abundante agua y mantén reposo relativo.",
  };
}

/**
 * Fase 1: Envía recordatorio interactivo y Tips Pre-Tratamiento (48h y 24h antes).
 */
export async function dispatchPreOpTips(organizationId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  // Citas dentro de las próximas 48 horas
  const windowLimit = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const bookings = await db
    .select({
      id: schema.booking.id,
      contactId: schema.booking.contactId,
      conversationId: schema.booking.conversationId,
      scheduledAt: schema.booking.scheduledAt,
      procedureName: schema.booking.procedureName,
      specialistName: schema.booking.specialistName,
      contactName: schema.contact.name,
    })
    .from(schema.booking)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.booking.contactId))
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          eq(schema.booking.status, "agendada"),
          eq(schema.booking.isTest, false),
          isNull(schema.booking.preOpTipsSentAt),
          lte(schema.booking.scheduledAt, windowLimit),
          gte(schema.booking.scheduledAt, now)
        )
      )
    )
    .limit(25);

  let sentCount = 0;
  const clinic = getClinicLocationInfo();

  for (const b of bookings) {
    if (!b.conversationId) continue;

    const convRows = await db
      .select({
        channel: schema.conversation.channel,
        lastInboundAt: schema.conversation.lastInboundAt,
      })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, b.conversationId))
      .limit(1);

    const conv = convRows[0];
    if (!conv) continue;
    const windowState = replyWindow(conv.channel, conv.lastInboundAt);
    if (!windowState.standardOpen) {
      console.warn(
        `[notificaciones-clinicas] ventana de 24h cerrada para booking ${b.id} en ${conv.channel}; se omite envío libre según políticas de Meta`
      );
      await db
        .update(schema.booking)
        .set({ preOpTipsSentAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.booking.id, b.id));
      continue;
    }

    const procedure = b.procedureName || "Consulta Odontológica Especializada";
    const specialist = b.specialistName || clinic.director;
    const tips = getProcedureTips(b.procedureName);

    const horaStr = new Intl.DateTimeFormat("es-CO", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(b.scheduledAt));

    const texto = [
      `¡Hola ${b.contactName}! 👋 Te recordamos tu cita en *${clinic.name}*`,
      `📅 *Horario:* ${horaStr}`,
      `👨‍⚕️ *Especialista:* ${specialist}`,
      `🦷 *Tratamiento:* ${procedure}`,
      `📍 *Ubicación:* ${clinic.address}`,
      "",
      "Por favor responde a este mensaje para confirmar tu cita:",
      "👉 Escribe *1* o *Confirmar* para asegurar tu sillón.",
      "👉 Escribe *2* o *Reprogramar* si requieres cambiar de horario.",
      "",
      "💡 *Recomendaciones previas de preparación clínica:*",
      tips.preOpTips,
      "",
      "¡Nos alegra acompañarte a cuidar tu sonrisa!",
    ].join("\n");

    try {
      await sendText({
        organizationId,
        conversationId: b.conversationId,
        text: texto,
        aiGenerated: true,
      });

      await db
        .update(schema.booking)
        .set({ preOpTipsSentAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.booking.id, b.id));

      sentCount++;
    } catch (err) {
      console.warn(`[notificaciones-clinicas] error enviando pre-op a booking ${b.id}:`, err);
    }
  }

  return sentCount;
}

/**
 * Fase 2: Envía indicaciones de acceso y enlaces directos de Waze / Google Maps el día de la cita.
 */
export async function dispatchLocationTips(organizationId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  // Citas que ocurren en las próximas 3 horas y no han recibido la guía de llegada
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const bookings = await db
    .select({
      id: schema.booking.id,
      conversationId: schema.booking.conversationId,
      scheduledAt: schema.booking.scheduledAt,
      contactName: schema.contact.name,
    })
    .from(schema.booking)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.booking.contactId))
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          eq(schema.booking.status, "agendada"),
          eq(schema.booking.isTest, false),
          isNull(schema.booking.locationTipsSentAt),
          lte(schema.booking.scheduledAt, threeHoursFromNow),
          gte(schema.booking.scheduledAt, now)
        )
      )
    )
    .limit(25);

  let sentCount = 0;
  const clinic = getClinicLocationInfo();

  for (const b of bookings) {
    if (!b.conversationId) continue;

    const convRows = await db
      .select({
        channel: schema.conversation.channel,
        lastInboundAt: schema.conversation.lastInboundAt,
      })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, b.conversationId))
      .limit(1);

    const conv = convRows[0];
    if (!conv) continue;
    const windowState = replyWindow(conv.channel, conv.lastInboundAt);
    if (!windowState.standardOpen) {
      console.warn(
        `[notificaciones-clinicas] ventana de 24h cerrada para ubicación booking ${b.id}; se omite según políticas de Meta`
      );
      await db
        .update(schema.booking)
        .set({ locationTipsSentAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.booking.id, b.id));
      continue;
    }

    const texto = [
      `¡Hola ${b.contactName}! 🚗 Te esperamos hoy en *${clinic.name}*.`,
      "",
      "Para que llegues con total comodidad y sin estrés:",
      `🗺️ *Google Maps:* ${clinic.googleMapsUrl}`,
      `🧭 *Waze:* ${clinic.wazeUrl}`,
      "",
      "🏢 *Cómo acceder:*",
      clinic.accessGuide,
      "",
      "¡Cualquier inquietud sobre tu llegada estamos a tu servicio!",
    ].join("\n");

    try {
      await sendText({
        organizationId,
        conversationId: b.conversationId,
        text: texto,
        aiGenerated: true,
      });

      await db
        .update(schema.booking)
        .set({ locationTipsSentAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.booking.id, b.id));

      sentCount++;
    } catch (err) {
      console.warn(`[notificaciones-clinicas] error enviando ubicacion a booking ${b.id}:`, err);
    }
  }

  return sentCount;
}

/**
 * Fase 3: Cuidados post-operatorios y encuesta de satisfacción 5★ Google Reviews (2h a 24h post-cita).
 */
export async function dispatchPostOpTips(organizationId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  // Citas cuya hora ya pasó hace al menos 2 horas y no más de 36 horas
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const thirtySixHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const bookings = await db
    .select({
      id: schema.booking.id,
      contactId: schema.booking.contactId,
      conversationId: schema.booking.conversationId,
      scheduledAt: schema.booking.scheduledAt,
      procedureName: schema.booking.procedureName,
      contactName: schema.contact.name,
    })
    .from(schema.booking)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.booking.contactId))
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          eq(schema.booking.isTest, false),
          isNull(schema.booking.postOpTipsSentAt),
          lte(schema.booking.scheduledAt, twoHoursAgo),
          gte(schema.booking.scheduledAt, thirtySixHoursAgo)
        )
      )
    )
    .limit(25);

  let sentCount = 0;
  const clinic = getClinicLocationInfo();

  for (const b of bookings) {
    if (!b.conversationId) continue;

    const convRows = await db
      .select({
        channel: schema.conversation.channel,
        lastInboundAt: schema.conversation.lastInboundAt,
      })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, b.conversationId))
      .limit(1);

    const conv = convRows[0];
    if (!conv) continue;
    const windowState = replyWindow(conv.channel, conv.lastInboundAt);
    if (!windowState.standardOpen) {
      console.warn(
        `[notificaciones-clinicas] ventana de 24h cerrada para post-op booking ${b.id}; se omite según políticas de Meta`
      );
      await db
        .update(schema.booking)
        .set({
          postOpTipsSentAt: new Date(),
          reviewRequestedAt: new Date(),
          status: "realizada",
          updatedAt: new Date(),
        })
        .where(eq(schema.booking.id, b.id));
      continue;
    }

    const tips = getProcedureTips(b.procedureName);

    const texto = [
      `¡Hola ${b.contactName}! 🌟 Esperamos que tu procedimiento de hoy en *${clinic.name}* haya sido una experiencia muy tranquila y confortable.`,
      "",
      "🦷 *Cuidados y pautas post-tratamiento:*",
      tips.postOpTips,
      "",
      "⭐ *Tu opinión es fundamental para nosotros:*",
      `Del 1 al 5 (donde 5 es excelente), ¿cómo calificarías tu atención hoy con el equipo de ${clinic.director}?`,
      "(Solo responde con el número)",
    ].join("\n");

    try {
      await sendText({
        organizationId,
        conversationId: b.conversationId,
        text: texto,
        aiGenerated: true,
      });

      await db
        .update(schema.booking)
        .set({
          postOpTipsSentAt: new Date(),
          reviewRequestedAt: new Date(),
          status: "realizada",
          updatedAt: new Date(),
        })
        .where(eq(schema.booking.id, b.id));

      // Actualizamos la fecha del último procedimiento del paciente
      if (b.contactId) {
        await db
          .update(schema.contact)
          .set({
            lastProcedureType: b.procedureName || "Atención Odontológica",
            lastProcedureAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.contact.id, b.contactId));
      }

      sentCount++;
    } catch (err) {
      console.warn(`[notificaciones-clinicas] error enviando post-op a booking ${b.id}:`, err);
    }
  }

  return sentCount;
}

/**
 * Procesa la respuesta de la encuesta de satisfacción cuando el paciente califica.
 * Si califica 5★ → envía enlace a reseña pública en Google Maps.
 * Si califica 1-3 → genera alerta médica.
 */
export async function processPatientReviewResponse(input: {
  organizationId: string;
  conversationId: string;
  contactId: string;
  text: string;
}): Promise<boolean> {
  const trimmed = input.text.trim();
  const db = getDb();

  // Buscar última cita con encuesta pendiente de calificación
  const lastBooking = await db
    .select({
      id: schema.booking.id,
      reviewRequestedAt: schema.booking.reviewRequestedAt,
      reviewScore: schema.booking.reviewScore,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        input.organizationId,
        and(
          eq(schema.booking.contactId, input.contactId),
          sql`${schema.booking.reviewRequestedAt} is not null`,
          isNull(schema.booking.reviewScore)
        )
      )
    )
    .orderBy(sql`${schema.booking.scheduledAt} desc`)
    .limit(1);

  if (lastBooking.length === 0) return false;
  const booking = lastBooking[0]!;

  const esCinco = /^(5|cinco|excelente|súper|super|10|10\/10)/i.test(trimmed);
  const esCuatro = /^(4|cuatro|muy bien|bueno)/i.test(trimmed);
  const esBajo = /^(1|2|3|uno|dos|tres|regular|mal|pésimo|pesimo)/i.test(trimmed);

  if (esCinco) {
    const clinic = getClinicLocationInfo();
    await db
      .update(schema.booking)
      .set({ reviewScore: 5, updatedAt: new Date() })
      .where(eq(schema.booking.id, booking.id));

    const textoGoogle = [
      "¡Muchísimas gracias por tu calificación de 5 estrellas! ⭐⭐⭐⭐⭐",
      "Nos llena de satisfacción saber que disfrutaste de la experiencia de odontología láser.",
      "",
      "Nos ayudarías un montón compartiendo tu reseña pública en Google Maps para que más pacientes en Medellín conozcan una odontología sin dolor ni molestias:",
      `👉 ${clinic.googleReviewUrl}`,
      "",
      "¡Esperamos verte en tu próximo control semestral!",
    ].join("\n");

    await sendText({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      text: textoGoogle,
      aiGenerated: true,
    });
    return true;
  }

  if (esCuatro) {
    await db
      .update(schema.booking)
      .set({ reviewScore: 4, updatedAt: new Date() })
      .where(eq(schema.booking.id, booking.id));

    await sendText({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      text: "¡Muchas gracias por tus comentarios! Nos alegra haberte atendido y trabajamos día a día para que tu próxima experiencia sea de 5 estrellas. ¡Que tengas un excelente día!",
      aiGenerated: true,
    });
    return true;
  }

  if (esBajo) {
    const puntaje = /^[1-3]$/.test(trimmed) ? parseInt(trimmed, 10) : 2;
    await db
      .update(schema.booking)
      .set({ reviewScore: puntaje, updatedAt: new Date() })
      .where(eq(schema.booking.id, booking.id));

    await sendText({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      text: "Lamentamos profundamente que tu experiencia no haya sido perfecta. Tu comodidad y bienestar son nuestra máxima prioridad. Ya mismo informamos a la coordinación médica para revisar tu caso y ponernos en contacto contigo.",
      aiGenerated: true,
    });
    return true;
  }

  return false;
}

/**
 * Confirma una cita odontológica cuando el paciente responde "1" o "Confirmar".
 */
export async function confirmPatientBooking(input: {
  organizationId: string;
  conversationId: string;
  contactId: string;
}): Promise<boolean> {
  const db = getDb();
  const now = new Date();

  const pendingBooking = await db
    .select({
      id: schema.booking.id,
      scheduledAt: schema.booking.scheduledAt,
      specialistName: schema.booking.specialistName,
      procedureName: schema.booking.procedureName,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        input.organizationId,
        and(
          eq(schema.booking.contactId, input.contactId),
          gte(schema.booking.scheduledAt, now),
          eq(schema.booking.status, "agendada"),
          eq(schema.booking.patientConfirmation, "unconfirmed")
        )
      )
    )
    .orderBy(sql`${schema.booking.scheduledAt} asc`)
    .limit(1);

  if (pendingBooking.length === 0) return false;
  const b = pendingBooking[0]!;

  await db
    .update(schema.booking)
    .set({ patientConfirmation: "confirmed", updatedAt: new Date() })
    .where(eq(schema.booking.id, b.id));

  const horaStr = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(b.scheduledAt));

  const texto = [
    "¡Perfecto! Tu cita ha quedado *CONFIRMADA* con éxito. ✅",
    `📅 ${horaStr}`,
    `🦷 ${b.procedureName || "Atención Odontológica"}`,
    `📍 ${CLINIC_LOCATION_INFO.address}`,
    "",
    "¡Todo nuestro equipo médico te espera para brindarte la mejor atención!",
  ].join("\n");

  await sendText({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    text: texto,
    aiGenerated: true,
  });

  return true;
}
