import { getDb, schema } from "@/lib/db";
import {
  dispatchPreOpTips,
  dispatchLocationTips,
  dispatchPostOpTips,
} from "./notifications";
import { runReactivationBatch } from "./reactivation";

let clinicalInterval: NodeJS.Timeout | null = null;

/**
 * Ejecuta una pasada completa del ciclo clínico para todas las organizaciones:
 * 1. Tips pre-operatorios (48h/24h)
 * 2. Guía de ubicación y acceso Waze/Maps (día de la cita)
 * 3. Cuidados post-operatorios y encuesta de satisfacción 5★
 * 4. Reactivación de pacientes inactivos (> 180 días)
 */
export async function runClinicalCycle(): Promise<{
  organizationsProcessed: number;
  totalPreOp: number;
  totalLocation: number;
  totalPostOp: number;
  totalReactivated: number;
}> {
  const db = getDb();
  let totalPreOp = 0;
  let totalLocation = 0;
  let totalPostOp = 0;
  let totalReactivated = 0;

  try {
    const orgs = await db.select({ id: schema.organization.id }).from(schema.organization);

    for (const org of orgs) {
      try {
        const preOp = await dispatchPreOpTips(org.id);
        const loc = await dispatchLocationTips(org.id);
        const postOp = await dispatchPostOpTips(org.id);
        const react = await runReactivationBatch(org.id, 5);

        totalPreOp += preOp;
        totalLocation += loc;
        totalPostOp += postOp;
        totalReactivated += react.sent;
      } catch (err) {
        console.warn(`[ciclo-clinico] error procesando org ${org.id}:`, err);
      }
    }

    return {
      organizationsProcessed: orgs.length,
      totalPreOp,
      totalLocation,
      totalPostOp,
      totalReactivated,
    };
  } catch (err) {
    console.error("[ciclo-clinico] error global en el ciclo clínico:", err);
    return {
      organizationsProcessed: 0,
      totalPreOp: 0,
      totalLocation: 0,
      totalPostOp: 0,
      totalReactivated: 0,
    };
  }
}

export function isClinicalModuleEnabled(): boolean {
  return process.env.CLINICAL_MODULE === "true" || process.env.CLINICAL_MODULE === "on";
}

/**
 * Inicia el temporizador de segundo plano para el ciclo clínico (cada 15 minutos).
 * Requiere bandera CLINICAL_MODULE=true o CLINICAL_MODULE=on en el entorno.
 */
export function startClinicalWorker(): void {
  if (!isClinicalModuleEnabled()) {
    return;
  }
  if (clinicalInterval) return;

  console.log("[boot] ciclo clínico activo (CLINICAL_MODULE=on)");

  // Ejecuta la primera pasada diferida en 15 segundos tras arrancar
  setTimeout(() => {
    void runClinicalCycle();
  }, 15000);

  // Intervalo cada 15 minutos (15 * 60 * 1000)
  clinicalInterval = setInterval(() => {
    void runClinicalCycle();
  }, 15 * 60 * 1000);

  if (clinicalInterval.unref) {
    clinicalInterval.unref();
  }
}
