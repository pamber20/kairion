import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAction, agentActionSchema, degradeAction } from "@/server/ai/actions";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";

const { mockRescheduleForConversation, mockCancelForConversation } = vi.hoisted(
  () => ({
    mockRescheduleForConversation: vi.fn(),
    mockCancelForConversation: vi.fn(),
  })
);

vi.mock("@/server/agenda/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agenda/service")>();
  return {
    ...actual,
    rescheduleForConversation: mockRescheduleForConversation,
    cancelForConversation: mockCancelForConversation,
  };
});

import { cancelSlot, rescheduleSlot } from "@/server/agenda/agent";

describe("Interacción del agente incluido con citas (manuales y de IA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida acciones reschedule_slot y cancel_booking cuando agenda=true y las oculta cuando agenda=false", () => {
    const withAgenda = agentActionSchema(true);
    const withoutAgenda = agentActionSchema(false);

    expect(
      withAgenda.safeParse({
        action: "reschedule_slot",
        bookingId: "bkg_1",
        startUtc: "2026-11-29T16:00:00.000Z",
        reply: "Con gusto te la muevo",
      }).success
    ).toBe(true);

    expect(
      withAgenda.safeParse({
        action: "cancel_booking",
        bookingId: "bkg_1",
      }).success
    ).toBe(true);

    expect(
      withoutAgenda.safeParse({
        action: "cancel_booking",
        bookingId: "bkg_1",
      }).success
    ).toBe(false);
  });

  it("degrada reschedule_slot y cancel_booking a reply o none si la agenda no está activa", () => {
    expect(
      degradeAction({
        action: "reschedule_slot",
        startUtc: "2026-11-29T16:00:00.000Z",
        reply: "Te confirmo por aquí",
      })
    ).toEqual({ action: "reply", text: "Te confirmo por aquí" });

    expect(
      degradeAction({
        action: "cancel_booking",
      })
    ).toEqual({ action: "none" });
  });

  it("incluye instrucciones para consultar, reprogramar y cancelar citas activas en el system prompt", () => {
    const prompt = buildAgentSystemPrompt({
      profile: {
        id: "prf_bot",
        organizationId: "org_1",
        enabled: true,
        name: "Sofía",
        tone: "Amable",
        instructions: null,
        escalationRules: null,
        greeting: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      kb: [],
      stages: [{ name: "Nuevo" }],
      agenda: true,
    });

    expect(prompt).toContain("reschedule_slot");
    expect(prompt).toContain("cancel_booking");
    expect(prompt).toContain("CITAS ACTIVAS DEL CLIENTE");
    expect(AgentAction).toBeDefined();
  });

  it("reprograma una cita existente mediante rescheduleSlot", async () => {
    mockRescheduleForConversation.mockResolvedValue({
      booking: { id: "bkg_manual_1" },
      label: "dom 29 nov a las 11:00",
      meetingLink: "https://meet.google.com/abc-defg-hij",
    });

    const turn = await rescheduleSlot({
      organizationId: "org_1",
      conversationId: "cv_1",
      bookingId: "bkg_manual_1",
      startUtc: "2026-11-29T16:00:00.000Z",
    });

    expect(turn.ok).toBe(true);
    expect(turn.text).toContain("dom 29 nov a las 11:00");
    expect(turn.text).toContain("https://meet.google.com/abc-defg-hij");
  });

  it("cancela una cita existente mediante cancelSlot", async () => {
    mockCancelForConversation.mockResolvedValue({
      bookingId: "bkg_manual_1",
      label: "sáb 28 nov a las 15:00",
    });

    const turn = await cancelSlot({
      organizationId: "org_1",
      conversationId: "cv_1",
      bookingId: "bkg_manual_1",
    });

    expect(turn.ok).toBe(true);
    expect(turn.text).toContain("sáb 28 nov a las 15:00");
  });
});
