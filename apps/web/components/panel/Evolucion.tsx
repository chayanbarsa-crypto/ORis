'use client';

/**
 * La línea de tiempo del negocio: mes a mes, lo que costó y lo que entró.
 *
 * Una sola pregunta, y por eso un solo gráfico: **¿cada mes pagó lo que cuesta
 * tener abierto?** La respuesta se lee de un vistazo porque la línea de
 * facturación pasa por encima o por debajo de la barra del gasto, y donde pasa
 * por debajo el mes se cerró en pérdidas. Sin cifras encima de cada punto: un
 * número por mes convierte el gráfico en una tabla mal maquetada.
 *
 * Tres decisiones de forma:
 *
 * **Barras para el gasto, línea para la facturación.** La identidad la lleva el
 * tipo de marca, no el color, que es un canal más fuerte y además sobrevive a
 * cualquier daltonismo. Así el gráfico no necesita un segundo tono para separar
 * dos cosas que son la misma medida —euros del mismo mes—, y se puede seguir
 * usando el azul único de `paleta.ts`.
 *
 * **El gasto va apilado, estructura abajo.** Abajo porque es el suelo: lo que
 * se paga pase lo que pase. Lo variable se apila encima porque es lo que se
 * mueve, y verlo arriba deja leer la parte fija como una línea de flotación
 * estable de un mes a otro.
 *
 * **Sin eje derecho.** Facturación y gasto son la misma unidad y comparten
 * escala. Dos ejes harían que la línea cortara la barra donde el diseñador
 * quisiera, y ese cruce es justamente lo único que hay que leer aquí.
 */

import { useMemo, useState } from 'react';

import { formatear, nombreMes } from '@/lib/oris/dinero';
import { BARRA, ESTRUCTURA_OPACIDAD, HUECO_BARRAS, VARIABLE_OPACIDAD } from '@/lib/oris/paleta';
import type { LecturaMes } from '@/lib/oris/pyme';

const ALTO = 210;
const MARGEN = { arriba: 14, abajo: 30, izquierda: 52, derecha: 12 };
const ANCHO = 640;
/** Por debajo de esto el gráfico se desplaza en vez de encogerse. Ver el envoltorio. */
const ANCHO_MINIMO = 620;

export interface EvolucionProps {
  serie: readonly LecturaMes[];
  /** Cuántos meses caben antes de recortar por la izquierda. */
  maximoMeses?: number;
}

