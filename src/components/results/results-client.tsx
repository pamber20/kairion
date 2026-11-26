"use client";

import { useEffect, useState } from "react";
import type {
  AdsBlockDto,
  BookingsBlockDto,
  BookingsScope,
  BotBlockDto,
  HygieneBlockDto,
  SalesBlockDto,
} from "@/lib/analytics";
import { AdsSection } from "./ads-section";
import { BookingsSection } from "./bookings-section";
import { BotSection } from "./bot-section";
import { HygieneSection } from "./hygiene-section";
import { defaultRange, RangePicker, type Range } from "./range-picker";
import { SalesSection } from "./sales-section";

type Block<T> = { data: T | null; loading: boolean; error: string | null };

const inicial = <T,>(): Block<T> => ({ data: null, loading: true, error: null });

/**
 * Pide un bloque y lo deja en su estado. Mientras llega, CONSERVA lo anterior
 * (la sección lo atenúa): vaciar en cada cambio de rango haría saltar la
 * pantalla. Una respuesta que llega tarde, de un rango que ya no es el
 * elegido, se descarta con el `AbortSignal`.
 */
async function cargar<T>(
  url: string,
  set: (update: (prev: Block<T>) => Block<T>) => void,
  signal: AbortSignal
): Promise<void> {
  set((prev) => ({ ...prev, loading: true, error: null }));
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    if (signal.aborted) return;
    set(() => ({ data: null, loading: false, error: "No se pudo cargar. Revisa tu conexión." }));
    return;
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (signal.aborted) return;
  if (!res.ok || !body) {
    set(() => ({
      data: null,
      loading: false,
      error: body?.error?.message ?? "No se pudo calcular este bloque.",
    }));
    return;
  }
  set(() => ({ data: body, loading: false, error: null }));
}

/**
 * 019 — Pantalla Resultados.
 *
 * Cada bloque carga por su cuenta: son una veintena de consultas repartidas en
 * cuatro grupos, y en una sola respuesta el más lento retrasaría a los tres
 * rápidos. Así la pantalla pinta en cascada y un bloque roto muestra su propio
 * error sin tumbar el resto.
 */
export function ResultsClient({
  currency,
  agenda,
  today,
  timezone,
}: {
  currency: string;
  agenda: boolean;
  /** Hoy en la zona del negocio (`YYYY-MM-DD`), resuelto en el servidor. */
  today: string;
  timezone: string;
}) {
  const [range, setRange] = useState<Range>(() => defaultRange(today));
  const [sales, setSales] = useState<Block<SalesBlockDto>>(inicial);
  const [ads, setAds] = useState<Block<AdsBlockDto>>(inicial);
  const [bot, setBot] = useState<Block<BotBlockDto>>(inicial);
  const [hygiene, setHygiene] = useState<Block<HygieneBlockDto>>(inicial);
  const [bookings, setBookings] = useState<Block<BookingsBlockDto>>(inicial);
  const [bookingsScope, setBookingsScope] = useState<BookingsScope>("period");
  const [bookingsSearch, setBookingsSearch] = useState("");
  const [bookingsOnlyNoShow, setBookingsOnlyNoShow] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const q = `from=${range.from}&to=${range.to}`;
    void cargar(`/api/analytics/sales?${q}`, setSales, ctl.signal);
    void cargar(`/api/analytics/ads?${q}`, setAds, ctl.signal);
    void cargar(`/api/analytics/bot?${q}`, setBot, ctl.signal);
    return () => ctl.abort();
  }, [range]);

  useEffect(() => {
    if (!agenda) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        scope: bookingsScope,
      });
      if (bookingsSearch.trim()) params.set("q", bookingsSearch.trim());
      if (bookingsOnlyNoShow) params.set("onlyNoShow", "1");
      void cargar(`/api/analytics/bookings?${params.toString()}`, setBookings, ctl.signal);
    }, bookingsSearch.trim() ? 250 : 0);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [agenda, range, bookingsScope, bookingsSearch, bookingsOnlyNoShow]);

  const bookingsCsvParams = new URLSearchParams({
    from: range.from,
    to: range.to,
    scope: bookingsScope,
    format: "csv",
  });
  if (bookingsSearch.trim()) bookingsCsvParams.set("q", bookingsSearch.trim());
  if (bookingsOnlyNoShow) bookingsCsvParams.set("onlyNoShow", "1");

  // La higiene describe el AHORA: no depende del rango elegido.
  useEffect(() => {
    const ctl = new AbortController();
    void cargar("/api/analytics/hygiene", setHygiene, ctl.signal);
    return () => ctl.abort();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight">Resultados</h2>
          <p className="text-xs text-text-3">
            Ventas, el trabajo del agente, de dónde llegan y qué se está cayendo.
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} today={today} timezone={timezone} />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
        <SalesSection {...sales} currency={currency} />
        <AdsSection {...ads} />
        <BotSection {...bot} agenda={agenda} />
        {agenda && (
          <BookingsSection
            {...bookings}
            scope={bookingsScope}
            onScopeChange={setBookingsScope}
            search={bookingsSearch}
            onSearchChange={setBookingsSearch}
            onlyNoShow={bookingsOnlyNoShow}
            onOnlyNoShowChange={setBookingsOnlyNoShow}
            csvHref={`/api/analytics/bookings?${bookingsCsvParams.toString()}`}
          />
        )}
        <HygieneSection {...hygiene} currency={currency} />
      </div>
    </div>
  );
}
