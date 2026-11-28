import { asc, desc, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { DateRange } from "@/lib/time/calendar";
import { addDaysISO, partsInTz, zonedWallClockToUtc } from "@/lib/time/slots";
import { getSettings, type CalendarSettings } from "@/server/agenda/settings";

/** 015 — Listado de citas para la UI, con la hora en la zona del negocio. */

export type BookingListItem = {
  id: string;
  kind: "session" | "block";
  status: "agendada" | "realizada" | "no_show" | "cancelada";
  source: "manual" | "ai";
  scheduledAtUtc: string;
  durationMinutes: number;
  date: string;
  time: string;
  weekday: string;
  contact: { id: string; name: string } | null;
  conversationId: string | null;
  /** Con qué conector nació la entrega de esta cita. */
  connector: string | null;
  meetingLink: string | null;
  /** El proveedor falló al crear la reunión: se puede reintentar. */
  linkPending: boolean;
  isTest: boolean;
  notes: string | null;
  professionalId?: string | null;
  professional?: {
    id: string;
    name: string;
    specialty: string | null;
    color: string;
  } | null;
  procedureName?: string | null;
  specialistName?: string | null;
};

/** Tope del listado sin rango: el de siempre, que leen los guiones E2E. */
export const LIST_LIMIT = 200;

/**
 * 215 — Tope de una consulta por rango. No es un límite del producto (92 días
 * de un negocio con 30 citas diarias son 2 760): es el seguro contra una
 * respuesta de megas. Si se alcanza, la respuesta lo dice (`truncated`) en vez
 * de esconder citas como hacía el tope de 200.
 */
export const RANGE_LIMIT = 3000;

/**
 * Cuánto mira hacia atrás la consulta por rango. La API acepta bloqueos de
 * hasta 600 minutos: uno que empezó a las 20:00 del día anterior al rango
 * sigue ocupando su madrugada y la rejilla lo tiene que pintar.
 */
const LOOKBACK_MS = 24 * 3_600_000;

type Row = {
  booking: typeof schema.booking.$inferSelect;
  contactId: string | null;
  contactName: string | null;
  profId: string | null;
  profName: string | null;
  profSpecialty: string | null;
  profColor: string | null;
};

function baseQuery() {
  return getDb()
    .select({
      booking: schema.booking,
      contactId: schema.contact.id,
      contactName: schema.contact.name,
      profId: schema.professional.id,
      profName: schema.professional.name,
      profSpecialty: schema.professional.specialty,
      profColor: schema.professional.color,
    })
    .from(schema.booking)
    .leftJoin(schema.contact, eq(schema.booking.contactId, schema.contact.id))
    .leftJoin(
      schema.professional,
      eq(schema.booking.professionalId, schema.professional.id)
    );
}

/** Las últimas 200 citas: el listado de siempre, para quien no pide rango. */
export async function listBookings(
  organizationId: string,
  settings?: CalendarSettings,
  opts?: { professionalId?: string | null }
): Promise<BookingListItem[]> {
  const resolved = settings ?? (await getSettings(organizationId));
  const whereClause = opts?.professionalId
    ? scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.professionalId, opts.professionalId)
      )
    : scoped(schema.booking.organizationId, organizationId);

  const rows = await baseQuery()
    .where(whereClause)
    .orderBy(desc(schema.booking.scheduledAt))
    .limit(LIST_LIMIT);
  return rows.map((r) => toListItem(r, resolved.timezone));
}

/**
 * 215 — Las citas que TOCAN un rango de días en la zona del negocio, en orden.
 *
 * `from`/`to` son fechas de calendario inclusivas; el corte se hace a la
 * medianoche del negocio, no a la de UTC (con cortes en UTC, lo que pasa
 * después de las 18:00 en México caería en la columna del día siguiente).
 */
