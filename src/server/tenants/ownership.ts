import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export type TransferOwnershipResult =
  | {
      ok: true;
      alreadyOwner?: boolean;
      owner: { id: string; name: string; email: string };
    }
  | {
      ok: false;
      reason: "org_not_found" | "user_not_found" | "member_not_found";
    };

/**
 * Transfiere de forma atómica la propiedad ("owner") de una organización a otro
 * usuario. Degrada a "member" a los propietarios anteriores de la organización
 * y promueve (o agrega) al usuario destino como "owner".
 */
export async function transferOrganizationOwnership(input: {
  organizationId: string;
  targetUserId: string;
}): Promise<TransferOwnershipResult> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, input.organizationId))
      .limit(1);

    if (!org) {
      return { ok: false, reason: "org_not_found" };
    }

    const [targetUser] = await tx
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(eq(schema.user.id, input.targetUserId))
      .limit(1);

    if (!targetUser) {
      return { ok: false, reason: "user_not_found" };
    }

    await tx
      .update(schema.member)
      .set({ role: "member" })
      .where(
        scoped(
          schema.member.organizationId,
          input.organizationId,
          eq(schema.member.role, "owner")
        )
      );

    const [existingMember] = await tx
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        scoped(
          schema.member.organizationId,
          input.organizationId,
          eq(schema.member.userId, input.targetUserId)
        )
      )
      .limit(1);

    if (existingMember) {
      await tx
        .update(schema.member)
        .set({ role: "owner" })
        .where(
          scoped(
            schema.member.organizationId,
            input.organizationId,
            eq(schema.member.id, existingMember.id)
          )
        );
    } else {
      await tx.insert(schema.member).values({
        id: newId("member"),
        organizationId: input.organizationId,
        userId: input.targetUserId,
        role: "owner",
      });
    }

    return { ok: true, owner: targetUser };
  });
}

/**
 * Transfiere la propiedad a un miembro ya existente de la organización
 * identificado por `memberId`.
 */
export async function transferOwnershipByMemberId(input: {
  organizationId: string;
  memberId: string;
}): Promise<TransferOwnershipResult> {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(
      scoped(
        schema.member.organizationId,
        input.organizationId,
        eq(schema.member.id, input.memberId)
      )
    )
    .limit(1);

  if (!row) {
    return { ok: false, reason: "member_not_found" };
  }

  if (row.role === "owner") {
    const [u] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(eq(schema.user.id, row.userId))
      .limit(1);
    if (!u) return { ok: false, reason: "user_not_found" };
    return { ok: true, alreadyOwner: true, owner: u };
  }

  return transferOrganizationOwnership({
    organizationId: input.organizationId,
    targetUserId: row.userId,
  });
}
