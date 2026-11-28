import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAgendaEnabled,
  mockCreateSessionBooking,
  mockCreateBlock,
  mockBookingPayload,
} = vi.hoisted(() => ({
  mockAgendaEnabled: vi.fn(),
  mockCreateSessionBooking: vi.fn(),
  mockCreateBlock: vi.fn(),
  mockBookingPayload: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    withAuth: (handler: (s: { organizationId: string }, r: Request) => Promise<Response>) => {
      return (req: Request) => handler({ organizationId: "org_1" }, req);
    },
  };
});

vi.mock("@/server/agenda/flag", () => ({
  agendaEnabled: mockAgendaEnabled,
  agendaDisabledResponse: () => new Response(null, { status: 404 }),
}));

vi.mock("@/server/agenda/service", () => ({
  createSessionBooking: mockCreateSessionBooking,
  createBlock: mockCreateBlock,
}));

vi.mock("@/server/agenda/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agenda/http")>();
  return {
    ...actual,
    bookingPayload: mockBookingPayload,
  };
});

import { POST } from "@/app/api/bookings/route";

describe("Creación manual de citas vía POST /api/bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgendaEnabled.mockReturnValue(true);
    mockBookingPayload.mockReturnValue({
      bookingId: "bkg_1",
      startUtc: "2026-11-28T15:00:00.000Z",
    });
  });

  it("crea una cita manual con source='manual', requireOffer=false y profesional asignado", async () => {
    mockCreateSessionBooking.mockResolvedValue({
      booking: { id: "bkg_1" },
    });

    const req = new Request("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        kind: "session",
        contactId: "ct_1",
        startUtc: "2026-11-28T15:00:00.000Z",
        professionalId: "prf_1",
        procedureName: "Valoración",
        notes: "Paciente referido",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCreateSessionBooking).toHaveBeenCalledWith({
      organizationId: "org_1",
      contactId: "ct_1",
      conversationId: null,
      startUtc: "2026-11-28T15:00:00.000Z",
      notes: "Paciente referido",
      professionalId: "prf_1",
      specialistName: null,
      procedureName: "Valoración",
      source: "manual",
      requireOffer: false,
    });
  });

  it("rechaza con 422 si falta contactId o startUtc en una cita manual", async () => {
    const req = new Request("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        kind: "session",
        startUtc: "2026-11-28T15:00:00.000Z",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(mockCreateSessionBooking).not.toHaveBeenCalled();
  });
});
