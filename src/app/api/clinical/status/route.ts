import { and, eq, sql, gte, isNotNull } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { scanPatientsForReactivation } from "@/server/clinical/reactivation";
import {
  dispatchPreOpTips,
  dispatchLocationTips,
  dispatchPostOpTips,
} from "@/server/clinical/notifications";
import { runReactivationBatch } from "@/server/clinical/reactivation";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinical/status
 * Resumen de indicadores clínicos de MDental Láser:
 * - Citas confirmadas vs pendientes
 * - Pacientes listos para reactivación (+180 días)
 * - Calificaciones de satisfacción recopiladas (Google Reviews)
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const orgId = session.organizationId;
  const now = new Date();

  // Citas próximas (próximos 7 días)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingBookings = await db
    .select({
      id: schema.booking.id,
      patientConfirmation: schema.booking.patientConfirmation,
      reviewScore: schema.booking.reviewScore,
      status: schema.booking.status,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        orgId,
        and(
          eq(schema.booking.isTest, false),
          gte(schema.booking.scheduledAt, now),
          sql`${schema.booking.scheduledAt} <= ${nextWeek}`
        )
      )
    );

  const confirmedCount = upcomingBookings.filter(
    (b) => b.patientConfirmation === "confirmed"
  ).length;
  const unconfirmedCount = upcomingBookings.filter(
    (b) => b.patientConfirmation === "unconfirmed"
  ).length;

  // Reseñas recopiladas
  const reviews = await db
    .select({
      score: schema.booking.reviewScore,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        orgId,
        isNotNull(schema.booking.reviewScore)
      )
    );

  const totalReviews = reviews.length;
  const fiveStarReviews = reviews.filter((r) => r.score === 5).length;
  const averageScore =
    totalReviews > 0
      ? (
          reviews.reduce((acc, curr) => acc + (curr.score ?? 0), 0) /
          totalReviews
        ).toFixed(1)
      : "5.0";

  // Candidatos a reactivación semestral (>180 días)
  const reactivationCandidates = await scanPatientsForReactivation(orgId);

  return Response.json({
    clinicalOverview: {
      upcomingAppointments: upcomingBookings.length,
      confirmedAppointments: confirmedCount,
      unconfirmedAppointments: unconfirmedCount,
      satisfaction: {
        totalReviews,
        fiveStarReviews,
        averageScore: Number(averageScore),
      },
      reactivation: {
        eligiblePatientsCount: reactivationCandidates.length,
        candidatesSample: reactivationCandidates.slice(0, 10).map((c) => ({
          contactId: c.contactId,
          name: c.name,
          lastProcedure: c.lastProcedureType,
          daysInactive: c.daysInactive,
        })),
      },
    },
  });
});

/**
 * POST /api/clinical/status
 * Dispara manualmente una ronda del ciclo de automatización clínica para la organización actual.
 */
export const POST = withAuth(async (session) => {
  const orgId = session.organizationId;

  try {
    const preOp = await dispatchPreOpTips(orgId);
    const location = await dispatchLocationTips(orgId);
    const postOp = await dispatchPostOpTips(orgId);
    const reactivation = await runReactivationBatch(orgId, 10);

    return Response.json({
      success: true,
      executed: {
        preOpTipsSent: preOp,
        locationGuidesSent: location,
        postOpTipsSent: postOp,
        reactivationsTriggered: reactivation.sent,
      },
    });
  } catch (err) {
    console.error("[api/clinical/status] error ejecutando ciclo clínico:", err);
    return apiError(500, "internal_error", "Error ejecutando ciclo clínico");
  }
});
