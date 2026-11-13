"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Edit2, UserCheck, UserX, Clock, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Interval = { start: string; end: string };
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WeeklyHours = Partial<Record<DayKey, Interval[]>>;

type Professional = {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  color: string;
  isActive: boolean;
  weeklyHours: WeeklyHours | null;
  slotMinutes: number | null;
  createdAt: string;
};

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const PRESET_COLORS = [
  "#3b82f6", // azul
  "#10b981", // verde esmeralda
  "#8b5cf6", // violeta
  "#f59e0b", // ámbar
  "#ec4899", // rosa
  "#06b6d4", // cian
  "#6366f1", // índigo
  "#14b8a6", // turquesa
];

const DEFAULT_INTERVAL: Interval = { start: "09:00", end: "18:00" };

export function ProfessionalsClient() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [isActive, setIsActive] = useState(true);
  const [slotMinutes, setSlotMinutes] = useState<number | "">("");
  const [hasCustomSchedule, setHasCustomSchedule] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>({
    mon: [{ ...DEFAULT_INTERVAL }],
    tue: [{ ...DEFAULT_INTERVAL }],
    wed: [{ ...DEFAULT_INTERVAL }],
    thu: [{ ...DEFAULT_INTERVAL }],
    fri: [{ ...DEFAULT_INTERVAL }],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/professionals").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { professionals: Professional[] };
      setProfessionals(data.professionals);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSpecialty("");
    setEmail("");
    setPhone("");
    setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]!);
    setIsActive(true);
    setSlotMinutes("");
    setHasCustomSchedule(false);
    setWeeklyHours({
      mon: [{ ...DEFAULT_INTERVAL }],
      tue: [{ ...DEFAULT_INTERVAL }],
      wed: [{ ...DEFAULT_INTERVAL }],
      thu: [{ ...DEFAULT_INTERVAL }],
      fri: [{ ...DEFAULT_INTERVAL }],
    });
    setError(null);
    setShowForm(false);
  }

  function startEdit(p: Professional) {
    setEditingId(p.id);
    setName(p.name);
    setSpecialty(p.specialty ?? "");
    setEmail(p.email ?? "");
    setPhone(p.phone ?? "");
    setColor(p.color || "#3b82f6");
    setIsActive(p.isActive);
    setSlotMinutes(p.slotMinutes ?? "");
    setHasCustomSchedule(Boolean(p.weeklyHours && Object.keys(p.weeklyHours).length > 0));
    setWeeklyHours(
      p.weeklyHours ?? {
        mon: [{ ...DEFAULT_INTERVAL }],
        tue: [{ ...DEFAULT_INTERVAL }],
        wed: [{ ...DEFAULT_INTERVAL }],
        thu: [{ ...DEFAULT_INTERVAL }],
        fri: [{ ...DEFAULT_INTERVAL }],
      }
    );
    setError(null);
    setShowForm(true);
  }

  function toggleDay(day: DayKey) {
    const current = weeklyHours[day];
    const next = { ...weeklyHours };
    if (current && current.length > 0) {
      delete next[day];
    } else {
      next[day] = [{ ...DEFAULT_INTERVAL }];
    }
    setWeeklyHours(next);
  }

  function setIntervalAt(day: DayKey, index: number, next: Partial<Interval>) {
    const intervals = [...(weeklyHours[day] ?? [])];
    const current = intervals[index];
    if (!current) return;
    intervals[index] = { ...current, ...next };
    setWeeklyHours({ ...weeklyHours, [day]: intervals });
  }

  function addInterval(day: DayKey) {
    const intervals = [...(weeklyHours[day] ?? [])];
    intervals.push({ start: "16:00", end: "18:00" });
    setWeeklyHours({ ...weeklyHours, [day]: intervals });
  }

  function removeInterval(day: DayKey, index: number) {
    const intervals = (weeklyHours[day] ?? []).filter((_, i) => i !== index);
    const next = { ...weeklyHours };
    if (intervals.length === 0) delete next[day];
    else next[day] = intervals;
    setWeeklyHours(next);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("El nombre del profesional es obligatorio");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      specialty: specialty.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      color,
      isActive,
      slotMinutes: slotMinutes ? Number(slotMinutes) : null,
      weeklyHours: hasCustomSchedule ? weeklyHours : null,
    };

    const url = editingId ? `/api/professionals/${editingId}` : "/api/professionals";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Error al guardar el profesional");
      return;
    }

    resetForm();
    void refetch();
  }

  async function toggleStatus(p: Professional) {
    await fetch(`/api/professionals/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    void refetch();
  }

  async function handleDelete(p: Professional) {
    if (!confirm(`¿Eliminar o desactivar a "${p.name}"?`)) return;
    await fetch(`/api/professionals/${p.id}`, { method: "DELETE" });
    void refetch();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profesionales y Especialistas</h1>
          <p className="text-muted-foreground text-sm">
            Registra los profesionales del negocio. El agente de IA consultará sus horarios y
            agendará citas asignándoselas automáticamente.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo profesional
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle>{editingId ? "Editar profesional" : "Nuevo profesional"}</CardTitle>
            <CardDescription>
              Configura sus datos, especialidad y disponibilidad para agendamiento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prof-name">Nombre completo *</Label>
                <Input
                  id="prof-name"
                  placeholder="Ej: Dra. Laura Gómez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-spec">Especialidad o rol</Label>
                <Input
                  id="prof-spec"
                  placeholder="Ej: Ortodoncista / General / Asesor"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-email">Correo electrónico</Label>
                <Input
                  id="prof-email"
                  type="email"
                  placeholder="doctor@clinica.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-phone">Teléfono / WhatsApp</Label>
                <Input
                  id="prof-phone"
                  placeholder="+52 55 1234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
              <div className="space-y-2">
                <Label>Color identificador en el calendario</Label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-transform",
                        color === c ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slot-mins">Duración de consulta (minutos, opcional)</Label>
                <Input
                  id="slot-mins"
                  type="number"
                  placeholder="Heredar de la clínica (30 min)"
                  value={slotMinutes}
                  onChange={(e) =>
                    setSlotMinutes(e.target.value ? Number(e.target.value) : "")
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3.5 bg-subtle/50">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Disponible para citas</div>
                <div className="text-xs text-muted-foreground">
                  Si se desactiva, el agente y la agenda no ofrecerán sus horarios.
                </div>
              </div>
              <Switch
                label="Disponible para citas"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Horario de atención</div>
                  <div className="text-xs text-muted-foreground">
                    {hasCustomSchedule
                      ? "Personalizado para este profesional"
                      : "Usando el horario general configurado en Ajustes → Agenda"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHasCustomSchedule((prev) => !prev)}
                >
                  {hasCustomSchedule ? "Usar horario de la clínica" : "Personalizar horario"}
                </Button>
              </div>

              {hasCustomSchedule && (
                <div className="space-y-2 rounded-lg border p-3 bg-background">
                  {DAYS.map(({ key, label }) => {
                    const intervals = weeklyHours[key];
                    const open = Boolean(intervals && intervals.length > 0);
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex flex-col gap-2 rounded border p-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                          open ? "border-border" : "border-border/40 bg-muted/20 opacity-70"
                        )}
                      >
                        <div className="flex items-center gap-2 w-28">
                          <Switch
                            label={label}
                            checked={open}
                            onCheckedChange={() => toggleDay(key)}
                          />
                          <span className="text-sm font-medium">{label}</span>
                        </div>

                        {open && intervals ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            {intervals.map((iv, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <Input
                                  type="time"
                                  value={iv.start}
                                  onChange={(e) =>
                                    setIntervalAt(key, i, { start: e.target.value })
                                  }
                                  className="h-8 w-24 text-xs"
                                />
                                <span className="text-xs text-muted-foreground">a</span>
                                <Input
                                  type="time"
                                  value={iv.end}
                                  onChange={(e) =>
                                    setIntervalAt(key, i, { end: e.target.value })
                                  }
                                  className="h-8 w-24 text-xs"
                                />
                                {intervals.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeInterval(key, i)}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  >
                                    ×
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addInterval(key)}
                              className="h-7 text-xs"
                            >
                              + Rango
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No atiende</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear profesional"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Cargando profesionales...
          </div>
        ) : professionals.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Stethoscope className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base">No hay profesionales registrados</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-4">
              Actualmente la agenda funciona con el calendario único del negocio. Registra a tus
              especialistas para habilitar la agenda multi-profesional.
            </p>
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Crear primer profesional
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {professionals.map((p) => (
              <Card
                key={p.id}
                className={cn(
                  "relative overflow-hidden transition-all border",
                  !p.isActive && "opacity-60 bg-muted/30"
                )}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5"
                  style={{ backgroundColor: p.color }}
                />
                <CardContent className="p-4 pl-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{p.name}</span>
                        {p.isActive ? (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            En pausa
                          </Badge>
                        )}
                      </div>
                      {p.specialty && (
                        <div className="text-xs text-muted-foreground font-medium">
                          {p.specialty}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title={p.isActive ? "Pausar agenda" : "Activar agenda"}
                        onClick={() => toggleStatus(p)}
                      >
                        {p.isActive ? (
                          <UserX className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Editar"
                        onClick={() => startEdit(p)}
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="Eliminar"
                        onClick={() => handleDelete(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-2.5">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {p.weeklyHours ? "Horario propio" : "Horario general"}
                        {p.slotMinutes ? ` · ${p.slotMinutes} min` : ""}
                      </span>
                    </div>
                    {p.phone && <div>{p.phone}</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
