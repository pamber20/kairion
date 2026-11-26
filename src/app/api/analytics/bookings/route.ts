import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import { agendaEnabled } from "@/server/agenda/flag";
import { bookingsBlock, buildBookingsCsv } from "@/server/analytics/bookings";
import { PeriodError, periodFromRequest } from "@/server/analytics/period";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  scope: z.enum(["period", "all"]).default("period"),
  q: z.string().trim().max(120).optional(),
  onlyNoShow: z.enum(["0", "1", "true", "false"]).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    onlyNoShow: url.searchParams.get("onlyNoShow") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });

  if (!parsed.success) {
    return apiError(422, "invalid_query", "Parámetros de consulta inválidos");
  }

  try {
    const period = await periodFromRequest(session.organizationId, url);
    const { scope, q, onlyNoShow, format } = parsed.data;
    const isNoShowOnly = onlyNoShow === "1" || onlyNoShow === "true";

    const data = await bookingsBlock(session.organizationId, period, {
      scope,
      q,
      onlyNoShow: isNoShowOnly,
      limit: format === "csv" ? 5000 : 200,
    });

    if (format === "csv") {
      const csv = buildBookingsCsv(data.byClient);
      const suffix =
        scope === "all" ? "historico" : `${period.dto.from}_${period.dto.to}`;
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="record-citas-${suffix}.csv"`,
        },
      });
    }

    return Response.json(data);
  } catch (err) {
    if (err instanceof PeriodError) {
      return apiError(422, "invalid_period", err.message);
    }
    throw err;
  }
});
