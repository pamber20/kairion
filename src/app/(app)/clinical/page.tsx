"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CalendarCheck,
  Clock,
  MapPin,
  RefreshCw,
  Sparkles,
  Star,
  Users,
  CheckCircle2,
} from "lucide-react";

interface ClinicalStatus {
  upcomingAppointments: number;
  confirmedAppointments: number;
  unconfirmedAppointments: number;
  satisfaction: {
    totalReviews: number;
    fiveStarReviews: number;
    averageScore: number;
  };
  reactivation: {
    eligiblePatientsCount: number;
    candidatesSample: Array<{
      contactId: string;
      name: string;
      lastProcedure: string | null;
      daysInactive: number;
    }>;
  };
}

interface ClinicalProtocol {
  procedureName: string;
  description: string;
  preOpTips: string;
  postOpTips: string;
  recallMonths: number;
}

export default function ClinicalDashboardPage() {
  const [status, setStatus] = useState<ClinicalStatus | null>(null);
  const [protocols, setProtocols] = useState<ClinicalProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [resStatus, resProtocols] = await Promise.all([
        fetch("/api/clinical/status"),
        fetch("/api/clinical/protocols"),
      ]);

      if (resStatus.ok) {
        const data = await resStatus.json();
        setStatus(data.clinicalOverview);
      }
      if (resProtocols.ok) {
        const data = await resProtocols.json();
        setProtocols(data.protocols || []);
      }
    } catch (err) {
      console.error("Error cargando datos clínicos:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleTriggerCycle() {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/clinical/status", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRunMessage(
          `Ciclo completado: ${data.executed.preOpTipsSent} tips pre-op, ${data.executed.locationGuidesSent} rutas Maps/Waze, ${data.executed.postOpTipsSent} cuidados post-op y ${data.executed.reactivationsTriggered} reactivaciones enviadas.`
        );
        await loadData();
      }
    } catch {
      setRunMessage("Ocurrió un error al ejecutar el ciclo.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 mb-2">
            <Activity className="w-3.5 h-3.5" />
            MDental Láser · Protocolo Clínico 360°
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Acompañamiento, Fidelización y Reactivación
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dr. Mario David & Equipo Clínico · Torre Dann Carlton (Piso 4, Of. 408), El Poblado, Medellín
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="Refrescar indicadores"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => void handleTriggerCycle()}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${running ? "animate-pulse" : ""}`} />
            {running ? "Ejecutando ciclo..." : "Ejecutar Ciclo Clínico Ahora"}
          </button>
        </div>
      </div>

      {runMessage && (
        <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-sm text-cyan-800 dark:text-cyan-200 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span>{runMessage}</span>
        </div>
      )}

      {/* Tarjetas de Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. Agendamiento y Citas */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Citas Próximas</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight">
            {status?.upcomingAppointments ?? 0}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {status?.confirmedAppointments ?? 0} confirmadas
            </span>
            <span>•</span>
            <span>{status?.unconfirmedAppointments ?? 0} pendientes</span>
          </div>
        </div>

        {/* 2. Reactivación Semestral */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Por Reactivar (&gt;6 Meses)</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {status?.reactivation.eligiblePatientsCount ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">
            Pacientes sin consulta hace $\ge$ 180 días listos para invitar a control.
          </div>
        </div>

        {/* 3. Reputación y Google Reviews */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Google Reviews 5★</span>
            <div className="p-2 rounded-lg bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400">
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {status?.satisfaction.averageScore ?? 5.0}
            </span>
            <span className="text-xs text-muted-foreground">/ 5.0 promedio</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {status?.satisfaction.fiveStarReviews ?? 0} pacientes 5★ redirigidos a Google Maps.
          </div>
        </div>

        {/* 4. Ubicación y Acceso Torre Dann */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Llegada sin Estrés</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-semibold text-foreground">
            Torre Dann Carlton (Of. 408)
          </div>
          <div className="text-xs text-muted-foreground">
            Waze, Google Maps y pautas de acceso enviadas el día de cada cita.
          </div>
        </div>
      </div>

      {/* Grid de Secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pacientes Detectados para Reactivación */}
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="font-semibold text-base text-foreground">
                Pacientes Inactivos (+6 Meses)
              </h2>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted font-medium text-muted-foreground">
              {status?.reactivation.eligiblePatientsCount ?? 0} identificados
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            El algoritmo analiza la fecha del último procedimiento y activa la secuencia cálida de control semestral sin intervención manual.
          </p>

          <div className="divide-y divide-border">
            {status?.reactivation.candidatesSample && status.reactivation.candidatesSample.length > 0 ? (
              status.reactivation.candidatesSample.map((c) => (
                <div key={c.contactId} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Último tratamiento: {c.lastProcedure ?? "Profilaxis / Consulta"}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                      hace {c.daysInactive} días
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No hay pacientes que superen los 180 días de inactividad pendientes por contactar.
              </div>
            )}
          </div>
        </div>

        {/* Portafolio Láser y Protocolos 360° */}
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="font-semibold text-base text-foreground">
                Portafolio Clínico & Tips Pre y Post
              </h2>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-medium">
              Odontología Láser
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Instrucciones automatizadas que blindan la asistencia y guían la recuperación del paciente.
          </p>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {protocols.map((p) => (
              <div
                key={p.procedureName}
                className="p-3.5 rounded-lg border border-border/80 bg-muted/30 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">
                    {p.procedureName}
                  </span>
                  <span className="text-muted-foreground">
                    Control cada {p.recallMonths} meses
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50 text-[11px]">
                  <div>
                    <span className="font-medium text-cyan-600 dark:text-cyan-400 block mb-0.5">
                      Tips Previos (48h/24h):
                    </span>
                    <span className="text-muted-foreground whitespace-pre-line">
                      {p.preOpTips}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400 block mb-0.5">
                      Pautas Post-Operatorias:
                    </span>
                    <span className="text-muted-foreground whitespace-pre-line">
                      {p.postOpTips}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
