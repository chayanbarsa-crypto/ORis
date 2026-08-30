'use client';

/**
 * Navegación del panel.
 *
 * Las secciones siguen declarándose como datos, como en la Fase 1 de IRES. Lo
 * que cambia es que ahora algunas existen: `activa` marca cuáles se pueden
 * pulsar y cuáles siguen siendo huecos.
 *
 * Un botón deshabilitado que **dice** que lo está es más honesto que uno que
 * parece funcionar y no hace nada.
 */

export interface SeccionPanel {
  id: string;
  label: string;
  activa: boolean;
  /** Se muestra al pasar por encima de las que aún no existen. */
  nota?: string;
}

export const SECCIONES: readonly SeccionPanel[] = [
  { id: 'panel', label: 'Panel', activa: true },
  { id: 'movimientos', label: 'Movimientos', activa: true },
  { id: 'extractos', label: 'Extractos', activa: true },
  { id: 'categorias', label: 'Categorías', activa: true },
  // El copiloto no es una sección: vive en el panel de la derecha y está
  // siempre abierto. Se queda en la lista porque quien busca «dónde se le
  // pregunta a ORis» mira aquí primero, y encontrarlo con su sitio señalado
  // responde antes que no encontrarlo.
  { id: 'copiloto', label: 'Copiloto', activa: false, nota: 'Está a la derecha, siempre abierto' },
];

export interface FinanceSidebarProps {
  seccion: string;
  onSeccion: (id: string) => void;
  /** Cuántos grupos esperan a que digas qué son. Cero oculta la campana. */
  pendientes?: number;
}

export function FinanceSidebar({ seccion, onSeccion, pendientes = 0 }: FinanceSidebarProps) {
  return (
    <nav
      className="shrink-0 border-b border-white/[0.07] px-5 py-4 md:w-52 md:border-b-0 md:border-r md:py-6"
      aria-label="Secciones de ORis"
    >
      <p className="mb-3 text-[0.58rem] uppercase tracking-[0.26em] text-white/30">Finanzas</p>
      <ul className="flex gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
        {SECCIONES.map((s) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              disabled={!s.activa}
              onClick={() => s.activa && onSeccion(s.id)}
              aria-current={seccion === s.id ? 'page' : undefined}
              title={s.nota}
              className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                seccion === s.id
                  ? 'bg-white/[0.07] text-white/90'
                  : s.activa
                    ? 'text-white/60 hover:bg-white/[0.04] hover:text-white/85'
                    : 'cursor-not-allowed text-white/25'
              }`}
            >
              <span className="flex items-center gap-2">
                {s.label}
                {/*
                  La campana sólo existe cuando hay algo que hacer, y lleva el
                  número dentro. Un icono sin cifra obliga a entrar para saber
                  si merece la pena; con la cifra, decides desde fuera.
                */}
                {s.id === 'categorias' && pendientes > 0 ? (
                  <span
                    className="flex items-center gap-1 rounded-full bg-[#BF8228]/20 px-1.5 py-0.5 text-[0.62rem] tabular-nums text-[#E0A54A]"
                    title={`${pendientes} sin categorizar`}
                  >
                    <svg width="9" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2a6 6 0 0 0-6 6v3.6L4.3 15.2A1 1 0 0 0 5.2 16.7h13.6a1 1 0 0 0 .9-1.5L18 11.6V8a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0z" />
                    </svg>
                    {pendientes}
                    <span className="sr-only"> sin categorizar</span>
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
