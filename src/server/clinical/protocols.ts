import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export interface DentalTreatmentDef {
  name: string;
  description: string;
  preOpTips: string;
  postOpTips: string;
  recallMonths: number;
}

export const MDENTAL_TREATMENTS: DentalTreatmentDef[] = [
  {
    name: "Profilaxis y Limpieza Láser",
    description: "Limpieza profunda con tecnología láser indolora, remoción de sarro y pulido sin desgaste del esmalte.",
    preOpTips: "• Ven con 10 minutos de anticipación para tu registro en recepción (Of. 408).\n• Realiza un cepillado habitual antes de salir.\n• Puedes alimentarte normalmente previo a tu cita.",
    postOpTips: "• Mantén cepillado suave durante las primeras 12 horas.\n• Evita bebidas excesivamente frías o calientes si sientes leve sensibilidad transitoria.\n• ¡Tus encías y dientes quedaron desinfectados y protegidos!",
    recallMonths: 6,
  },
  {
    name: "Blanqueamiento Dental Láser",
    description: "Aclaramiento dental avanzado fotoactivado con láser en 1 sesión de 45 min sin hipersensibilidad.",
    preOpTips: "• Llega 10 minutos antes a Torre Dann Carlton (Piso 4, Of. 408).\n• Aliméntate bien antes de la cita, ya que posterior al tratamiento habrá restricción de alimentos por 2 horas.",
    postOpTips: "• 'Dieta Blanca' durante las próximas 48 horas: evita café, té, vino tinto, chocolate, salsas rojas y bebidas oscuras.\n• No fumes ni consumas alimentos muy ácidos.\n• Usa crema dental para dientes sensibles si el especialista te lo formuló.",
    recallMonths: 6,
  },
  {
    name: "Diseño de Sonrisa & Carillas Láser",
    description: "Valoración y diseño estético personalizado con escaneo digital y microescultura guiada por láser.",
    preOpTips: "• Asiste puntual con 10 minutos de holgura.\n• Trae fotos o referencias de tu sonrisa ideal si lo deseas para la sesión de diagnóstico fotográfico con el Dr. Mario David.",
    postOpTips: "• Evita morder objetos duros (hielo, lápices, uñas).\n• Utiliza seda dental diariamente con suavidad.\n• Asiste a tus controles de ajuste programados.",
    recallMonths: 6,
  },
  {
    name: "Ortodoncia Invisible (Alineadores)",
    description: "Alineación dental estética mediante férulas transparentes removibles y seguimiento computarizado.",
    preOpTips: "• Asiste con higiene bucal al día.\n• Si ya usas alineadores o retenedores previos, tráelos contigo a consulta.",
    postOpTips: "• Usa tus alineadores 22 horas al día.\n• Retíralos únicamente para comer y lavarte los dientes.\n• Lávalos con agua fría y jabón neutro, nunca con agua caliente.",
    recallMonths: 3,
  },
  {
    name: "Implantes y Cirugía Guiada Láser",
    description: "Rehabilitación fija con implantes dentales de titanio/circonio y bioestimulación láser para rápida cicatrización.",
    preOpTips: "• Trae tus exámenes radiográficos o tomografía si los tienes.\n• Toma tus medicamentos habituales a menos que el Dr. Mario David te haya indicado suspender anticoagulantes.\n• No ingieras alcohol 24h antes.",
    postOpTips: "• Aplica compresas frías en la zona externa durante las primeras 24 horas (15 min puesta, 15 min descanso).\n• Dieta blanda y fría (helado, yogur, papillas).\n• No realices enjuagues vigorosos ni escupas el primer día.\n• Toma la medicación analgésica y antibiótica exactamente según la fórmula médica.",
    recallMonths: 6,
  },
];

export const CLINIC_LOCATION_INFO = {
  name: "MDental Láser",
  director: "Dr. Mario David",
  address: "Cra 43A # 7-50, Torre Dann Carlton, Piso 4, Oficina 408, El Poblado, Medellín",
  googleMapsUrl: "https://maps.google.com/?q=Torre+Dann+Carlton+Medellin",
  wazeUrl: "https://waze.com/ul?q=Torre+Dann+Carlton+Medellin",
  accessGuide: "Ingresa por el lobby principal del Hotel Dann Carlton El Poblado. Toma los ascensores hacia la Torre Médica/Oficinas hasta el Piso 4, Oficina 408. Dispones de parqueadero cubierto en las instalaciones del hotel.",
  googleReviewUrl: "https://g.page/r/mdental-laser-medellin/review", // Enlace directo a reseñas 5 estrellas
};

export function getClinicLocationInfo(): typeof CLINIC_LOCATION_INFO {
  return {
    name: process.env.CLINIC_NAME || CLINIC_LOCATION_INFO.name,
    director: process.env.CLINIC_DIRECTOR || CLINIC_LOCATION_INFO.director,
    address: process.env.CLINIC_ADDRESS || CLINIC_LOCATION_INFO.address,
    googleMapsUrl: process.env.CLINIC_MAPS_URL || CLINIC_LOCATION_INFO.googleMapsUrl,
    wazeUrl: process.env.CLINIC_WAZE_URL || CLINIC_LOCATION_INFO.wazeUrl,
    accessGuide: process.env.CLINIC_ACCESS_GUIDE || CLINIC_LOCATION_INFO.accessGuide,
    googleReviewUrl: process.env.CLINIC_REVIEW_URL || CLINIC_LOCATION_INFO.googleReviewUrl,
  };
}

