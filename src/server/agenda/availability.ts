import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  addDaysISO,
  eachDateInRange,
  expandWorkingDayToUtc,
  labelInTz,
  overlaps,
  todayInTz,
  weekdayKeyOf,
  zonedWallClockToUtc,
  type SlotUtc,
} from "@/lib/time/slots";
import { getSettings, type CalendarSettings } from "@/server/agenda/settings";

/**
 * 015 — Motor de disponibilidad:
 *   horario semanal (del negocio o del profesional) − citas activas − bloqueos manuales.
 *
 * Limitación v1 documentada (Constitución VII): NO lee calendarios externos.
 * Es una decisión, no un olvido: meter al proveedor en este camino acoplaría su
 * latencia y sus caídas a la pantalla que más se usa. Los compromisos de fuera
 * se reflejan con bloqueos manuales.
 */

export type AvailableSlot = SlotUtc & {
  label: string;
  professionalId?: string | null;
  professionalName?: string | null;
  specialty?: string | null;
};

/**
 * PURA: expande el horario semanal a slots candidatos en UTC. Sin BD, sin
 * reloj — se testea sola (tests/unit/availability.test.ts).
 */
export function buildCandidateSlots(
  settings: CalendarSettings,
  fromISO: string,
  toISO: string
): SlotUtc[] {
  const tz = settings.timezone;
  const candidates: SlotUtc[] = [];
  for (const date of eachDateInRange(fromISO, toISO)) {
    const weekday = weekdayKeyOf(date, tz);
    if (!weekday) continue;
    const intervals = settings.weeklyHours[weekday] ?? [];
    if (intervals.length === 0) continue; // día cerrado
    candidates.push(
      ...expandWorkingDayToUtc(
        date,
        intervals,
        tz,
        settings.slotMinutes,
        settings.bufferMinutes
      )
    );
  }
  return candidates;
}

/**
 * PURA: descarta lo que ya pasó (con aviso mínimo) y lo que se solapa con algo
 * ocupado, ordena y etiqueta.
 */
export function filterFreeSlots(
  candidates: SlotUtc[],
  busy: SlotUtc[],
  opts: { now: Date; minNoticeHours: number; timezone: string }
): AvailableSlot[] {
  const minStartMs = opts.now.getTime() + opts.minNoticeHours * 3_600_000;
  return candidates
    .filter((c) => Date.parse(c.startUtc) >= minStartMs)
    .filter(
      (c) =>
        !busy.some((b) => overlaps(c.startUtc, c.endUtc, b.startUtc, b.endUtc))
    )
    .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
    .map((c) => ({ ...c, label: labelInTz(c.startUtc, opts.timezone) }));
}

