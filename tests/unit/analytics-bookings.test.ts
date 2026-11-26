import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAgendaEnabled, mockPeriodFromRequest, mockBookingsBlock } = vi.hoisted(
  () => ({
    mockAgendaEnabled: vi.fn(),
    mockPeriodFromRequest: vi.fn(),
    mockBookingsBlock: vi.fn(),
  })
);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    withAuth: (handler: (s: { organizationId: string }, r: Request) => Promise<Response>) => {
      return (req: Request) => handler({ organizationId: "org_test" }, req);
    },
  };
});

vi.mock("@/server/agenda/flag", () => ({
  agendaEnabled: mockAgendaEnabled,
}));

vi.mock("@/server/analytics/period", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/analytics/period")>();
  return {
    ...actual,
    periodFromRequest: mockPeriodFromRequest,
  };
});

vi.mock("@/server/analytics/bookings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/analytics/bookings")>();
  return {
    ...actual,
    bookingsBlock: mockBookingsBlock,
  };
});

import {
  buildBookingsCsv,
  summarizeBookingCounts,
} from "@/server/analytics/bookings";
import { GET } from "@/app/api/analytics/bookings/route";

describe("Analítica y récord de citas (global y por cliente)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgendaEnabled.mockReturnValue(true);
    mockPeriodFromRequest.mockResolvedValue({
      start: new Date("2026-11-01T00:00:00Z"),
      end: new Date("2026-12-01T00:00:00Z"),
      dto: {
        from: "2026-11-01",
        to: "2026-11-30",
        previousFrom: "2026-10-01",
        previousTo: "2026-10-31",
        timezone: "America/Bogota",
        granularity: "day",
        days: 30,
      },
    });
  });

  it("calcula el porcentaje de asistencia solo contra citas con desenlace (realizadas + no_show)", () => {
    const res = summarizeBookingCounts({
      total: 10,
      pending: 3,
      done: 4,
      noShow: 1,
      cancelled: 2,
    });
    expect(res.showRate).toEqual({ value: 80, sample: 5, reliable: false });

    const sinDesenlace = summarizeBookingCounts({
      total: 4,
      pending: 3,
      done: 0,
      noShow: 0,
      cancelled: 1,
    });
    expect(sinDesenlace.showRate).toEqual({
      value: null,
      sample: 0,
      reliable: false,
    });
  });

  it("genera CSV con BOM UTF-8 y escapado correcto de comas y comillas", () => {
    const csv = buildBookingsCsv([
      {
        contactId: "ct_1",
        name: 'Pérez, "Ana" María',
        phone: "+573001234567",
        total: 5,
        pending: 1,
        done: 3,
        noShow: 1,
        cancelled: 0,
        showRate: { value: 75, sample: 4, reliable: false },
        lastBookingAt: "2026-11-25T15:00:00.000Z",
      },
    ]);
    expect(csv.startsWith("\uFEFFCliente,Teléfono,Agendadas")).toBe(true);
    expect(csv).toContain(
      '"Pérez, ""Ana"" María",+573001234567,5,1,3,1,0,75%,2026-11-25'
    );
  });

  it("responde 404 cuando AGENDA está apagada", async () => {
    mockAgendaEnabled.mockReturnValue(false);
    const res = await GET(new Request("http://localhost/api/analytics/bookings"));
    expect(res.status).toBe(404);
    expect(mockBookingsBlock).not.toHaveBeenCalled();
  });

  it("responde JSON con scope y filtros cuando AGENDA está encendida", async () => {
    mockBookingsBlock.mockResolvedValue({
      scope: "all",
      global: { total: 2, pending: 0, done: 1, noShow: 1, cancelled: 0, showRate: { value: 50, sample: 2, reliable: false } },
      byProfessional: [],
      byClient: [],
      empty: false,
    });
    const res = await GET(
      new Request(
        "http://localhost/api/analytics/bookings?scope=all&q=Laura&onlyNoShow=1"
      )
    );
    expect(res.status).toBe(200);
    expect(mockBookingsBlock).toHaveBeenCalledWith(
      "org_test",
      expect.any(Object),
      {
        scope: "all",
        q: "Laura",
        onlyNoShow: true,
        limit: 200,
      }
    );
  });

  it("responde CSV descargable cuando format=csv", async () => {
    mockBookingsBlock.mockResolvedValue({
      scope: "period",
      global: { total: 1, pending: 0, done: 1, noShow: 0, cancelled: 0, showRate: { value: 100, sample: 1, reliable: false } },
      byProfessional: [],
      byClient: [
        {
          contactId: "ct_1",
          name: "Carlos",
          phone: "+573001112233",
          total: 1,
          pending: 0,
          done: 1,
          noShow: 0,
          cancelled: 0,
          showRate: { value: 100, sample: 1, reliable: false },
          lastBookingAt: "2026-11-10T10:00:00.000Z",
        },
      ],
      empty: false,
    });
    const res = await GET(
      new Request("http://localhost/api/analytics/bookings?format=csv")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Carlos,+573001112233,1,0,1,0,0,100%,2026-11-10");
  });
});