export async function listBookingsInRange(
  organizationId: string,
  range: DateRange,
  settings?: CalendarSettings,
  opts?: { professionalId?: string | null }
): Promise<{ bookings: BookingListItem[]; truncated: boolean }> {
  const resolved = settings ?? (await getSettings(organizationId));
  const tz = resolved.timezone;
  // Fechas ya validadas (`parseRangeQuery`): la conversión no puede fallar.
  const start = zonedWallClockToUtc(range.from, "00:00", tz)!;
  const end = zonedWallClockToUtc(addDaysISO(range.to, 1), "00:00", tz)!;

  const whereClause = opts?.professionalId
    ? scoped(
        schema.booking.organizationId,
        organizationId,
        gte(schema.booking.scheduledAt, new Date(start.getTime() - LOOKBACK_MS)),
        lt(schema.booking.scheduledAt, end),
        eq(schema.booking.professionalId, opts.professionalId)
      )
    : scoped(
        schema.booking.organizationId,
        organizationId,
        gte(schema.booking.scheduledAt, new Date(start.getTime() - LOOKBACK_MS)),
        lt(schema.booking.scheduledAt, end)
      );

  const rows = await baseQuery()
    .where(whereClause)
    .orderBy(asc(schema.booking.scheduledAt))
    .limit(RANGE_LIMIT);

  // De lo que empezó el día anterior, solo lo que sigue ocupando el rango.
  const inRange = rows.filter(
    (r) =>
      r.booking.scheduledAt.getTime() + r.booking.durationMinutes * 60_000 >
      start.getTime()
  );
  return {
    bookings: inRange.map((r) => toListItem(r, tz)),
    truncated: rows.length === RANGE_LIMIT,
  };
}

function toListItem(r: Row, timezone: string): BookingListItem {
  const scheduledAtUtc = r.booking.scheduledAt.toISOString();
  const parts = partsInTz(scheduledAtUtc, timezone);
  return {
    id: r.booking.id,
    kind: r.booking.kind,
    status: r.booking.status,
    source: r.booking.source,
    scheduledAtUtc,
    durationMinutes: r.booking.durationMinutes,
    date: parts.date,
    time: parts.time,
    weekday: parts.weekday,
    contact: r.contactId ? { id: r.contactId, name: r.contactName ?? "" } : null,
    conversationId: r.booking.conversationId,
    connector: r.booking.connector,
    meetingLink: r.booking.meetingLink,
    linkPending: r.booking.linkPending,
    isTest: r.booking.isTest,
    notes: r.booking.notes,
    professionalId: r.booking.professionalId ?? null,
    professional: r.profId
      ? {
          id: r.profId,
          name: r.profName ?? "",
          specialty: r.profSpecialty ?? null,
          color: r.profColor ?? "#3b82f6",
        }
      : null,
    procedureName: r.booking.procedureName ?? null,
    specialistName: r.booking.specialistName ?? null,
  };
}

export type ActiveContactBooking = {
  id: string;
  scheduledAtUtc: string;
  date: string;
  time: string;
  weekday: string;
  source: "manual" | "ai";
  professionalName: string | null;
  procedureName: string | null;
  meetingLink: string | null;
};

/**
 * Citas activas futuras de un contacto (incluye citas manuales y de IA)
 * para que el agente pueda informarlas, reprogramarlas o cancelarlas.
 */
export async function listActiveBookingsForContact(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<ActiveContactBooking[]> {
  const db = getDb();
  const settings = await getSettings(organizationId);
  const rows = await db
    .select({
      booking: schema.booking,
      profName: schema.professional.name,
    })
    .from(schema.booking)
    .leftJoin(
      schema.professional,
      eq(schema.booking.professionalId, schema.professional.id)
    )
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.contactId, contactId),
        eq(schema.booking.kind, "session"),
        eq(schema.booking.status, "agendada"),
        eq(schema.booking.isTest, false),
        gte(schema.booking.scheduledAt, now)
      )
    )
    .orderBy(asc(schema.booking.scheduledAt))
    .limit(10);

  return rows.map((r) => {
    const scheduledAtUtc = r.booking.scheduledAt.toISOString();
    const parts = partsInTz(scheduledAtUtc, settings.timezone);
    return {
      id: r.booking.id,
      scheduledAtUtc,
      date: parts.date,
      time: parts.time,
      weekday: parts.weekday,
      source: r.booking.source,
      professionalName: r.profName ?? r.booking.specialistName ?? null,
      procedureName: r.booking.procedureName ?? null,
      meetingLink: r.booking.meetingLink ?? null,
    };
  });
}
