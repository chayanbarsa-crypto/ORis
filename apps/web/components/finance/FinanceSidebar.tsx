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
  { id: 'extractos', label: 'Extractos', activa: false, nota: 'Subida de PDF — pendiente' },
  { id: 'categorias', label: 'Categorías', activa: false, nota: 'Editor de reglas — pendiente' },
  { id: 'copiloto', label: 'Copiloto', activa: false, nota: 'Necesita backend de IA' },
];

export interface FinanceSidebarProps {
  seccion: string;
  onSeccion: (id: string) => void;
}

export function FinanceSidebar({ seccion, onSeccion }: FinanceSidebarProps) {
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
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