export function Evolucion({ serie, maximoMeses = 18 }: EvolucionProps) {
  const [activo, setActivo] = useState<number | null>(null);

  // Se recorta por el final —los meses recientes— y no por el principio: con
  // veintiséis meses en 640 px cada barra se queda en dieciocho píxeles y la
  // forma deja de leerse. Cuántos se están viendo lo dice la cabecera.
  const visibles = useMemo(() => serie.slice(-maximoMeses), [serie, maximoMeses]);

  if (visibles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-borde-2 px-4 py-6 text-center text-[0.8rem] text-tinta-4">
        Hará falta al menos un mes de movimientos para dibujar la evolución.
      </p>
    );
  }

  const techo = Math.max(
    1,
    ...visibles.map((l) => Math.max(l.facturacion, l.estructura + l.variable)),
  );
  const util = {
    ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
    alto: ALTO - MARGEN.arriba - MARGEN.abajo,
  };
  const paso = util.ancho / visibles.length;
  const anchoBarra = Math.max(4, paso * 0.56);

  const y = (v: number) => MARGEN.arriba + (1 - v / techo) * util.alto;
  const centro = (i: number) => MARGEN.izquierda + paso * (i + 0.5);

  const linea = visibles
    .map((l, i) => `${i === 0 ? 'M' : 'L'}${centro(i)} ${y(l.facturacion)}`)
    .join(' ');

  const l = activo !== null ? visibles[activo] : null;
  const base = MARGEN.arriba + util.alto;

  return (
    <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
          Lo que entra y lo que cuesta
        </h3>
        <p className="text-[0.74rem] text-tinta-4">
          {visibles.length} {visibles.length === 1 ? 'mes' : 'meses'}
          {serie.length > visibles.length ? ` de ${serie.length}` : ''}
        </p>
      </div>

      {/*
        El gráfico se desplaza en horizontal antes que encogerse.

        Sin el ancho mínimo, en un móvil de 360 px el `viewBox` de 640 se
        reduce a la mitad y con él **el texto de los ejes**: «4,0k €» acaba
        dibujado a cinco píxeles, que no es un tamaño pequeño sino uno
        ilegible. Un gráfico que hay que arrastrar un poco se lee; uno que cabe
        entero y no se distingue, no.
      */}
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: ANCHO_MINIMO }}>
          {/*
            Sin atributo `height`. Con `width="100%"` y una altura fija, el
            `viewBox` se ajusta por el lado que sobra —`meet`— y el gráfico se
            queda a 640 px centrado dentro de una tarjeta de 940: dos dedos de
            margen vacío a cada lado y las barras encogidas en el medio. Dejando
            que la altura la marque la proporción, el dibujo llena el ancho que
            tenga y las etiquetas crecen con él.
          */}
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            className="block w-full"
            role="img"
            aria-label={descripcion(visibles)}
            onMouseLeave={() => setActivo(null)}
          >
            {/* Suelo del gráfico. El cero de una magnitud que nunca es negativa. */}
            <line
              x1={MARGEN.izquierda}
              y1={base}
              x2={ANCHO - MARGEN.derecha}
              y2={base}
              stroke="var(--eje)"
              strokeWidth="1"
            />

            {visibles.map((m, i) => {
              const altoEstructura = (m.estructura / techo) * util.alto;
              const altoVariable = (m.variable / techo) * util.alto;
              const x = centro(i) - anchoBarra / 2;
              // El hueco se descuenta del trozo de abajo para que la pila siga
              // midiendo el total: si se añadiera, la barra crecería dos píxeles
              // por cada corte y el gasto parecería mayor de lo que es.
              const estructuraPintada = Math.max(
                0,
                altoEstructura - (altoVariable > 0 ? HUECO_BARRAS : 0),
              );

              return (
                <g key={m.mes} opacity={activo === null || activo === i ? 1 : 0.45}>
                  {altoVariable > 0 ? (
                    <rect
                      x={x}
                      y={base - altoEstructura - altoVariable}
                      width={anchoBarra}
                      height={altoVariable}
                      rx="2"
                      fill={BARRA}
                      fillOpacity={VARIABLE_OPACIDAD}
                    />
                  ) : null}
                  {estructuraPintada > 0 ? (
                    <rect
                      x={x}
                      y={base - estructuraPintada}
                      width={anchoBarra}
                      height={estructuraPintada}
                      rx="2"
                      fill={BARRA}
                      fillOpacity={ESTRUCTURA_OPACIDAD}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* La facturación, por encima de las barras: donde cruza por debajo,
                el mes no se pagó a sí mismo. */}
            <path
              d={linea}
              fill="none"
              stroke="var(--tinta-2)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {visibles.map((m, i) => (
              <circle
                key={m.mes}
                cx={centro(i)}
                cy={y(m.facturacion)}
                r={activo === i ? 4.5 : 2.5}
                fill="var(--tinta-2)"
                stroke="var(--globo)"
                strokeWidth={activo === i ? 2 : 0}
              />
            ))}

            <g fontFamily="ui-monospace, monospace" fontSize="10" fill="var(--tinta-4)">
              <text x="4" y={MARGEN.arriba + 4}>
                {corto(techo)}
              </text>
              <text x="4" y={base + 3}>
                0 €
              </text>
            </g>
            <g
              fontFamily="ui-monospace, monospace"
              fontSize="10"
              fill="var(--tinta-4)"
              textAnchor="middle"
            >
              <text x={centro(0)} y={ALTO - 10}>
                {etiquetaMes(visibles[0].mes)}
              </text>
              {visibles.length > 1 ? (
                <text x={centro(visibles.length - 1)} y={ALTO - 10} textAnchor="end">
                  {etiquetaMes(visibles[visibles.length - 1].mes)}
                </text>
              ) : null}
            </g>

            {/* Zonas de contacto de una columna entera: acertar con el ratón en
                una barra de diez píxeles no es una interacción, es puntería. */}
            <g fill="transparent">
              {visibles.map((m, i) => (
                <rect
                  key={m.mes}
                  x={MARGEN.izquierda + paso * i}
                  y={MARGEN.arriba}
                  width={paso}
                  height={util.alto}
                  onMouseEnter={() => setActivo(i)}
                />
              ))}
            </g>
          </svg>

          {l ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[11rem] rounded-lg border border-borde-3 bg-[var(--globo)] px-3 py-2 text-[0.72rem] leading-relaxed text-tinta-2"
              style={{
                left: `${(centro(activo!) / ANCHO) * 100}%`,
                top: 0,
                transform: `translate(${activo! > visibles.length / 2 ? '-100%' : '-0%'}, -6px)`,
              }}
            >
              <p className="text-tinta-4">{nombreMes(l.mes)}</p>
              <dl className="mt-1 space-y-0.5">
                <Fila etiqueta="Facturación" valor={formatear(l.facturacion)} />
                <Fila etiqueta="Estructura" valor={formatear(l.estructura)} />
                <Fila etiqueta="Variable" valor={formatear(l.variable)} />
                <Fila etiqueta="Margen" valor={formatear(l.margen, { signo: true })} destacado />
              </dl>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] text-tinta-4">
        <span className="flex items-center gap-2">
          <i className="h-[2px] w-4 rounded-full" style={{ background: 'var(--tinta-2)' }} />
          Facturación
        </span>
        <span className="flex items-center gap-2">
          <i
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: BARRA, opacity: ESTRUCTURA_OPACIDAD }}
          />
          Estructura
        </span>
        <span className="flex items-center gap-2">
          <i
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: BARRA, opacity: VARIABLE_OPACIDAD }}
          />
          Variable
        </span>
      </div>
    </section>
  );
}

function Fila({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-tinta-4">{etiqueta}</dt>
      <dd className={`tabular-nums ${destacado ? 'text-tinta' : 'text-tinta-2'}`}>{valor}</dd>
    </div>
  );
}

const CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${CORTOS[m - 1]} ${String(a).slice(2)}`;
}

/** Miles abreviados para el eje. En el globo va la cifra entera. */
function corto(centimos: number): string {
  const euros = centimos / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toFixed(1).replace('.', ',')}k €`;
  return `${Math.round(euros)} €`;
}

/** Lo que un lector de pantalla necesita para no perderse el gráfico entero. */
function descripcion(serie: readonly LecturaMes[]): string {
  const enPerdidas = serie.filter((l) => l.margen < 0).length;
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  return (
    `Facturación y gasto de ${nombreMes(primero.mes)} a ${nombreMes(ultimo.mes)}. ` +
    `El último mes facturó ${formatear(ultimo.facturacion)} y gastó ${formatear(ultimo.gasto)}, ` +
    `de los que ${formatear(ultimo.estructura)} son estructura. ` +
    `${enPerdidas} de ${serie.length} meses cerraron en pérdidas.`
  );
}
