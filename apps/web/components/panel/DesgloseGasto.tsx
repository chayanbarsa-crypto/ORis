'use client';

/**
 * Desglose del gasto por categoría: barras horizontales ordenadas.
 *
 * Barras y no tarta porque comparar longitudes desde una línea base común es lo
 * que mejor hace el ojo; comparar ángulos, lo que peor. Horizontales porque las
 * etiquetas son palabras («Alimentación», «Restauración») y en vertical habría
 * que girarlas o recortarlas.
 *
 * Una sola serie: todas las barras del mismo tono. La identidad la lleva la
 * etiqueta, no el color — ver `lib/oris/paleta.ts`. La única excepción es
 * «Sin categorizar», que no es una categoría sino un estado, y va en ámbar
 * **con su etiqueta**, nunca fiando el significado sólo al color.
 */

import { useState } from 'react';

import { formatear, type Centimos } from '@/lib/oris/dinero';
import { BARRA, HUECO_BARRAS, PENDIENTE } from '@/lib/oris/paleta';
import { SIN_CATEGORIZAR, type LineaCategoria } from '@/lib/oris/agregados';

export interface DesgloseGastoProps {
  lineas: readonly LineaCategoria[];
  total: Centimos;
}

export function DesgloseGasto({ lineas, total }: DesgloseGastoProps) {
  const [activa, setActiva] = useState<string | null>(null);

  if (lineas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/35">
        No hay gasto registrado en este periodo.
      </p>
    );
  }

  const mayor = lineas[0].total || 1;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/40">
          Gasto por categoría
        </h3>
        <span className="tabular-nums text-sm font-light text-white/70">{formatear(total)}</span>
      </div>

      <ul className="space-y-[6px]" style={{ paddingBottom: HUECO_BARRAS }}>
        {lineas.map((l) => {
          const pendiente = l.categoria === SIN_CATEGORIZAR;
          const color = pendiente ? PENDIENTE : BARRA;
          // Escalada contra la mayor y no contra el total: con ocho categorías
          // la mayor ocuparía un tercio del ancho y las pequeñas serían rayas.
          const ancho = Math.max(2, (l.total / mayor) * 100);
          const resaltada = activa === l.categoria;

          return (
            <li
              key={l.categoria}
              onMouseEnter={() => setActiva(l.categoria)}
              onMouseLeave={() => setActiva(null)}
              onFocus={() => setActiva(l.categoria)}
              onBlur={() => setActiva(null)}
              tabIndex={0}
              className="group relative rounded-md px-1 py-1 outline-none transition-colors focus-visible:bg-white/[0.04] hover:bg-white/[0.03]"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-white/75">
                  {l.categoria}
                  {pendiente ? (
                    <span className="ml-1.5 text-[0.62rem] uppercase tracking-wider text-white/40">
                      · pendiente
                    </span>
                  ) : null}
                  {l.porIA > 0 ? (
                    <span
                      className="ml-1.5 text-[0.62rem] text-white/35"
                      title={`${l.porIA} categorizado(s) por el modelo — conviene revisarlos`}
                    >
                      ({l.porIA} por IA)
                    </span>
                  ) : null}
                </span>
                {/* Etiqueta directa: el valor va siempre, sin depender del hover. */}
                <span className="shrink-0 tabular-nums text-white/60">{formatear(l.total)}</span>
              </div>

              <div
                className="h-[7px] w-full overflow-hidden rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                role="img"
                aria-label={`${l.categoria}: ${formatear(l.total)}, ${Math.round(
                  l.proporcion * 100,
                )} % del gasto, ${l.movimientos} movimientos`}
              >
                <div
                  className="h-full rounded-full transition-[width,opacity] duration-500 ease-out"
                  style={{
                    width: `${ancho}%`,
                    background: color,
                    opacity: resaltada ? 1 : 0.82,
                  }}
                />
              </div>

              {resaltada ? (
                <p className="mt-1 text-[0.68rem] tabular-nums text-white/45">
                  {Math.round(l.proporcion * 100)} % del gasto · {l.movimientos} movimiento
                  {l.movimientos === 1 ? '' : 's'}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
