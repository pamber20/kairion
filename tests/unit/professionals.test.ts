import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import { agentActionSchema } from "@/server/ai/actions";

type Profile = Parameters<typeof buildAgentSystemPrompt>[0]["profile"];
const profile = {
  name: "Asistente Dental",
  tone: "amable",
  instructions: null,
  escalationRules: null,
  greeting: null,
} as unknown as Profile;

describe("Agenda multi-profesional en system prompt", () => {
  it("incluye el bloque de profesionales cuando la agenda está activa y hay especialistas", () => {
    const prompt = buildAgentSystemPrompt({
      profile,
      kb: [],
      stages: [{ name: "Nuevo" }],
      agenda: true,
      professionals: [
        { id: "prf_1", name: "Dra. Sofía Gómez", specialty: "Ortodoncia" },
        { id: "prf_2", name: "Dr. Carlos Ruiz", specialty: "Endodoncia" },
      ],
    });

    expect(prompt).toContain("PROFESIONALES / ESPECIALISTAS ACTIVOS:");
    expect(prompt).toContain('- ID "prf_1": Dra. Sofía Gómez (Ortodoncia)');
    expect(prompt).toContain('- ID "prf_2": Dr. Carlos Ruiz (Endodoncia)');
    expect(prompt).toContain("offer_slots");
    expect(prompt).toContain("book_slot");
  });

  it("no muestra el bloque de profesionales si no hay profesionales o la agenda está apagada", () => {
    const promptSinAgenda = buildAgentSystemPrompt({
      profile,
      kb: [],
      stages: [{ name: "Nuevo" }],
      agenda: false,
      professionals: [{ id: "prf_1", name: "Dra. Sofía Gómez" }],
    });
    expect(promptSinAgenda).not.toContain("PROFESIONALES / ESPECIALISTAS ACTIVOS:");

    const promptSinProfesionales = buildAgentSystemPrompt({
      profile,
      kb: [],
      stages: [{ name: "Nuevo" }],
      agenda: true,
      professionals: [],
    });
    expect(promptSinProfesionales).not.toContain("PROFESIONALES / ESPECIALISTAS ACTIVOS:");
  });
});

describe("Acciones del agente con profesionales", () => {
  const schema = agentActionSchema(true);

  it("acepta offer_slots con professionalId y specialty opcionales", () => {
    const res1 = schema.safeParse({
      action: "offer_slots",
      reply: "Tengo estos horarios con la Dra. Sofía:",
      professionalId: "prf_1",
    });
    expect(res1.success).toBe(true);

    const res2 = schema.safeParse({
      action: "offer_slots",
      reply: "Para ortodoncia dispongo de:",
      specialty: "Ortodoncia",
    });
    expect(res2.success).toBe(true);
  });

  it("acepta book_slot con professionalId opcional", () => {
    const res = schema.safeParse({
      action: "book_slot",
      startUtc: "2026-11-20T10:00:00.000Z",
      professionalId: "prf_1",
      reply: "¡Listo! Cita confirmada.",
    });
    expect(res.success).toBe(true);
  });
});
