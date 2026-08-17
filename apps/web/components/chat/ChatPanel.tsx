'use client';

/**
 * Panel de conversacion. Fase 1: solo el hueco y el compositor deshabilitado.
 *
 * No hay backend, y no se simula: el campo esta deshabilitado y lo dice.
 * Fingir respuestas aqui haria imposible saber despues que esta conectado
 * de verdad y que no.
 */

import { useIres } from '@/lib/ires/context';

export function ChatPanel() {
  const { state } = useIres();

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Conversación con ORis">
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <p className="max-w-sm text-center text-sm leading-relaxed text-white/25">
          ORis está despierta y en estado <span className="text-white/50">{state}</span>.
          <br />
          La conversación llega en la Fase 2.
        </p>
      </div>

      <div className="border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <input
            type="text"
            disabled
            placeholder="Escribe a ORis…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/20 focus:outline-none disabled:cursor-not-allowed"
            aria-label="Mensaje para ORis"
          />
          <button
            type="button"
            disabled
            aria-label="Entrada por voz"
            className="text-white/25 disabled:cursor-not-allowed"
          >
            {/* Icono inline: no merece la pena una dependencia de iconos todavia. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
