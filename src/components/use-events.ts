"use client";

import { useEffect, useRef } from "react";

export type EventHandlers = {
  onMessageNew?: (data: { conversationId: string; message: unknown }) => void;
  onMessageStatus?: (data: {
    conversationId: string;
    messageId: string;
    status: string;
    /** Motivo, presente solo cuando status = "failed". */
    error?: string | null;
  }) => void;
  onConversationUpdated?: (data: { conversation: unknown }) => void;
  /** 026 */
  onConversationDeleted?: (data: {
    conversationId: string;
    contactId: string;
    contactDeleted: boolean;
  }) => void;
  onLabRun?: (data: {
    runId: string;
    status: string;
    progress: { done: number; total: number };
    score?: number | null;
  }) => void;
  /** 015 — Algo cambió en la agenda (también cuando agenda la IA). */
  onBookingUpdated?: (data: { bookingId: string }) => void;
  /** Se llama tras RECONECTAR (no en la conexión inicial): catch-up con refetch. */
  onReconnect?: () => void;
};

// ============================================================
// Singleton EventSource: comparte UNA sola conexión SSE por pestaña
// Evita el agotamiento de sockets HTTP/1.1 (máx 6 conexiones concurrentes)
// ============================================================

type HandlerRef = React.MutableRefObject<EventHandlers>;
const activeListeners = new Set<HandlerRef>();
let sharedSource: EventSource | null = null;
let closeTimer: NodeJS.Timeout | null = null;
let hadError = false;

function ensureSharedSource(): void {
  if (typeof window === "undefined") return;

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (sharedSource) return;

  const source = new EventSource("/api/events");
  sharedSource = source;

  const listen = <T>(type: string, dispatch: (h: EventHandlers, data: T) => void) => {
    source.addEventListener(type, (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as T;
        for (const ref of activeListeners) {
          dispatch(ref.current, parsed);
        }
      } catch {
        // evento malformado: ignorar
      }
    });
  };

  listen<{ conversationId: string; message: unknown }>("message.new", (h, d) =>
    h.onMessageNew?.(d)
  );
  listen<{
    conversationId: string;
    messageId: string;
    status: string;
    error?: string | null;
  }>("message.status", (h, d) => h.onMessageStatus?.(d));
  listen<{ conversation: unknown }>("conversation.updated", (h, d) =>
    h.onConversationUpdated?.(d)
  );
  listen<{
    conversationId: string;
    contactId: string;
    contactDeleted: boolean;
  }>("conversation.deleted", (h, d) => h.onConversationDeleted?.(d));
  listen<{
    runId: string;
    status: string;
    progress: { done: number; total: number };
    score?: number | null;
  }>("lab.run", (h, d) => h.onLabRun?.(d));
  listen<{ bookingId: string }>("booking.updated", (h, d) =>
    h.onBookingUpdated?.(d)
  );

  source.onerror = () => {
    hadError = true;
  };

  source.onopen = () => {
    if (hadError) {
      hadError = false;
      for (const ref of activeListeners) {
        ref.current.onReconnect?.();
      }
    }
  };
}

function releaseSharedSource(): void {
  if (activeListeners.size > 0) return;

  // Si no quedan listeners activos, esperamos 4 segundos antes de cerrar
  // para permitir transiciones de ruta rápidas sin reconectar innecesariamente.
  closeTimer = setTimeout(() => {
    if (activeListeners.size === 0 && sharedSource) {
      sharedSource.close();
      sharedSource = null;
      hadError = false;
    }
  }, 4000);
}

/**
 * Suscripción SSE de la bandeja y navegación.
 * Utiliza un singleton compartido para no saturar los límites de conexión del navegador.
 */
export function useEvents(handlers: EventHandlers): void {
  const handlersRef = useRef<EventHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    activeListeners.add(handlersRef);
    ensureSharedSource();

    return () => {
      activeListeners.delete(handlersRef);
      releaseSharedSource();
    };
  }, []);
}
