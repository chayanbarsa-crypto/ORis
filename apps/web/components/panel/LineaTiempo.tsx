'use client';

/**
 * La línea de tiempo: lo acumulado mes a mes, y hacia dónde va.
 *
 * Lo que se dibuja es **variación acumulada**, no saldo. De los movimientos
 * sale cuánto ha entrado y salido, pero no con cuánto empezaste — eso lo
 * declara el extracto y muchos no lo declaran. Trazar «saldo» partiendo de cero
 * sería afirmar que empezaste sin nada, y a partir de ahí todo lo que se lea en
 * el gráfico es falso.
 *
 * La proyección va discontinua y en otro tono porque **no es un dato**: es la
 * media de los últimos meses prolongada. Vale para «si nada cambia, ¿hacia
 * dónde voy?», que es una pregunta legítima, y no vale para nada más. Pintarla
 * igual que lo real sería la mentira más fácil de este panel.
 *
 * Un solo eje. Ninguna cifra sobre cada punto: sólo los extremos y lo que toca
 * el ratón; un número encima de cada mes convierte el gráfico en una tabla mal
 * maquetada.
 */

import { useMemo, useRef, useState } from 'react';

import { formatear } from '@/lib/oris/dinero';
import { proyectar, serieMensual, type PuntoMes } from '@/lib/oris/series';
import type { MovimientoVista } from '@/lib/oris/agregados';
import { BARRA } from '@/lib/oris/paleta';

/** El tono de la proyección. Ámbar, ya validado contra el azul de las barras. */
const PROYECTADO = 'var(--pendiente)';

const ALTO = 190;
const MARGEN = { arriba: 16, abajo: 30, izquierda: 54, derecha: 14 };

export interface LineaTiempoProps {
  movimientos: readonly MovimientoVista[];
  /** Cuántos meses proyectar hacia delante. Cero los oculta. */
  mesesProyectados?: number;
}

interface Punto {
  mes: string;
  valor: number;
  x: number;
  y: number;
  real: boolean;
  neto: number | null;
}