/**
 * Carga o asegura las guías de tratamientos clínicos para la organización.
 */
export async function seedClinicalProtocols(organizationId: string): Promise<void> {
  const db = getDb();
  for (const treatment of MDENTAL_TREATMENTS) {
    const existing = await db
      .select({ id: schema.clinicalProcedureGuide.id })
      .from(schema.clinicalProcedureGuide)
      .where(
        scoped(
          schema.clinicalProcedureGuide.organizationId,
          organizationId,
          eq(schema.clinicalProcedureGuide.procedureName, treatment.name)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.clinicalProcedureGuide).values({
        id: newId("clinicalProcedure"),
        organizationId,
        procedureName: treatment.name,
        description: treatment.description,
        preOpTips: treatment.preOpTips,
        postOpTips: treatment.postOpTips,
        recallMonths: treatment.recallMonths,
      });
    }
  }
}

/**
 * Inicializa el perfil de agente y base de conocimiento especializada de MDental Láser.
 */
export async function seedMdentalClinic(organizationId: string): Promise<void> {
  const db = getDb();

  // 1. Asegurar protocolos clínicos
  await seedClinicalProtocols(organizationId);

  // 2. Perfil de Agente Clínico
  const existingProfile = await db
    .select({ id: schema.agentProfile.id })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);

  const profileData = {
    name: "Asistente Virtual MDental Láser",
    tone: "Cálido, empático, profesional y tranquilizador. Resalta los beneficios de la odontología láser sin dolor, sin ruido molesto ni agujas invasivas.",
    instructions:
      "Eres el asistente clínico oficial de MDental Láser en Medellín (Torre Dann Carlton, Cra 43A # 7-50, Piso 4, Of. 408). Realizas triage clínico inicial (identificas si el paciente busca profilaxis láser, blanqueamiento, diseño de sonrisa, ortodoncia invisible, implantes o si tiene dolor agudo/urgencia). Solicitas nombre completo y cédula para su historia clínica. Para agendar valoraciones, ofreces los horarios disponibles de la agenda usando offer_slots y confirmas con book_slot. Si el paciente manifiesta dolor insoportable, traumatismo dental o hemorragia, realiza handoff inmediato al equipo médico.",
    escalationRules:
      "Dolor severo o agudo, urgencias de traumatismo o caída dental, quejas sobre tratamientos en curso, solicitudes de hablar con el Dr. Mario David directamente.",
    greeting:
      "¡Hola! Te damos la bienvenida a MDental Láser. Soy tu asistente virtual. ¿En qué podemos cuidar tu sonrisa hoy?",
    enabled: true,
  };

  if (existingProfile.length === 0) {
    await db.insert(schema.agentProfile).values({
      id: newId("agentProfile"),
      organizationId,
      ...profileData,
    });
  } else {
    await db
      .update(schema.agentProfile)
      .set({ ...profileData, updatedAt: new Date() })
      .where(eq(schema.agentProfile.id, existingProfile[0]!.id));
  }

  // 3. Entradas de Knowledge Base (KB)
  const kbEntries = [
    {
      question: "¿Dónde están ubicados y cómo llegar?",
      answer:
        "Estamos ubicados en Medellín, El Poblado: Cra 43A # 7-50, Torre Dann Carlton, Piso 4, Oficina 408. Ingresas por el lobby principal del hotel y tomas el ascensor a la torre médica. Disponemos de parqueadero cubierto para tu comodidad.",
    },
    {
      question: "¿Qué es la odontología láser y duele?",
      answer:
        "En MDental Láser utilizamos tecnología láser de alta precisión que reemplaza el torno tradicional en la mayoría de tratamientos. Es un procedimiento indoloro, no genera calor ni vibraciones molestas, permitiendo en muchos casos prescindir de agujas y anestesias pesadas con una cicatrización mucho más rápida.",
    },
    {
      question: "¿Cuáles son los tratamientos principales de MDental Láser?",
      answer:
        "Contamos con portafolio especializado en: Odontología láser sin dolor, Blanqueamiento láser en 1 sesión de 45 min, Diseño de sonrisa digital de alta precisión con el Dr. Mario David, Profilaxis láser con ultrasonido, Ortodoncia invisible (alineadores transparentes) e Implantes dentales guiados.",
    },
    {
      question: "¿Quién es el Dr. Mario David?",
      answer:
        "El Dr. Mario David es el director clínico de MDental Láser, especialista con amplia trayectoria en estética dental, diseño de sonrisa y protocolos de odontología láser avanzada en Colombia.",
    },
    {
      question: "¿Cómo funciona el agendamiento y los recordatorios?",
      answer:
        "Agendamos tu cita en menos de 90 segundos validando disponibilidad en tiempo real. Te enviaremos tips de preparación previa 48h y 24h antes, la ruta directa en Waze y Google Maps el día de tu cita, y recomendaciones de cuidado post-operatorio al finalizar tu procedimiento.",
    },
  ];

  for (const item of kbEntries) {
    const existing = await db
      .select({ id: schema.kbEntry.id })
      .from(schema.kbEntry)
      .where(
        scoped(
          schema.kbEntry.organizationId,
          organizationId,
          eq(schema.kbEntry.question, item.question)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.kbEntry).values({
        id: newId("kbEntry"),
        organizationId,
        kind: "qa",
        question: item.question,
        answer: item.answer,
      });
    }
  }
}
