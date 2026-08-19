'use client';

/**
 * El panel principal de ORis.
 *
 * Compone las piezas y no calcula nada: los agregados son funciones puras en
 * `lib/oris/agregados.ts`, igual que la geometría de la constelación vive en
 * `lib/constellation/`. Aquí sólo se elige el mes y se pinta.
 *
 * La regla heredada de IRES que más se nota en este archivo: **no se simula
 * backend**. Sin datos no hay cifras de ejemplo ni gráficos de relleno — hay un
 * estado vacío que dice qué falta y cómo conseguirlo. Un panel con datos
 * inventados es peor que uno vacío: parece que funciona.
 */

import { useMemo, useState } from 'react';

import { nombreMes } from '@/lib/oris/dinero';
import {
  desglosarGasto,
  mesesDisponibles,
  pendientesDeRevision,
  resumirMes,
  type MovimientoVista,
} from '@/lib/oris/agregados';
import { DesgloseGasto } from './DesgloseGasto';
import { Kpi } from './Kpi';
import { ListaMovimientos } from './ListaMovimientos';

export interface PanelPrincipalProps {
  movimientos: readonly MovimientoVista[];
  /** Por qué no hay datos, cuando no los hay. Se muestra tal cual. */
  motivoVacio?: string;
}

export function PanelPrincipal({ movimientos, motivoVacio }: PanelPrincipalProps) {
  const meses = useMemo(() => mesesDisponibles(movimientos), [movimientos]);
  const [mes, setMes] = useState<string | null>(null);
  const mesActivo = mes ?? meses[0] ?? null;

  const delMes = useMemo(
    () => (mesActivo ? movimientos.filter((m) => m.fecha.startsWith(mesActivo)) : []),
    [movimientos, mesActivo],
  );
  const resumen = useMemo(
    () => (mesActivo ? resumirMes(movimientos, mesActivo) : null),
    [movimientos, mesActivo],
  );
  const desglose = useMemo(
    () => (mesActivo ? desglosarGasto(movimientos, mesActivo) : []),
    [movimientos, mesActivo],
  );
  const pendientes = useMemo(() => pendientesDeRevision(delMes), [delMes]);

  if (movimientos.length === 0) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-7 text-center">
          <p className="text-sm text-white/60">Todavía no hay movimientos que enseñar.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-white/35">
            {motivoVacio ??
              'Sube un extracto y ORis lo auditará, categorizará y guardará. Hasta entonces no hay nada que contar — y prefiero decirlo a inventar cifras.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      {/* Los filtros, en una fila sobre el contenido. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-light tracking-wide text-white/70">
          {mesActivo ? nombreMes(mesActivo) : 'Panel'}
        </h2>
        {meses.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMes(m)}
            aria-pressed={m === mesActivo}
            className={`rounded-full px-3 py-1 text-[0.7rem] tabular-nums transition-colors ${
              m === mesActivo
                ? 'bg-white/[0.09] text-white/85'
                : 'text-white/40 hover:bg-white/[0.04] hover:text-white/65'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {resumen ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi etiqueta="Ingresos" valor={resumen.ingresos} pie="Sin contar traspasos propios" />
          <Kpi etiqueta="Gastos" valor={resumen.gastos} />
          <Kpi
            etiqueta="Neto"
            valor={resumen.neto}
            conSigno
            pie={`${resumen.movimientos} movimiento${resumen.movimientos === 1 ? '' : 's'}`}
          />
          <Kpi
            etiqueta="Traspasos"
            valor={resumen.traspasos}
            secundario
            pie="Entre cuentas propias: ni ingreso ni gasto"
          />
        </div>
      ) : null}

      {pendientes > 0 ? (
        <p className="mb-5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-[0.72rem] leading-relaxed text-white/45">
          <strong className="font-normal text-white/65">{pendientes}</strong> de {delMes.length}{' '}
          movimientos están sin categorizar o los categorizó el modelo. Las cifras de arriba son
          correctas de todos modos —el reparto por categoría es lo que puede moverse al revisarlos.
        </p>
      ) : null}

      <div className="mb-7">
        <DesgloseGasto lineas={desglose} total={resumen?.gastos ?? 0} />
      </div>

      <div>
        <h3 className="mb-2.5 text-[0.6rem] uppercase tracking-[0.2em] text-white/40">
          Movimientos
        </h3>
        <ListaMovimientos movimientos={delMes} />
      </div>
    </section>
  );
}
