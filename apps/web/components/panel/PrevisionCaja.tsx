'use client';

/**
 * La previsión de tesorería: hasta dónde llega el dinero.
 *
 * El gráfico junta dos cosas que **no son la misma clase de cosa**, y todo el
 * diseño consiste en que no se confundan:
 *
 *   - a la izquierda, el saldo real que declara el extracto: línea continua,
 *     azul, la del resto del panel;
 *   - a la derecha, la previsión: **una banda ámbar**, no una línea. Una línea
 *     de previsión se lee como un dato aunque vaya de puntos; una banda se lee
 *     como lo que es, un rango. Dentro va el escenario esperado, discontinuo.
 *
 * Y una cifra que sólo tiene sentido si el resto está bien hecho: **el mes en
 * que la caja se queda en rojo**. Va arriba, con letra grande y con la
 * condición delante —«si todos los meses fueran malos»—, porque es un aviso y
 * un aviso sin su condición es una profecía.
 *
 * Debajo, la tabla. El gráfico contesta «¿llego?»; la tabla contesta «¿por qué
 * ese mes?», y para eso hacen falta las cifras exactas y qué recibos vencen. Un
 * aviso que no se puede auditar no se puede creer.
 */

import { useState } from 'react';

import { formatear, nombreMes, type Centimos } from '@/lib/oris/dinero';
import { BANDA_OPACIDAD, BARRA, PENDIENTE } from '@/lib/oris/paleta';
import type { Prevision } from '@/lib/oris/prevision';
import type { LecturaMes } from '@/lib/oris/pyme';

const ALTO = 210;
const MARGEN = { arriba: 18, abajo: 30, izquierda: 56, derecha: 14 };
const ANCHO = 640;
/** Por debajo de esto el gráfico se desplaza en vez de encogerse. Ver el envoltorio. */
const ANCHO_MINIMO = 620;
/** Cuántos meses reales se enseñan antes de la previsión, para dar contexto. */
const CONTEXTO = 6;

export interface PrevisionCajaProps {
  prevision: Prevision;
  serie: readonly LecturaMes[];
}

interface Punto {
  mes: string;
  x: number;
  real: number | null;
  prudente: number | null;
  esperado: number | null;
  bueno: number | null;
}