export async function computeAvailability(
  organizationId: string,
  opts?: {
    fromISO?: string;
    toISO?: string;
    excludeBookingId?: string;
    now?: Date;
    settings?: CalendarSettings;
    professionalId?: string | null;
    specialty?: string | null;
  }
): Promise<AvailableSlot[]> {
  const settings = opts?.settings ?? (await getSettings(organizationId));
  const now = opts?.now ?? new Date();
  const tz = settings.timezone;

  const from = opts?.fromISO ?? todayInTz(now, tz);
  const to = opts?.toISO ?? addDaysISO(from, settings.maxDaysAhead);

  const db = getDb();
  let professionals = await db
    .select()
    .from(schema.professional)
    .where(
      scoped(
        schema.professional.organizationId,
        organizationId,
        eq(schema.professional.isActive, true)
      )
    )
    .orderBy(asc(schema.professional.name));

  if (opts?.professionalId) {
    professionals = professionals.filter((p) => p.id === opts.professionalId);
    if (professionals.length === 0) return [];
  } else if (opts?.specialty) {
    const term = opts.specialty.toLowerCase().trim();
    professionals = professionals.filter(
      (p) => p.specialty && p.specialty.toLowerCase().includes(term)
    );
    if (professionals.length === 0) return [];
  }

  // Si no hay profesionales creados en la organización, usamos la agenda general tradicional
  if (professionals.length === 0) {
    const candidates = buildCandidateSlots(settings, from, to);
    if (candidates.length === 0) return [];

    const busy = await getBusyIntervals(organizationId, {
      fromUtc: zonedWallClockToUtc(from, "00:00", tz) ?? new Date(0),
      toUtc:
        zonedWallClockToUtc(addDaysISO(to, 1), "00:00", tz) ??
        new Date(now.getTime() + 86_400_000 * 61),
      excludeBookingId: opts?.excludeBookingId,
    });

    return filterFreeSlots(candidates, busy, {
      now,
      minNoticeHours: settings.minNoticeHours,
      timezone: tz,
    });
  }

  // Si hay profesionales activos, calculamos la disponibilidad por profesional y unificamos
  const allAvailable: AvailableSlot[] = [];

  for (const prof of professionals) {
    const profWeeklyHours =
      prof.weeklyHours && typeof prof.weeklyHours === "object"
        ? (prof.weeklyHours as CalendarSettings["weeklyHours"])
        : settings.weeklyHours;

    const profSettings: CalendarSettings = {
      ...settings,
      weeklyHours: profWeeklyHours,
      slotMinutes: prof.slotMinutes ?? settings.slotMinutes,
    };

    const candidates = buildCandidateSlots(profSettings, from, to);
    if (candidates.length === 0) continue;

    const busy = await getBusyIntervals(organizationId, {
      fromUtc: zonedWallClockToUtc(from, "00:00", tz) ?? new Date(0),
      toUtc:
        zonedWallClockToUtc(addDaysISO(to, 1), "00:00", tz) ??
        new Date(now.getTime() + 86_400_000 * 61),
      excludeBookingId: opts?.excludeBookingId,
      professionalId: prof.id,
    });

    const free = filterFreeSlots(candidates, busy, {
      now,
      minNoticeHours: settings.minNoticeHours,
      timezone: tz,
    }).map((s) => ({
      ...s,
      professionalId: prof.id,
      professionalName: prof.name,
      specialty: prof.specialty ?? null,
    }));

    allAvailable.push(...free);
  }

  return allAvailable.sort(
    (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc)
  );
}

/**
 * Re-valida que un instante concreto siga libre. Se llama AL CONFIRMAR, nunca
 * al ofrecer. `excludeBookingId` permite reprogramar sin que la propia cita se
 * bloquee a sí misma.
 *
 * Solo recalcula ±1 día alrededor del instante pedido.
 */
export async function findSlot(
  organizationId: string,
  whenISO: string,
  opts?: {
    excludeBookingId?: string;
    now?: Date;
    settings?: CalendarSettings;
    professionalId?: string | null;
  }
): Promise<AvailableSlot | null> {
  const target = Date.parse(whenISO);
  if (Number.isNaN(target)) return null;

  const settings = opts?.settings ?? (await getSettings(organizationId));
  const dayInTz = todayInTz(new Date(target), settings.timezone);

  const slots = await computeAvailability(organizationId, {
    fromISO: addDaysISO(dayInTz, -1),
    toISO: addDaysISO(dayInTz, 1),
    excludeBookingId: opts?.excludeBookingId,
    now: opts?.now,
    settings,
    professionalId: opts?.professionalId,
  });
  return slots.find((s) => Date.parse(s.startUtc) === target) ?? null;
}

async function getBusyIntervals(
  organizationId: string,
  input: {
    fromUtc: Date;
    toUtc: Date;
    excludeBookingId?: string;
    professionalId?: string | null;
  }
): Promise<SlotUtc[]> {
  const db = getDb();
  const conditions = [
    // Canceladas y no-show liberan el hueco.
    inArray(schema.booking.status, ["agendada", "realizada"]),
    // Sandbox: una cita de prueba no consume la agenda real.
    eq(schema.booking.isTest, false),
    gte(schema.booking.scheduledAt, input.fromUtc),
    lte(schema.booking.scheduledAt, input.toUtc),
  ];

  if (input.professionalId) {
    // Si buscamos para un profesional específico, colisiona si:
    // 1) Hay cita para ese profesional
    // 2) O hay un bloqueo/cita general sin profesional asignado
    conditions.push(
      or(
        eq(schema.booking.professionalId, input.professionalId),
        isNull(schema.booking.professionalId)
      )!
    );
  }

  const rows = await db
    .select({
      id: schema.booking.id,
      scheduledAt: schema.booking.scheduledAt,
      durationMinutes: schema.booking.durationMinutes,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(...conditions)
      )
    );

  return rows
    .filter((r) => r.id !== input.excludeBookingId)
    .map((r) => ({
      startUtc: r.scheduledAt.toISOString(),
      endUtc: new Date(
        r.scheduledAt.getTime() + r.durationMinutes * 60_000
      ).toISOString(),
    }));
}
