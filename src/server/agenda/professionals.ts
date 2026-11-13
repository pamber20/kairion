import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { WeeklyHours } from "@/server/agenda/settings";

export type Professional = typeof schema.professional.$inferSelect;

export type CreateProfessionalInput = {
  name: string;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
  color?: string;
  isActive?: boolean;
  weeklyHours?: WeeklyHours | null;
  slotMinutes?: number | null;
  userId?: string | null;
};

export type UpdateProfessionalInput = Partial<CreateProfessionalInput>;

export async function listProfessionals(
  organizationId: string,
  opts?: { onlyActive?: boolean }
): Promise<Professional[]> {
  const db = getDb();
  const conditions = [scoped(schema.professional.organizationId, organizationId)];
  if (opts?.onlyActive) {
    conditions.push(eq(schema.professional.isActive, true));
  }

  return db
    .select()
    .from(schema.professional)
    .where(and(...conditions))
    .orderBy(asc(schema.professional.name));
}

export async function getProfessional(
  organizationId: string,
  id: string
): Promise<Professional | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.professional)
    .where(
      scoped(
        schema.professional.organizationId,
        organizationId,
        eq(schema.professional.id, id)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function createProfessional(
  organizationId: string,
  input: CreateProfessionalInput
): Promise<Professional> {
  const db = getDb();
  const id = newId("professional");
  const now = new Date();

  const [row] = await db
    .insert(schema.professional)
    .values({
      id,
      organizationId,
      name: input.name.trim(),
      specialty: input.specialty?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      color: input.color?.trim() || "#3b82f6",
      isActive: input.isActive ?? true,
      weeklyHours: input.weeklyHours ?? null,
      slotMinutes: input.slotMinutes ?? null,
      userId: input.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row!;
}

export async function updateProfessional(
  organizationId: string,
  id: string,
  patch: UpdateProfessionalInput
): Promise<Professional | null> {
  const db = getDb();
  const values: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.specialty !== undefined) values.specialty = patch.specialty?.trim() || null;
  if (patch.email !== undefined) values.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) values.phone = patch.phone?.trim() || null;
  if (patch.color !== undefined) values.color = patch.color.trim();
  if (patch.isActive !== undefined) values.isActive = patch.isActive;
  if (patch.weeklyHours !== undefined) values.weeklyHours = patch.weeklyHours;
  if (patch.slotMinutes !== undefined) values.slotMinutes = patch.slotMinutes;
  if (patch.userId !== undefined) values.userId = patch.userId;

  const [row] = await db
    .update(schema.professional)
    .set(values)
    .where(
      scoped(
        schema.professional.organizationId,
        organizationId,
        eq(schema.professional.id, id)
      )
    )
    .returning();

  return row ?? null;
}

export async function deleteProfessional(
  organizationId: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();

  // Si tiene citas asociadas, para no romper historial lo desactivamos en lugar de borrarlo
  const bookings = await db
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.professionalId, id)
      )
    )
    .limit(1);

  if (bookings.length > 0) {
    await db
      .update(schema.professional)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        scoped(
          schema.professional.organizationId,
          organizationId,
          eq(schema.professional.id, id)
        )
      );
    return { ok: true };
  }

  await db
    .delete(schema.professional)
    .where(
      scoped(
        schema.professional.organizationId,
        organizationId,
        eq(schema.professional.id, id)
      )
    );

  return { ok: true };
}