export function LineaTiempo({ movimientos, mesesProyectados = 4 }: LineaTiempoProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const serie = useMemo(() => serieMensual(movimientos), [movimientos]);
  const proyeccion = useMemo(
    () => (mesesProyectados > 0 ? proyectar(serie, mesesProyectados) : null),
    [serie, mesesProyectados],
  );

  const ancho = 640;
  const puntos = useMemo<Punto[]>(() => {
    if (serie.length === 0) return [];

    const todos: { mes: string; valor: number; real: boolean; neto: number | null }[] = [
      ...serie.map((p: PuntoMes) => ({ mes: p.mes, valor: p.acumulado, real: true, neto: p.neto })),
      ...(proyeccion?.puntos ?? []).map((p) => ({
        mes: p.mes,
        valor: p.acumulado,
        real: false,
        neto: proyeccion?.ritmo ?? null,
      })),
    ];

    const valores = todos.map((p) => p.valor);
    // El cero entra siempre en la escala: sin él, una serie toda negativa se
    // dibuja subiendo y parece que las cosas mejoran.
    const max = Math.max(0, ...valores);
    const min = Math.min(0, ...valores);
    const rango = max - min || 1;

    const util = {
      ancho: ancho - MARGEN.izquierda - MARGEN.derecha,
      alto: ALTO - MARGEN.arriba - MARGEN.abajo,
    };

    return todos.map((p, i) => ({
      ...p,
      x: MARGEN.izquierda + (todos.length === 1 ? util.ancho / 2 : (i / (todos.length - 1)) * util.ancho),
      y: MARGEN.arriba + (1 - (p.valor - min) / rango) * util.alto,
    }));
  }, [serie, proyeccion]);

  if (serie.length === 0) {
    return (
      <div className="rounded-xl border border-borde bg-superficie px-5 py-6">
        <p className="text-[0.82rem] text-tinta-4">
          Hará falta al menos un mes de movimientos para dibujar la línea.
        </p>
      </div>
    );
  }

  const reales = puntos.filter((p) => p.real);
  const ultimoReal = reales[reales.length - 1];
  const proyectados = puntos.filter((p) => !p.real);
  const cero = puntos.length > 0 ? yDeCero(puntos) : null;

  const camino = (ps: Punto[]) => ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const p = activo !== null ? puntos[activo] : null;

  return (
    <div className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
          Variación acumulada
        </h3>
        {/* El periodo lo escribe quien filtra (`Historico`), no el gráfico:
            aquí no se sabe si esto es todo el histórico o un recorte, y decir
            «desde el primer movimiento» cuando hay un filtro puesto sería
            falso. */}
        <p className="text-[0.74rem] text-tinta-4">{resumenPeriodo(serie)}</p>
      </div>

      <div ref={contenedor} className="relative">
        <svg
          viewBox={`0 0 ${ancho} ${ALTO}`}
          width="100%"
          height={ALTO}
          role="img"
          aria-label={descripcion(serie, proyeccion?.ritmo ?? null)}
          onMouseLeave={() => setActivo(null)}
        >
          {/* Cero: la referencia contra la que se lee todo lo demás. */}
          {cero !== null ? (
            <line
              x1={MARGEN.izquierda}
              y1={cero}
              x2={ancho - MARGEN.derecha}
              y2={cero}
              stroke="var(--eje)"
              strokeWidth="1"
            />
          ) : null}

          {proyectados.length > 0 && ultimoReal ? (
            <path
              d={camino([ultimoReal, ...proyectados])}
              fill="none"
              stroke={PROYECTADO}
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
          ) : null}

          <path
            d={camino(reales)}
            fill="none"
            stroke={BARRA}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Sólo el extremo lleva punto: marcarlos todos convierte la línea en
              un collar y esconde la forma, que es lo que hay que leer. */}
          {ultimoReal ? (
            <circle cx={ultimoReal.x} cy={ultimoReal.y} r="4.5" fill={BARRA} stroke="var(--globo)" strokeWidth="2" />
          ) : null}
          {p ? <circle cx={p.x} cy={p.y} r="4" fill={p.real ? BARRA : PROYECTADO} /> : null}

          {/* Etiquetas de los extremos y del cero. */}
          <g fontFamily="ui-monospace, monospace" fontSize="10" fill="var(--tinta-4)">
            {cero !== null ? <text x="4" y={cero + 3}>0 €</text> : null}
            <text x="4" y={puntos[0].y + 3}>{corto(puntos[0].valor)}</text>
            {ultimoReal ? <text x="4" y={ultimoReal.y + 3}>{corto(ultimoReal.valor)}</text> : null}
          </g>

          <g fontFamily="ui-monospace, monospace" fontSize="10" fill="var(--tinta-4)" textAnchor="middle">
            <text x={puntos[0].x} y={ALTO - 10}>{etiquetaMes(puntos[0].mes)}</text>
            {ultimoReal ? (
              <text x={ultimoReal.x} y={ALTO - 10}>{etiquetaMes(ultimoReal.mes)}</text>
            ) : null}
            {/* La última va anclada por la derecha: centrada en su punto, que
                está pegado al borde, se cortaba a media palabra. */}
            {proyectados.length > 0 ? (
              <text
                x={ancho - MARGEN.derecha}
                y={ALTO - 10}
                fill={PROYECTADO}
                textAnchor="end"
              >
                {etiquetaMes(puntos[puntos.length - 1].mes)}
              </text>
            ) : null}
          </g>

          {/* Zonas de contacto: más anchas que los puntos, que si no hay que
              acertar con el ratón en un círculo de cuatro píxeles. */}
          <g fill="transparent">
            {puntos.map((q, i) => (
              <rect
                key={q.mes}
                x={q.x - (ancho - MARGEN.izquierda - MARGEN.derecha) / (puntos.length * 2)}
                y={MARGEN.arriba - 10}
                width={(ancho - MARGEN.izquierda - MARGEN.derecha) / puntos.length}
                height={ALTO - MARGEN.abajo}
                onMouseEnter={() => setActivo(i)}
              />
            ))}
          </g>
        </svg>

        {p ? (
          <div
            className="pointer-events-none absolute rounded-lg border border-borde-3 bg-[var(--globo)] px-3 py-2 text-[0.74rem] leading-relaxed text-tinta-2"
            style={{
              left: `${(p.x / ancho) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -8px)',
            }}
          >
            <span className="text-tinta-4">{nombreLargo(p.mes)}</span>
            {p.real ? null : <span className="text-pendiente"> · proyectado</span>}
            <br />
            <span className="tabular-nums">{formatear(p.valor, { signo: true })}</span>
            {p.neto !== null ? (
              <span className="text-tinta-4">
                {' '}
                · {p.real ? 'este mes' : 'al mes'} {formatear(p.neto, { signo: true })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.74rem] text-tinta-4">
        <span className="flex items-center gap-2">
          <i className="h-[2px] w-4" style={{ background: BARRA }} /> Lo que ha pasado
        </span>
        {proyeccion ? (
          <span className="flex items-center gap-2">
            <i
              className="h-[2px] w-4"
              style={{ background: `repeating-linear-gradient(90deg, ${PROYECTADO} 0 4px, transparent 4px 7px)` }}
            />
            Si sigue el ritmo de los últimos {proyeccion.base} meses
          </span>
        ) : null}
      </div>

      {proyeccion ? (
        <p className="mt-2 text-[0.72rem] leading-relaxed text-tinta-5">
          La proyección prolonga una media: no sabe de pagas extra, ni de que
          enero es caro, ni de que has dejado un cliente. Contesta a «si nada
          cambia», y a nada más.
        </p>
      ) : null}
    </div>
  );
}

/** «6 meses, 92 movimientos». Describe lo que hay en el gráfico, sin afirmar de dónde sale. */
function resumenPeriodo(serie: readonly PuntoMes[]): string {
  const movs = serie.reduce((acc, p) => acc + p.movimientos, 0);
  const meses = serie.length;
  return `${meses} ${meses === 1 ? 'mes' : 'meses'} · ${movs} movimiento${movs === 1 ? '' : 's'}`;
}

function yDeCero(puntos: readonly Punto[]): number | null {
  // Se despeja de dos puntos conocidos: y es lineal en valor, así que con dos
  // pares (valor, y) sale la altura del cero sin recalcular la escala.
  const a = puntos[0];
  const b = puntos.find((q) => q.valor !== a.valor);
  if (!b) return a.y;
  const pendiente = (b.y - a.y) / (b.valor - a.valor);
  return a.y - a.valor * pendiente;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function etiquetaMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]} ${String(a).slice(2)}`;
}

function nombreLargo(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_LARGOS[m - 1]} de ${a}`;
}

/** Miles abreviados para el eje: «−1,2k». En el globo va la cifra entera. */
function corto(centimos: number): string {
  const euros = centimos / 100;
  // Con unidad siempre: en un eje donde el cero pone «0 €», un «653» a secas
  // parece otra magnitud distinta.
  if (Math.abs(euros) >= 1000) return `${(euros / 1000).toFixed(1).replace('.', ',')}k €`;
  return `${Math.round(euros)} €`;
}

function descripcion(serie: readonly PuntoMes[], ritmo: number | null): string {
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  const base =
    `Variación acumulada de ${nombreLargo(primero.mes)} a ${nombreLargo(ultimo.mes)}, ` +
    `de ${formatear(primero.acumulado, { signo: true })} a ${formatear(ultimo.acumulado, { signo: true })}.`;
  return ritmo === null
    ? base
    : `${base} La proyección continúa a ${formatear(ritmo, { signo: true })} al mes.`;
}
