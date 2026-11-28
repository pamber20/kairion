"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Search, UserPlus } from "lucide-react";
import { blockStartUtc } from "@/lib/time/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ContactOption = {
  id: string;
  name: string;
  phone: string | null;
};

type SlotOption = {
  startUtc: string;
  time: string;
  professionalId: string | null;
  professionalName: string | null;
};

export function ManualBookingDialog({
  initialDay,
  initialTime,
  initialProfessionalId,
  professionals,
  timezone,
  onCancel,
  onSwitchToBlock,
  onCreated,
}: {
  initialDay: string;
  initialTime: string;
  initialProfessionalId?: string | null;
  professionals: { id: string; name: string; specialty?: string | null; color: string }[];
  timezone: string;
  onCancel: () => void;
  onSwitchToBlock: (day: string, time: string) => void;
  onCreated: (day: string, bookingId: string) => void;
}) {
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  const [professionalId, setProfessionalId] = useState<string>(
    initialProfessionalId ?? (professionals[0]?.id ?? "")
  );
  const [procedureName, setProcedureName] = useState("");
  const [notes, setNotes] = useState("");

  // Selección o creación de cliente
  const [createClient, setCreateClient] = useState(false);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Disponibilidad sugerida del día
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Buscar contactos en vivo
  useEffect(() => {
    if (createClient) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingContacts(true);
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/contacts${qs}`, { signal: ctl.signal }).catch(
        () => null
      );
      setLoadingContacts(false);
      if (!res?.ok) return;
      const data = (await res.json().catch(() => null)) as {
        contacts?: ContactOption[];
      } | null;
      if (data?.contacts) {
        setContacts(data.contacts.slice(0, 8));
      }
    }, search.trim() ? 200 : 0);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [search, createClient]);

  // Consultar huecos disponibles para el día y profesional seleccionados
  useEffect(() => {
    if (!day) return;
    const ctl = new AbortController();
    setLoadingSlots(true);
    const params = new URLSearchParams({ from: day, to: day });
    if (professionalId) params.set("professionalId", professionalId);
    void fetch(`/api/calendar/availability?${params.toString()}`, {
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { slots?: SlotOption[] } | null) => {
        if (ctl.signal.aborted) return;
        setLoadingSlots(false);
        setSlots(d?.slots ?? []);
      })
      .catch(() => {
        if (!ctl.signal.aborted) setLoadingSlots(false);
      });
    return () => ctl.abort();
  }, [day, professionalId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const startUtc = blockStartUtc(day, time, timezone);
    if (!startUtc) {
      setError("Esa hora no existe en la zona del negocio");
      return;
    }

    setBusy(true);
    setError(null);

    let contactId = selectedContact?.id ?? "";
    if (createClient) {
      const cleanName = newName.trim();
      const cleanPhone = newPhone.replace(/\D/g, "");
      if (!cleanName) {
        setBusy(false);
        setError("Ingresa el nombre del cliente");
        return;
      }
      if (cleanPhone.length < 7 || cleanPhone.length > 15) {
        setBusy(false);
        setError("Ingresa el teléfono con código de país (7 a 15 dígitos)");
        return;
      }

      const cRes = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          source: "conocido",
        }),
      }).catch(() => null);

      const cData = (await cRes?.json().catch(() => null)) as {
        contact?: { id: string };
        error?: { message?: string };
      } | null;

      if (!cRes?.ok || !cData?.contact?.id) {
        setBusy(false);
        setError(cData?.error?.message ?? "No se pudo registrar el cliente");
        return;
      }
      contactId = cData.contact.id;
    } else if (!contactId) {
      setBusy(false);
      setError("Selecciona un cliente o crea uno nuevo");
      return;
    }

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "session",
        contactId,
        startUtc,
        professionalId: professionalId || null,
        procedureName: procedureName.trim() || null,
        notes: notes.trim() || null,
      }),
    }).catch(() => null);

    setBusy(false);
    const data = (await res?.json().catch(() => null)) as {
      booking?: { id: string };
      error?: { message?: string };
    } | null;

    if (res?.status !== 201 || !data?.booking?.id) {
      setError(data?.error?.message ?? "No se pudo agendar la cita");
      return;
    }

    onCreated(day, data.booking.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nueva-cita-titulo"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border bg-popover p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 id="nueva-cita-titulo" className="flex items-center gap-2 text-[16px] font-bold">
              <CalendarPlus className="h-4 w-4 text-brand" />
              Nueva cita manual
            </h3>
            <p className="mt-0.5 text-xs text-text-3">
              Agenda una cita directamente en el calendario ({timezone}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSwitchToBlock(day, time)}
            className="text-xs font-medium text-text-3 underline hover:text-foreground"
          >
            Bloquear horario
          </button>
        </div>

        {/* Cliente */}
        <div className="space-y-2 rounded-md border bg-subtle/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold">Cliente *</Label>
            <button
              type="button"
              onClick={() => {
                setCreateClient(!createClient);
                setError(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <UserPlus className="h-3 w-3" />
              {createClient ? "Buscar cliente existente" : "Crear cliente nuevo"}
            </button>
          </div>

          {createClient ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="manual-client-name" className="text-xs">
                  Nombre *
                </Label>
                <Input
                  id="manual-client-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Laura Gómez"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-client-phone" className="text-xs">
                  Teléfono (con código país) *
                </Label>
                <Input
                  id="manual-client-phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Ej: 573001234567"
                />
              </div>
            </div>
          ) : selectedContact ? (
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{selectedContact.name}</p>
                {selectedContact.phone && (
                  <p className="text-xs text-text-3">{selectedContact.phone}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedContact(null)}
                className="h-7 px-2 text-xs"
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o teléfono…"
                  className="h-8 bg-background pl-8 text-xs"
                />
              </div>
              <div className="max-h-36 divide-y overflow-y-auto rounded-md border bg-background">
                {loadingContacts ? (
                  <p className="px-3 py-2 text-xs text-text-3">Buscando…</p>
                ) : contacts.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-text-3">
                    Sin coincidencias. Puedes crear un cliente nuevo arriba.
                  </p>
                ) : (
                  contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContact(c)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-subtle"
                    >
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-text-3">{c.phone ?? ""}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profesional */}
        {professionals.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="manual-prof">Profesional</Label>
            <select
              id="manual-prof"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
            >
              <option value="">General / Sin asignar</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.specialty ? ` · ${p.specialty}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Fecha y hora */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-day">Día</Label>
            <Input
              id="manual-day"
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-time">Hora</Label>
            <Input
              id="manual-time"
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        {/* Sugerencias de huecos libres */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-2">
            Horarios disponibles para ese día {loadingSlots && "(consultando…)"}
          </p>
          {slots.length === 0 ? (
            <p className="text-xs text-text-3">
              {loadingSlots
                ? "Cargando disponibilidad…"
                : "Sin huecos libres en el horario configurado para este día."}
            </p>
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {slots.slice(0, 24).map((s) => (
                <button
                  key={`${s.startUtc}-${s.professionalId ?? "g"}`}
                  type="button"
                  onClick={() => {
                    setTime(s.time);
                    if (s.professionalId) setProfessionalId(s.professionalId);
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    time === s.time &&
                      (!s.professionalId || s.professionalId === professionalId)
                      ? "border-brand bg-brand-soft text-brand-text"
                      : "bg-background hover:bg-subtle"
                  )}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Motivo y notas */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-proc">Motivo / Procedimiento</Label>
            <Input
              id="manual-proc"
              value={procedureName}
              onChange={(e) => setProcedureName(e.target.value)}
              placeholder="Ej: Valoración / Consulta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-notes">Notas</Label>
            <Input
              id="manual-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Agendando…" : "Agendar cita"}
          </Button>
        </div>
      </form>
    </div>
  );
}
