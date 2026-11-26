import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSession,
  mockTransferByMemberId,
  mockTransferByUserId,
  mockDbSelectLimit,
} = vi.hoisted(() => ({
  mockSession: {
    userId: "usr_1",
    organizationId: "org_1",
    role: "owner" as string | null,
    isSuperAdmin: false,
  },
  mockTransferByMemberId: vi.fn(),
  mockTransferByUserId: vi.fn(),
  mockDbSelectLimit: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    withAuth: (handler: (s: typeof mockSession, r: Request, c: unknown) => Promise<Response>) => {
      return (req: Request, ctx: unknown) => handler(mockSession, req, ctx);
    },
  };
});

vi.mock("@/server/tenants/ownership", () => ({
  transferOwnershipByMemberId: mockTransferByMemberId,
  transferOrganizationOwnership: mockTransferByUserId,
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: mockDbSelectLimit,
          }),
        }),
      }),
    }),
  };
});

import { POST as transferTeamOwner } from "@/app/api/settings/team/transfer-owner/route";
import { POST as assignTenantOwner } from "@/app/api/tenants/[id]/owner/route";

describe("Transferencia y cambio de propietario de organización", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.role = "owner";
    mockSession.isSuperAdmin = false;
    mockSession.organizationId = "org_1";
  });

  it("rechaza con 403 si un miembro regular intenta transferir propiedad en /api/settings/team/transfer-owner", async () => {
    mockSession.role = "member";
    const req = new Request("http://localhost/api/settings/team/transfer-owner", {
      method: "POST",
      body: JSON.stringify({ memberId: "mem_2" }),
    });
    const res = await transferTeamOwner(req);
    expect(res.status).toBe(403);
    expect(mockTransferByMemberId).not.toHaveBeenCalled();
  });

  it("permite al owner transferir propiedad a un miembro de su organización", async () => {
    mockTransferByMemberId.mockResolvedValue({
      ok: true,
      owner: { id: "usr_2", name: "Ana", email: "ana@clinica.com" },
    });
    const req = new Request("http://localhost/api/settings/team/transfer-owner", {
      method: "POST",
      body: JSON.stringify({ memberId: "mem_2" }),
    });
    const res = await transferTeamOwner(req);
    expect(res.status).toBe(200);
    expect(mockTransferByMemberId).toHaveBeenCalledWith({
      organizationId: "org_1",
      memberId: "mem_2",
    });
  });

  it("rechaza con 403 si un no-SuperAdmin intenta usar /api/tenants/[id]/owner", async () => {
    mockSession.isSuperAdmin = false;
    const req = new Request("http://localhost/api/tenants/org_2/owner", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@empresa.com" }),
    });
    const res = await assignTenantOwner(req, {
      params: Promise.resolve({ id: "org_2" }),
    });
    expect(res.status).toBe(403);
    expect(mockTransferByUserId).not.toHaveBeenCalled();
  });

  it("asigna propietario existente en /api/tenants/[id]/owner cuando es SuperAdmin", async () => {
    mockSession.isSuperAdmin = true;
    mockDbSelectLimit.mockResolvedValue([{ id: "usr_99" }]);
    mockTransferByUserId.mockResolvedValue({
      ok: true,
      owner: { id: "usr_99", name: "Carlos", email: "carlos@empresa.com" },
    });

    const req = new Request("http://localhost/api/tenants/org_2/owner", {
      method: "POST",
      body: JSON.stringify({ email: "Carlos@Empresa.com" }),
    });
    const res = await assignTenantOwner(req, {
      params: Promise.resolve({ id: "org_2" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; createdAccount: boolean };
    expect(json.ok).toBe(true);
    expect(json.createdAccount).toBe(false);
    expect(mockTransferByUserId).toHaveBeenCalledWith({
      organizationId: "org_2",
      targetUserId: "usr_99",
    });
  });

  it("devuelve 422 user_not_found si el correo no existe y faltan nombre/contraseña", async () => {
    mockSession.isSuperAdmin = true;
    mockDbSelectLimit.mockResolvedValue([]);

    const req = new Request("http://localhost/api/tenants/org_2/owner", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@empresa.com" }),
    });
    const res = await assignTenantOwner(req, {
      params: Promise.resolve({ id: "org_2" }),
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("user_not_found");
  });
});
