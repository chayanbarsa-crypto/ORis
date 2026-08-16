'use client';

/**
 * Navegacion financiera. Fase 1: solo la estructura.
 *
 * Las secciones se declaran como datos y no como JSX repetido, para que la
 * Fase 5 pueda anadir modulos sin tocar el render.
 */

export interface FinanceSection {
  id: string;
  label: string;
  /** Se activa en la fase indicada. */
  phase: number;
}

export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  { id: 'dashboard', label: 'Dashboard', phase: 2 },
  { id: 'portfolio', label: 'Portfolio', phase: 5 },
  { id: 'documents', label: 'Documents', phase: 5 },
  { id: 'alerts', label: 'Alerts', phase: 4 },
];

export function FinanceSidebar() {
  return (
    <nav
      className="shrink-0 border-b border-white/[0.07] px-5 py-4 md:w-56 md:border-b-0 md:border-r md:py-6"
      aria-label="Secciones financieras"
    >
      <p className="mb-3 text-[0.58rem] uppercase tracking-[0.26em] text-white/30">Finanzas</p>
      <ul className="flex gap-2 md:flex-col md:gap-1">
        {FINANCE_SECTIONS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/35 transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
