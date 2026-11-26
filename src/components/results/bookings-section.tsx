"use client";

import { Download, Search } from "lucide-react";
import type { BookingsBlockDto, BookingsScope } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Rate, Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";

export function BookingsSection({
  data,
  loading,
  error,
  scope,
  onScopeChange,
  search,
  onSearchChange,
  onlyNoShow,
  onOnlyNoShowChange,
  csvHref,
}: {
  data: BookingsBlockDto | null;
  loading: boolean;
  error: string | null;
  scope: BookingsScope;
  onScopeChange: (scope: BookingsScope) => void;
  search: string;
  onSearchChange: (q: string) => void;
  onlyNoShow: boolean;
  onOnlyNoShowChange: (v: boolean) => void;
  csvHref: string;
}) {
  const right = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border bg-subtle p-0.5 text-xs">
        <button
          type="button"
          onClick={() => onScopeChange("period")}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            scope === "period"
              ? "bg-card text-foreground shadow-2xs"
              : "text-text-2 hover:text-foreground"
          )}
        >
          Periodo
        </button>
        <button
          type="button"
          onClick={() => onScopeChange("all")}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            scope === "all"
              ? "bg-card text-foreground shadow-2xs"
              : "text-text-2 hover:text-foreground"
          )}
        >
          Histórico global
        </button>
      </div>
      <a
        href={csvHref}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-subtle"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar CSV
      </a>
    </div>
  );

  const hasFilters = Boolean(search.trim()) || onlyNoShow;

  return (
    <Section
      id="record-citas"
      title="Récord de citas"
      hint="Consolidado global, por profesional y por cliente (excluye bloqueos y citas de prueba)."
      loading={loading}
      error={error}
      hasData={data !== null}
      empty={Boolean(data?.empty && !hasFilters)}
      emptyText={
        scope === "all"
          ? "Aún no hay citas registradas en la organización."
          : "Ninguna cita cae en este periodo."
      }
      right={right}
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
            <StatCard
              label="Agendadas"
              value={String(data.global.total)}
              hint={
                data.global.pending > 0
                  ? `${data.global.pending} pendiente${data.global.pending === 1 ? "" : "s"}`
                  : undefined
              }
            />
            <StatCard label="Realizadas" value={String(data.global.done)} />
            <StatCard label="No asistió" value={String(data.global.noShow)} />
            <StatCard label="Canceladas" value={String(data.global.cancelled)} />
            <RateCard
              label="Asistencia"
              rate={data.global.showRate}
              unit="con desenlace"
            />
          </div>

          {data.byProfessional.length > 0 && (
            <div>
              <Subhead>Por profesional</Subhead>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b bg-subtle text-[11px] font-semibold uppercase tracking-wider text-text-3">
                      <th className="px-3 py-2">Profesional</th>
                      <th className="px-3 py-2 text-right">Agendadas</th>
                      <th className="px-3 py-2 text-right">Realizadas</th>
                      <th className="px-3 py-2 text-right">No asistió</th>
                      <th className="px-3 py-2 text-right">Canceladas</th>
                      <th className="px-3 py-2 text-right">Asistencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.byProfessional.map((p) => (
                      <tr key={p.professionalId ?? "unassigned"} className="hover:bg-subtle/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {p.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: p.color }}
                              />
                            )}
                            <span className="font-medium text-foreground">{p.name}</span>
                            {p.specialty && (
                              <span className="text-text-3">· {p.specialty}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{p.total}</td>
                        <td className="px-3 py-2 text-right text-success-text font-medium">{p.done}</td>
                        <td className="px-3 py-2 text-right text-danger-text font-medium">{p.noShow}</td>
                        <td className="px-3 py-2 text-right text-text-2">{p.cancelled}</td>
                        <td className="px-3 py-2 text-right">
                          <Rate rate={p.showRate} unit="citas" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Subhead>Por cliente</Subhead>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
                  <Input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar cliente o teléfono…"
                    className="h-8 w-56 pl-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={onlyNoShow ? "default" : "outline"}
                  onClick={() => onOnlyNoShowChange(!onlyNoShow)}
                  className="h-8 px-2.5 text-xs"
                >
                  Solo con inasistencias
                </Button>
              </div>
            </div>

            {data.byClient.length === 0 ? (
              <p className="rounded-md border bg-subtle/40 py-6 text-center text-xs text-text-3">
                No hay clientes que coincidan con los filtros actuales.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b bg-subtle text-[11px] font-semibold uppercase tracking-wider text-text-3">
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2 text-right">Agendadas</th>
                      <th className="px-3 py-2 text-right">Pendientes</th>
                      <th className="px-3 py-2 text-right">Realizadas</th>
                      <th className="px-3 py-2 text-right">No asistió</th>
                      <th className="px-3 py-2 text-right">Canceladas</th>
                      <th className="px-3 py-2 text-right">Asistencia</th>
                      <th className="px-3 py-2 text-right">Última cita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.byClient.map((c) => (
                      <tr key={c.contactId} className="hover:bg-subtle/50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{c.name}</div>
                          {c.phone && (
                            <div className="text-[11px] text-text-3">{c.phone}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{c.total}</td>
                        <td className="px-3 py-2 text-right text-text-2">{c.pending}</td>
                        <td className="px-3 py-2 text-right font-medium text-success-text">{c.done}</td>
                        <td className="px-3 py-2 text-right font-medium text-danger-text">{c.noShow}</td>
                        <td className="px-3 py-2 text-right text-text-2">{c.cancelled}</td>
                        <td className="px-3 py-2 text-right">
                          <Rate rate={c.showRate} unit="citas" />
                        </td>
                        <td className="px-3 py-2 text-right text-text-2">
                          {c.lastBookingAt.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
