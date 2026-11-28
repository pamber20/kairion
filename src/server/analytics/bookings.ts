import { desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  rate,
  type BookingClientRowDto,
  type BookingCountsDto,
  type BookingProfessionalRowDto,
  type BookingsBlockDto,
  type BookingsScope,
} from "@/lib/analytics";
import type { ResolvedPeriod } from "@/server/analytics/period";

export function summarizeBookingCounts(input: {
  total: number;
  pending: number;
  done: number;
  noShow: number;
  cancelled: number;
}): BookingCountsDto {
  return {
    ...input,
    showRate: rate(input.done, input.done + input.noShow),
  };
}

function bookingFilter(
  organizationId: string,
  period: ResolvedPeriod,
  scope: BookingsScope,
  extra: (SQL | undefined)[] = []
) {
  const rangeConds =
    scope === "period"
      ? [
          gte(schema.booking.scheduledAt, period.start),
          lt(schema.booking.scheduledAt, period.end),
        ]
      : [];

  return scoped(
    schema.booking.organizationId,
    organizationId,
    eq(schema.booking.kind, "session"),
    eq(schema.booking.isTest, false),
    ...rangeConds,
    ...extra
  );
}

const AGG_COLS = {
  total: sql<number>`count(*)::int`,
  pending: sql<number>`count(*) filter (where ${schema.booking.status} = 'agendada')::int`,
  done: sql<number>`count(*) filter (where ${schema.booking.status} = 'realizada')::int`,
  noShow: sql<number>`count(*) filter (where ${schema.booking.status} = 'no_show')::int`,
  cancelled: sql<number>`count(*) filter (where ${schema.booking.status} = 'cancelada')::int`,
};

async function queryGlobal(
  organizationId: string,
  period: ResolvedPeriod,
  scope: BookingsScope
): Promise<BookingCountsDto> {
  const rows = await getDb()
    .select(AGG_COLS)
    .from(schema.booking)
    .where(bookingFilter(organizationId, period, scope));

  const row = rows[0] ?? {
    total: 0,
    pending: 0,
    done: 0,
    noShow: 0,
    cancelled: 0,
  };
  return summarizeBookingCounts(row);
}

async function queryByProfessional(
  organizationId: string,
  period: ResolvedPeriod,
  scope: BookingsScope
): Promise<BookingProfessionalRowDto[]> {
  const rows = await getDb()
    .select({
      professionalId: schema.professional.id,
      name: schema.professional.name,
      specialty: schema.professional.specialty,
      color: schema.professional.color,
      ...AGG_COLS,
    })
    .from(schema.booking)
    .leftJoin(
      schema.professional,
      eq(schema.booking.professionalId, schema.professional.id)
    )
    .where(bookingFilter(organizationId, period, scope))
    .groupBy(
      schema.professional.id,
      schema.professional.name,
      schema.professional.specialty,
      schema.professional.color
    )
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({
    ...summarizeBookingCounts({
      total: r.total,
      pending: r.pending,
      done: r.done,
      noShow: r.noShow,
      cancelled: r.cancelled,
    }),
    professionalId: r.professionalId ?? null,
    name: r.name ?? "Sin profesional asignado",
    specialty: r.specialty ?? null,
    color: r.color ?? null,
  }));
}

async function queryByClient(
  organizationId: string,
  period: ResolvedPeriod,
  scope: BookingsScope,
  opts: { q?: string; onlyNoShow?: boolean; limit: number }
): Promise<BookingClientRowDto[]> {
  const search = opts.q?.trim();
  const searchCond = search
    ? or(
        ilike(schema.contact.name, `%${search}%`),
        ilike(schema.contact.phone, `%${search}%`),
        ilike(schema.contact.waIdentity, `%${search}%`)
      )
    : undefined;

  const baseQuery = getDb()
    .select({
      contactId: schema.contact.id,
      name: schema.contact.name,
      phone: schema.contact.phone,
      waIdentity: schema.contact.waIdentity,
      lastBookingAt: sql<Date>`max(${schema.booking.scheduledAt})`,
      ...AGG_COLS,
    })
    .from(schema.booking)
    .innerJoin(schema.contact, eq(schema.booking.contactId, schema.contact.id))
    .where(bookingFilter(organizationId, period, scope, [searchCond]))
    .groupBy(
      schema.contact.id,
      schema.contact.name,
      schema.contact.phone,
      schema.contact.waIdentity
    );

  const filteredQuery = opts.onlyNoShow
    ? baseQuery.having(
        sql`count(*) filter (where ${schema.booking.status} = 'no_show') > 0`
      )
    : baseQuery;

  const rows = await filteredQuery
    .orderBy(
      desc(sql`count(*)`),
      desc(sql`count(*) filter (where ${schema.booking.status} = 'no_show')`),
      desc(sql`max(${schema.booking.scheduledAt})`)
    )
    .limit(opts.limit);

  return rows.map((r) => ({
    ...summarizeBookingCounts({
      total: r.total,
      pending: r.pending,
      done: r.done,
      noShow: r.noShow,
      cancelled: r.cancelled,
    }),
    contactId: r.contactId,
    name: r.name?.trim() || r.phone || r.waIdentity,
    phone: r.phone ?? null,
    lastBookingAt: new Date(r.lastBookingAt).toISOString(),
  }));
}

export async function bookingsBlock(
  organizationId: string,
  period: ResolvedPeriod,
  opts?: {
    scope?: BookingsScope;
    q?: string;
    onlyNoShow?: boolean;
    limit?: number;
  }
): Promise<BookingsBlockDto> {
  const scope: BookingsScope = opts?.scope === "all" ? "all" : "period";
  const limit = opts?.limit ?? 200;

  const [global, byProfessional, byClient] = await Promise.all([
    queryGlobal(organizationId, period, scope),
    queryByProfessional(organizationId, period, scope),
    queryByClient(organizationId, period, scope, {
      q: opts?.q,
      onlyNoShow: opts?.onlyNoShow,
      limit,
    }),
  ]);

  return {
    period: period.dto,
    scope,
    global,
    byProfessional,
    byClient,
    empty: global.total === 0,
  };
}

function csvCell(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildBookingsCsv(rows: BookingClientRowDto[]): string {
  const header = [
    "Cliente",
    "Teléfono",
    "Agendadas",
    "Pendientes",
    "Realizadas",
    "No asistió",
    "Canceladas",
    "% Asistencia",
    "Última cita",
  ].join(",");

  const lines = rows.map((r) => {
    const pct =
      r.showRate.value === null ? "N/A" : `${r.showRate.value}%`;
    return [
      csvCell(r.name),
      csvCell(r.phone),
      csvCell(r.total),
      csvCell(r.pending),
      csvCell(r.done),
      csvCell(r.noShow),
      csvCell(r.cancelled),
      csvCell(pct),
      csvCell(r.lastBookingAt.slice(0, 10)),
    ].join(",");
  });

  return `\uFEFF${[header, ...lines].join("\n")}`;
}