export function PrevisionCaja({ prevision, serie }: PrevisionCajaProps) {
  const [activo, setActivo] = useState<number | null>(null);

  if (prevision.saldoInicial === null) {
    return <SinSaldo prevision={prevision} />;
  }

  const reales = serie.slice(-CONTEXTO).filter((l) => l.saldo !== null);
  const puntos: Punto[] = [
    ...reales.map((l) => ({
      mes: l.mes,
      x: 0,
      real: l.saldo,
      prudente: null,
      esperado: null,
      bueno: null,
    })),
    ...prevision.meses.map((m) => ({
      mes: m.mes,
      x: 0,
      real: null,
      prudente: m.saldo?.prudente ?? null,
      esperado: m.saldo?.esperado ?? null,
      bueno: m.saldo?.bueno ?? null,
    })),
  ];

  const util = {
    ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
    alto: ALTO - MARGEN.arriba - MARGEN.abajo,
  };
  puntos.forEach((p, i) => {
    p.x =
      MARGEN.izquierda +
      (puntos.length === 1 ? util.ancho / 2 : (i / (puntos.length - 1)) * util.ancho);
  });

  const valores = puntos.flatMap((p) =>
    [p.real, p.prudente, p.esperado, p.bueno].filter((v): v is number => v !== null),
  );
  // El cero entra siempre en la escala. Sin él, una previsión que se hunde a
  // −2.000 € se dibujaría subiendo desde su propio mínimo y parecería una
  // recuperación.
  const max = Math.max(0, ...valores);
  const min = Math.min(0, ...valores);
  const rango = max - min || 1;
  const y = (v: number) => MARGEN.arriba + (1 - (v - min) / rango) * util.alto;

  const conReal = puntos.filter((p) => p.real !== null);
  const ultimoReal = conReal[conReal.length - 1];
  // La banda arranca en el último saldo real: si empezara en el primer mes
  // previsto quedaría un hueco entre lo conocido y lo estimado, y ese hueco se
  // lee como un salto que nadie ha calculado.
  const conBanda = ultimoReal
    ? [
        {
          ...ultimoReal,
          prudente: ultimoReal.real,
          esperado: ultimoReal.real,
          bueno: ultimoReal.real,
        },
        ...prevision.meses.map((m, i) => puntos[conReal.length + i]),
      ]
    : puntos.filter((p) => p.esperado !== null);

  const camino = (ps: readonly Punto[], campo: 'real' | 'prudente' | 'esperado' | 'bueno') =>
    ps
      .filter((p) => p[campo] !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${y(p[campo] as number)}`)
      .join(' ');

  const banda =
    conBanda.length > 1
      ? `${camino(conBanda, 'bueno')} ` +
        [...conBanda]
          .reverse()
          .filter((p) => p.prudente !== null)
          .map((p) => `L${p.x} ${y(p.prudente as number)}`)
          .join(' ') +
        ' Z'
      : '';

  const p = activo !== null ? puntos[activo] : null;
  const enRojo = prevision.mesEnRojo
    ? puntos.find((q) => q.mes === prevision.mesEnRojo)
    : undefined;

  return (
    <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
          Previsión de tesorería
        </h3>
        <p className="text-[0.74rem] text-tinta-4">
          {prevision.meses.length} meses desde {nombreMes(prevision.ancla)}
        </p>
      </div>

      <Aviso prevision={prevision} />

      {/*
        El gráfico se desplaza en horizontal antes que encogerse.

        Sin el ancho mínimo, en un móvil de 360 px el `viewBox` de 640 se
        reduce a la mitad y con él **el texto de los ejes**: «4,0k €» acaba
        dibujado a cinco píxeles, que no es un tamaño pequeño sino uno
        ilegible. Un gráfico que hay que arrastrar un poco se lee; uno que cabe
        entero y no se distingue, no.
      */}
      <div className="mt-3 overflow-x-auto">
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
            aria-label={descripcion(prevision)}
            onMouseLeave={() => setActivo(null)}
          >
            {banda ? <path d={banda} fill={PENDIENTE} fillOpacity={BANDA_OPACIDAD} /> : null}

            {/* El cero, por encima de la banda y por debajo de las líneas: es la
                referencia que dice si la caja aguanta. */}
            <line
              x1={MARGEN.izquierda}
              y1={y(0)}
              x2={ANCHO - MARGEN.derecha}
              y2={y(0)}
              stroke="var(--eje)"
              strokeWidth="1"
            />

            <path
              d={camino(conBanda, 'esperado')}
              fill="none"
              stroke={PENDIENTE}
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <path
              d={camino(conReal, 'real')}
              fill="none"
              stroke={BARRA}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {ultimoReal ? (
              <circle
                cx={ultimoReal.x}
                cy={y(ultimoReal.real as number)}
                r="4.5"
                fill={BARRA}
                stroke="var(--globo)"
                strokeWidth="2"
              />
            ) : null}

            {/* El mes en rojo lleva marca propia. El cruce con el cero se ve, pero
                se ve *si se busca*, y esta es la única cosa del gráfico que hay
                que ver sin buscarla. */}
            {enRojo && enRojo.prudente !== null ? (
              <g>
                <line
                  x1={enRojo.x}
                  y1={MARGEN.arriba}
                  x2={enRojo.x}
                  y2={MARGEN.arriba + util.alto}
                  stroke="var(--mal)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <circle
                  cx={enRojo.x}
                  cy={y(enRojo.prudente)}
                  r="4"
                  fill="var(--mal)"
                  stroke="var(--globo)"
                  strokeWidth="2"
                />
              </g>
            ) : null}

            {p ? (
              <circle
                cx={p.x}
                cy={y((p.real ?? p.esperado) as number)}
                r="4"
                fill={p.real !== null ? BARRA : PENDIENTE}
              />
            ) : null}

            <g fontFamily="ui-monospace, monospace" fontSize="10" fill="var(--tinta-4)">
              <text x="4" y={y(max) + 3}>
                {corto(max)}
              </text>
              <text x="4" y={y(0) + 3}>
                0 €
              </text>
              {min < 0 ? (
                <text x="4" y={y(min) + 3}>
                  {corto(min)}
                </text>
              ) : null}
            </g>
            <g
              fontFamily="ui-monospace, monospace"
              fontSize="10"
              fill="var(--tinta-4)"
              textAnchor="middle"
            >
              <text x={puntos[0].x} y={ALTO - 10}>
                {etiquetaMes(puntos[0].mes)}
              </text>
              {ultimoReal ? (
                <text x={ultimoReal.x} y={ALTO - 10}>
                  hoy
                </text>
              ) : null}
              <text x={ANCHO - MARGEN.derecha} y={ALTO - 10} fill={PENDIENTE} textAnchor="end">
                {etiquetaMes(puntos[puntos.length - 1].mes)}
              </text>
            </g>

            <g fill="transparent">
              {puntos.map((q, i) => (
                <rect
                  key={q.mes}
                  x={q.x - util.ancho / (puntos.length * 2)}
                  y={MARGEN.arriba}
                  width={util.ancho / puntos.length}
                  height={util.alto}
                  onMouseEnter={() => setActivo(i)}
                />
              ))}
            </g>
          </svg>

          {p ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[11rem] rounded-lg border border-borde-3 bg-[var(--globo)] px-3 py-2 text-[0.72rem] leading-relaxed text-tinta-2"
              style={{
                left: `${(p.x / ANCHO) * 100}%`,
                top: 0,
                transform: `translate(${activo! > puntos.length / 2 ? '-100%' : '0%'}, -6px)`,
              }}
            >
              <p className="text-tinta-4">
                {nombreMes(p.mes)}
                {p.real === null ? <span className="text-pendiente"> · previsto</span> : null}
              </p>
              {p.real !== null ? (
                <p className="mt-1 tabular-nums">{formatear(p.real)}</p>
              ) : (
                <dl className="mt-1 space-y-0.5">
                  <Fila etiqueta="Si va bien" valor={formatear(p.bueno ?? 0, { signo: true })} />
                  <Fila
                    etiqueta="Esperado"
                    valor={formatear(p.esperado ?? 0, { signo: true })}
                    destacado
                  />
                  <Fila etiqueta="Mes malo" valor={formatear(p.prudente ?? 0, { signo: true })} />
                </dl>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] text-tinta-4">
        <span className="flex items-center gap-2">
          <i className="h-[2px] w-4 rounded-full" style={{ background: BARRA }} /> Saldo real
        </span>
        <span className="flex items-center gap-2">
          <i
            className="h-[2px] w-4"
            style={{
              background: `repeating-linear-gradient(90deg, ${PENDIENTE} 0 4px, transparent 4px 7px)`,
            }}
          />
          Esperado
        </span>
        <span className="flex items-center gap-2">
          <i
            className="h-2.5 w-4 rounded-[2px]"
            style={{ background: PENDIENTE, opacity: BANDA_OPACIDAD * 3 }}
          />
          Entre un mes malo y uno bueno
        </span>
      </div>

      <Tabla prevision={prevision} />
      <Procedencia base={prevision.base} />
    </section>
  );
}

/** El titular: si hay mes en rojo, es lo primero que se lee. */
function Aviso({ prevision }: { prevision: Prevision }) {
  const ultimo = prevision.meses[prevision.meses.length - 1];

  if (prevision.mesEnRojoEsperado) {
    return (
      <p className="rounded-lg border border-[var(--aviso-borde)] bg-[var(--aviso-fondo)] px-3.5 py-2.5 text-[0.78rem] leading-relaxed text-tinta-2">
        Al ritmo normal, la caja se queda en números rojos en{' '}
        <strong className="font-normal text-tinta">{nombreMes(prevision.mesEnRojoEsperado)}</strong>
        . No hace falta que vaya mal: sale con lo que sueles facturar y lo que ya está firmado.
      </p>
    );
  }

  if (prevision.mesEnRojo) {
    return (
      <p className="rounded-lg border border-[var(--aviso-borde)] bg-[var(--aviso-fondo)] px-3.5 py-2.5 text-[0.78rem] leading-relaxed text-tinta-2">
        Si encadenas meses malos, la caja se queda en rojo en{' '}
        <strong className="font-normal text-tinta">{nombreMes(prevision.mesEnRojo)}</strong>. En el
        escenario normal aguanta hasta el final de la previsión.
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-[var(--bien-borde)] bg-[var(--bien-fondo)] px-3.5 py-2.5 text-[0.78rem] leading-relaxed text-tinta-2">
      La caja aguanta los {prevision.meses.length} meses en los tres escenarios. El peor cierre
      previsto es{' '}
      <strong className="font-normal text-tinta">
        {formatear(peorCierre(prevision), { signo: true })}
      </strong>
      {ultimo ? ` en ${nombreMes(ultimo.mes)}` : ''}.
    </p>
  );
}

function peorCierre(prevision: Prevision): Centimos {
  return Math.min(...prevision.meses.map((m) => m.saldo?.prudente ?? 0));
}

/** Mes a mes, con las cifras exactas y cuántos recibos vencen. */
function Tabla({ prevision }: { prevision: Prevision }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[0.74rem]">
        <caption className="sr-only">
          Previsión mes a mes: entradas esperadas, salidas comprometidas y saldo al cierre.
        </caption>
        <thead>
          <tr className="text-left text-[0.6rem] uppercase tracking-[0.14em] text-tinta-5">
            <th scope="col" className="pb-1.5 font-normal">
              Mes
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Entra
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Comprometido
            </th>
            {/* En móvil se cae la columna del gasto variable, que es la única
                estimación plana de la tabla —la misma cifra en los seis meses—
                y por tanto la que menos se pierde. Si se quedara, la que se
                saldría de la pantalla sería «cierra con», que es la respuesta. */}
            <th scope="col" className="hidden pb-1.5 text-right font-normal sm:table-cell">
              Variable
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Cierra con
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {prevision.meses.map((m) => {
            const rojo = (m.saldo?.esperado ?? 0) < 0;
            return (
              <tr key={m.mes} className="border-t border-borde">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-tinta-3">
                  {nombreMes(m.mes)}
                  {m.factor !== null && Math.abs(m.factor - 1) >= 0.15 ? (
                    <span className="ml-1.5 text-[0.62rem] text-tinta-5">
                      {m.factor < 1 ? 'mes flojo' : 'mes fuerte'}
                    </span>
                  ) : null}
                </th>
                <td className="py-1.5 text-right text-tinta-3">{formatear(m.ingreso.esperado)}</td>
                <td className="py-1.5 text-right text-tinta-3">
                  {formatear(m.comprometido)}
                  <span className="ml-1 text-[0.62rem] text-tinta-5">
                    ({m.vencimientos.length})
                  </span>
                </td>
                <td className="hidden py-1.5 text-right text-tinta-4 sm:table-cell">
                  {formatear(m.variable.esperado)}
                </td>
                <td className={`py-1.5 text-right ${rojo ? 'text-[var(--mal)]' : 'text-tinta-2'}`}>
                  {formatear(m.saldo?.esperado ?? 0, { signo: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** De qué está hecha la previsión. Sin esto no se puede juzgar lo que dice. */
function Procedencia({ base }: { base: Prevision['base'] }) {
  return (
    <p className="mt-3 text-[0.7rem] leading-relaxed text-tinta-5">
      Construida con {base.usados} {base.usados === 1 ? 'mes' : 'meses'} de los {base.historia}{' '}
      cargados y {base.compromisos} {base.compromisos === 1 ? 'compromiso' : 'compromisos'}{' '}
      vigentes, que explican el {Math.round(base.gastoExplicado * 100)} % del gasto histórico
      {base.estacional
        ? '. Corregida por estación: hay dos ciclos completos para medir cuánto pesa cada mes del año'
        : '. Sin corregir por estación: hacen falta dos años de histórico y todavía no los hay'}
      . No sabe de subidas de precio, de una empleada que se va ni de que el casero suba el alquiler
      en enero — nada de eso está en el extracto.
    </p>
  );
}

/**
 * Sin saldo declarado no hay previsión de tesorería, y se dice.
 *
 * De los movimientos sale cuánto entra y sale, nunca cuánto hay. Dibujar la
 * caja partiendo de cero afirmaría que la cuenta está vacía, y todo lo que se
 * leyera después sería falso — incluida la fecha del mes en rojo, que es
 * justamente la cifra por la que alguien abre esta pantalla.
 */
function SinSaldo({ prevision }: { prevision: Prevision }) {
  return (
    <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
        Previsión de tesorería
      </h3>
      <p className="mt-3 text-[0.82rem] leading-relaxed text-tinta-3">
        Ningún extracto cargado declara el saldo, así que no se puede decir cuánto quedará en la
        cuenta: de los movimientos sale lo que entra y lo que sale, no con cuánto se parte.
      </p>
      <p className="mt-2 text-[0.78rem] leading-relaxed text-tinta-4">
        Lo que sí se puede prever es el movimiento del mes. Con lo firmado y lo que sueles facturar,{' '}
        {nombreMes(prevision.meses[0]?.mes ?? prevision.ancla)} debería dejar{' '}
        <strong className="font-normal text-tinta-2">
          {formatear(
            (prevision.meses[0]?.ingreso.esperado ?? 0) - (prevision.meses[0]?.gasto.esperado ?? 0),
            { signo: true },
          )}
        </strong>
        .
      </p>
      <Tabla prevision={prevision} />
      <Procedencia base={prevision.base} />
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

function corto(centimos: number): string {
  const euros = centimos / 100;
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toFixed(1).replace('.', ',')}k €`;
  return `${Math.round(euros)} €`;
}

function descripcion(prevision: Prevision): string {
  const ultimo = prevision.meses[prevision.meses.length - 1];
  const base =
    `Previsión de saldo para ${prevision.meses.length} meses desde ${nombreMes(prevision.ancla)}, ` +
    `partiendo de ${formatear(prevision.saldoInicial ?? 0)}. ` +
    `En ${nombreMes(ultimo.mes)} el saldo esperado es ${formatear(ultimo.saldo?.esperado ?? 0, {
      signo: true,
    })}, entre ${formatear(ultimo.saldo?.prudente ?? 0, { signo: true })} y ` +
    `${formatear(ultimo.saldo?.bueno ?? 0, { signo: true })}.`;
  return prevision.mesEnRojo
    ? `${base} En el escenario de meses malos la caja entra en negativo en ${nombreMes(
        prevision.mesEnRojo,
      )}.`
    : base;
}
