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
  /**
   * Abre el detalle. Cuando se pasa, la tarjeta deja de ser un texto y pasa a
   * ser un `<button>` de verdad: así responde al teclado, al lector de pantalla
   * y al `Enter` sin que haya que reimplementar nada de eso a mano.
   */
  onAbrir?: () => void;
  /** El detalle de esta cifra está abierto. */
  abierto?: boolean;
  /** `id` del panel que abre, para `aria-controls`. */
  controla?: string;
}

export function Kpi({
  etiqueta,
  valor,
  pie,
  conSigno,
  secundario,
  onAbrir,
  abierto,
  controla,
}: KpiProps) {
  const contenido = (
    <>
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
    </>
  );

  // `flex flex-col items-start` no es estética: un `<button>` centra su
  // contenido, y sin esto la etiqueta y la cifra se van al medio de la tarjeta
  // mientras las tarjetas no pulsables las dejan arriba. `overflow-hidden`
  // protege de un importe de siete cifras que se saldría del borde.
  const caja =
    'flex w-full flex-col items-start overflow-hidden rounded-xl border px-4 py-3.5 text-left transition-colors ' +
    (abierto
      ? 'border-white/[0.16] bg-white/[0.055]'
      : 'border-white/[0.07] bg-white/[0.025]');

  if (!onAbrir) return <div className={caja}>{contenido}</div>;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-expanded={abierto ?? false}
      aria-controls={controla}
      className={`${caja} hover:border-white/[0.14] hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/45`}
    >
      {contenido}
      {/* Que algo se puede abrir hay que decirlo, no dejarlo al hover: en una
          pantalla táctil no hay hover que descubra nada. */}
      <span className="mt-1.5 block text-[0.62rem] uppercase tracking-[0.16em] text-white/25">
        {abierto ? 'Cerrar detalle' : 'Ver detalle'}
      </span>
    </button>
  );
}
