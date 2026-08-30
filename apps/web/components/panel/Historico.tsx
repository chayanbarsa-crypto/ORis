'use client';

/**
 * El histórico: la línea de tiempo con sus filtros.
 *
 * Separado del gráfico a propósito. `LineaTiempo` dibuja lo que le den y no
 * sabe de filtros; aquí se decide **qué** se le da. Así el gráfico se puede
 * reutilizar en otra sección sin arrastrar un desplegable, y el filtro se puede
 * probar sin montar un SVG.
 *
 * Dos filtros, y los dos existen por el mismo motivo: con varios meses y varias
 * cuentas, «cuánto llevo» deja de tener una sola respuesta.
 *
 *   - **Tiempo.** Ancla en el último movimiento cargado, no en el reloj. Ver
 *     la cabecera de `lib/oris/rango.ts`: si los datos acaban en mayo y hoy es
 *     agosto, contar desde hoy dibuja tres meses de ruina que no existen.
 *
 *   - **Banco.** Dos bancos son dos cajas. Sumarlas está bien para saber
 *     cuánto entra en total, y está mal para saber si una de ellas se está
 *     vaciando. Se puede mirar cada una por separado.
 *
 * Y cuando un extracto no dice de qué banco es, se pregunta aquí mismo en vez
 * de etiquetarlo a ojo.
 */

import { useMemo, useState } from 'react';

import type { MovimientoVista } from '@/lib/oris/agregados';
import type { ExtractoVista } from '@/lib/oris/cargar';
import {
  aplicar,
  bancosDe,
  periodoDe,
  rangosDisponibles,
  sinBanco,
  type ClaveRango,
} from '@/lib/oris/rango';
import { LineaTiempo } from './LineaTiempo';
import { PedirBanco } from './PedirBanco';

export interface HistoricoProps {
  movimientos: readonly MovimientoVista[];
  extractos?: readonly ExtractoVista[];
}

/** Valor del desplegable cuando no se filtra por banco. */
const TODOS = '__todos__';

export function Historico({ movimientos, extractos = [] }: HistoricoProps) {
  const rangos = useMemo(() => rangosDisponibles(movimientos), [movimientos]);
  // Por defecto, el más corto que recorte algo: es lo que suele importar. Con
  // pocos datos `rangosDisponibles` sólo devuelve «todo», y entonces eso es.
  const [clave, setClave] = useState<ClaveRango | null>(null);
  const [banco, setBanco] = useState<string>(TODOS);

  const rango = rangos.find((r) => r.clave === clave) ?? rangos[0] ?? null;

  // Los bancos se sacan de lo que hay DENTRO del periodo, no de todo lo
  // cargado: si el histórico se recorta a los últimos tres meses y el BBVA
  // sólo tiene movimientos del año pasado, ofrecerlo lleva a filtrar por él y
  // encontrarse un gráfico vacío sin entender por qué.
  const enRango = useMemo(() => aplicar(movimientos, rango), [movimientos, rango]);
  const bancos = useMemo(() => bancosDe(enRango), [enRango]);

  const visibles = useMemo(
    () =>
      banco === TODOS || !bancos.includes(banco)
        ? enRango
        : enRango.filter((m) => m.banco === banco),
    [enRango, banco, bancos],
  );

  // Si al acortar el periodo desaparece el banco elegido, se vuelve a todos:
  // dejar seleccionado un banco que ya no está deja la pantalla en blanco sin
  // que nada explique por qué.
  const bancoActivo = banco !== TODOS && bancos.includes(banco) ? banco : TODOS;
  const periodo = periodoDe(visibles);
  const pendientes = useMemo(
    () => extractos.filter((e) => !e.banco && e.movimientos > 0),
    [extractos],
  );
  const huerfanos = useMemo(() => sinBanco(enRango), [enRango]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="mr-auto text-[0.6rem] uppercase tracking-[0.2em] text-white/40">
          Histórico
        </h3>

        {/* Nativos los dos. Un desplegable a medida habría que enseñarle a
            responder al teclado, a cerrar al salir y a leerse en voz alta; el
            del navegador ya lo hace y además abre bien en el móvil. */}
        {bancos.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[0.72rem] text-white/40">
            <span className="sr-only">Banco</span>
            <select
              value={bancoActivo}
              onChange={(e) => setBanco(e.target.value)}
              className="rounded-lg border border-white/[0.12] bg-[#0A1224] px-2.5 py-1 text-[0.74rem] text-white/75 outline-none focus:border-white/35"
            >
              <option value={TODOS}>Todos los bancos</option>
              {bancos.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              {huerfanos > 0 ? <option disabled>— {huerfanos} sin identificar —</option> : null}
            </select>
          </label>
        ) : bancos.length === 1 ? (
          <span className="text-[0.72rem] text-white/40">{bancos[0]}</span>
        ) : null}

        {rangos.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[0.72rem] text-white/40">
            <span className="sr-only">Periodo</span>
            <select
              value={rango?.clave ?? 'todo'}
              onChange={(e) => setClave(e.target.value as ClaveRango)}
              className="rounded-lg border border-white/[0.12] bg-[#0A1224] px-2.5 py-1 text-[0.74rem] text-white/75 outline-none focus:border-white/35"
            >
              {rangos.map((r) => (
                <option key={r.clave} value={r.clave}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* Qué periodo se está viendo, en fechas. «Últimos 6 meses» no dice
          cuáles son cuando los datos no llegan hasta hoy — que es justo el
          caso en el que uno se equivoca leyendo el gráfico. */}
      {periodo ? (
        <p className="text-[0.72rem] text-white/30">
          {periodo}
          {bancoActivo !== TODOS
            ? ` · sólo ${bancoActivo}`
            : bancos.length > 1
              ? ` · ${bancos.join(', ')}`
              : ''}
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[0.8rem] text-white/35">
          No hay movimientos en este periodo{bancoActivo !== TODOS ? ` de ${bancoActivo}` : ''}.
        </p>
      ) : (
        <LineaTiempo movimientos={visibles} />
      )}

      {pendientes.map((e) => (
        <PedirBanco key={e.id} extracto={e} />
      ))}
    </section>
  );
}
