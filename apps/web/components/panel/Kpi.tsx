'use client';

/**
 * Una cifra del resumen del mes.
 *
 * Es una *stat tile*, no un gráfico: un número solo no gana nada dibujado. La
 * jerarquía la marca el tamaño —el número manda, la etiqueta acompaña— y el
 * pie lleva el contexto que evita malinterpretarlo.
 */

import { formatear, type Centimos } from '@/lib/oris/dinero';

export interface KpiProps {
  etiqueta: string;
  valor: Centimos;
  /** Contexto bajo la cifra. Es donde se avisa de lo que no se está contando. */
  pie?: string;
  /** Muestra «+» en los positivos. Para netos, donde el signo es la información. */
  conSigno?: boolean;
  /** Atenúa la cifra: para lo informativo que no forma parte del balance. */
  secundario?: boolean;
}

export function Kpi({ etiqueta, valor, pie, conSigno, secundario }: KpiProps) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/40">{etiqueta}</p>
      {/* `whitespace-nowrap` y el escalón de tamaño no son cosmética: sin ellos
          «+1.413,70 €» parte en dos líneas en móvil y el símbolo de euro se
          queda solo debajo de la cifra. */}
      <p
        className={`mt-1.5 whitespace-nowrap tabular-nums ${
          secundario
            ? 'text-base font-light text-white/55 sm:text-lg'
            : 'text-xl font-light text-white/90 sm:text-2xl'
        }`}
      >
        {formatear(valor, { signo: conSigno })}
      </p>
      {pie ? <p className="mt-1 text-[0.68rem] leading-snug text-white/35">{pie}</p> : null}
    </div>
  );
}
