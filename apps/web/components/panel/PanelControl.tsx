'use client';

/**
 * El panel de control: ORis leyendo un negocio, no una cuenta corriente.
 *
 * La diferencia con `PanelPrincipal` no es que haya más gráficos. Es que
 * contesta otras preguntas. Aquél responde «¿en qué se me fue el mes?»; éste
 * responde las cuatro que se hace quien tiene una persiana que subir:
 *
 *   1. ¿Cuánto hay y cuánto dura?          →  CuadroMando
 *   2. ¿Cada mes ha pagado lo que cuesta?  →  Evolucion
 *   3. ¿Llego a fin de trimestre?          →  PrevisionCaja
 *   4. ¿De qué está hecho ese «cuesta»?    →  Compromisos y Estacionalidad
 *
 * El orden no es decorativo: cada bloque justifica al siguiente. La previsión
 * no se puede creer sin ver de qué compromisos sale, y los compromisos no
 * significan nada sin haber visto antes si los meses los cubren.
 *
 * Como todo el panel, aquí no se calcula: los agregados son funciones puras en
 * `lib/oris/`. Este componente elige qué enseñar y en qué orden.
 *
 * Y hereda la regla de IRES: **sin datos no hay cifras de ejemplo**. Un panel de
 * control relleno de números inventados es peor que uno vacío, porque parece
 * que funciona.
 */

import { useMemo } from 'react';

import { nombreMes } from '@/lib/oris/dinero';
import type { MovimientoVista } from '@/lib/oris/agregados';
import {
  cobroTipicoGlobal,
  diasDeCaja,
  indicadores,
  serieMensual,
  tesoreria,
} from '@/lib/oris/pyme';
import { factoresEstacionales, prever } from '@/lib/oris/prevision';
import { costeMensual, detectarCompromisos, vigentes } from '@/lib/oris/recurrencia';
import { Compromisos } from './Compromisos';
import { CuadroMando } from './CuadroMando';
import { Estacionalidad } from './Estacionalidad';
import { Evolucion } from './Evolucion';
import { PrevisionCaja } from './PrevisionCaja';

export interface PanelControlProps {
  movimientos: readonly MovimientoVista[];
  /** Por qué no hay datos, cuando no los hay. Se muestra tal cual. */
  motivoVacio?: string;
  /** Meses a proyectar. Seis cubre dos trimestres fiscales. */
  horizonte?: number;
}

export function PanelControl({ movimientos, motivoVacio, horizonte = 6 }: PanelControlProps) {
  // Un solo `useMemo` para todo el encadenado. Separarlos en cinco no ahorraría
  // trabajo —cada paso depende del anterior, así que se invalidan a la vez— y
  // sí abriría la puerta a que la previsión se calcule con unos compromisos y la
  // evolución con otros, que es la clase de incoherencia que nadie ve.
  const datos = useMemo(() => {
    if (movimientos.length === 0) return null;

    const compromisos = detectarCompromisos(movimientos);
    const serie = serieMensual(movimientos, compromisos);
    if (serie.length === 0) return null;

    const ultimo = serie[serie.length - 1];
    const caja = tesoreria(movimientos);
    const enPie = vigentes(compromisos);

    return {
      compromisos,
      serie,
      ultimo,
      caja,
      enPie,
      indicadores: indicadores(ultimo, cobroTipicoGlobal(movimientos)),
      estructuraMensual: enPie.reduce((acc, c) => acc + costeMensual(c), 0),
      dias: diasDeCaja(caja.total, serie),
      prevision: prever(movimientos, compromisos, { horizonte }),
      factores: factoresEstacionales(serie),
    };
  }, [movimientos, horizonte]);

  if (!datos) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-md rounded-2xl border border-borde bg-superficie px-6 py-7 text-center">
          <p className="text-sm text-tinta-3">Todavía no hay con qué montar el cuadro de mando.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-tinta-4">
            {motivoVacio ??
              'Sube unos cuantos extractos y ORis sabrá qué se repite, cuánto cuesta tener abierto y hasta dónde llega la caja. Con un mes suelto no hay compromisos que detectar — y prefiero decirlo a estimarlos.'}
          </p>
        </div>
      </section>
    );
  }

  const { serie, ultimo, caja, prevision } = datos;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-light tracking-wide text-tinta-2">Panel de control</h2>
        <p className="text-[0.72rem] text-tinta-4">
          Cierre de {nombreMes(ultimo.mes)} · {serie.length}{' '}
          {serie.length === 1 ? 'mes' : 'meses'} de histórico
        </p>
      </div>

      <div className="mb-6">
        <CuadroMando
          mes={ultimo}
          indicadores={datos.indicadores}
          tesoreria={caja.total}
          bancos={caja.porBanco.length}
          diasDeCaja={datos.dias}
          estructuraMensual={datos.estructuraMensual}
          compromisos={datos.enPie.length}
        />
      </div>

      {/* El último mes puede venir a medias: un extracto descargado el día 12
          trae doce días. Decirlo aquí evita leer una caída que no existe en
          todos los gráficos de abajo a la vez. */}
      <p className="mb-6 text-[0.7rem] leading-relaxed text-tinta-5">
        Las cifras del cierre son las de {nombreMes(ultimo.mes)}, el último mes cargado. Si el
        extracto se descargó a mitad de mes, ese mes está incompleto y se leerá como flojo — la
        previsión lo tiene en cuenta y no lo usa para sus medias.
      </p>

      <div className="mb-7">
        <Evolucion serie={serie} />
      </div>

      {prevision ? (
        <div className="mb-7">
          <PrevisionCaja prevision={prevision} serie={serie} />
        </div>
      ) : null}

      <div className="mb-7 grid gap-4 xl:grid-cols-2">
        <Compromisos compromisos={datos.compromisos} ancla={ultimo.mes} />
        <Estacionalidad factores={datos.factores} destacado={prevision?.meses[0]?.mes} />
      </div>
    </section>
  );
}
