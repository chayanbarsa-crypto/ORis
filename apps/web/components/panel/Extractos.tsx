'use client';

/**
 * La sección de extractos.
 *
 * Lo primero es lo último que subiste, en grande. No es decoración: cuando
 * vuelves a importar, la pregunta que tienes en la cabeza es «¿hasta cuándo
 * tengo cargado?», y la respuesta decide qué descargas del banco. Ponerla
 * arriba evita la descarga solapada más habitual — y, si aun así se solapa,
 * la ingesta lo detecta movimiento a movimiento.
 *
 * Debajo, la lista completa agrupada por banco. Con dos cuentas, saber cuál es
 * cuál deja de ser un detalle: son saldos distintos, y mezclarlos da una caja
 * que no existe.
 */

import { periodoCorto, tituloExtracto } from '@/lib/oris/bancos';
import type { ExtractoVista } from '@/lib/oris/cargar';
import { PedirBanco } from './PedirBanco';

export interface ExtractosProps {
  extractos: readonly ExtractoVista[];
}

export function Extractos({ extractos }: ExtractosProps) {
  if (extractos.length === 0) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">Extractos</h2>
        <div className="max-w-md rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-7">
          <p className="text-sm text-white/60">Todavía no has subido ninguno.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-white/35">
            Suéltale un PDF, un Excel o un CSV a ORis en el panel de la derecha. Si
            tu banco ofrece Excel, usa ése: se lee sin pasar por el modelo, es
            exacto y no cuesta nada.
          </p>
        </div>
      </section>
    );
  }

  const [ultimo, ...resto] = extractos;
  const porBanco = agrupar(extractos);
  const cobertura = calcularCobertura(extractos);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">Extractos</h2>

      {/* --- El último, que es el que responde a «¿por dónde iba?» --------- */}
      <div className="mb-6 rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-4">
        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/35">Último importado</p>
        <p className="mt-1.5 text-base text-white/90">
          {tituloExtracto(ultimo.banco, ultimo.periodoInicio, ultimo.periodoFin)}
        </p>
        <p className="mt-1 text-[0.78rem] text-white/45">
          <span className="tabular-nums">{ultimo.movimientos}</span> movimientos ·{' '}
          {haceCuanto(ultimo.subidoEn)} · {ultimo.nombreFichero}
        </p>

        {cobertura ? (
          <p className="mt-3 border-t border-white/[0.07] pt-3 text-[0.78rem] leading-relaxed text-white/55">
            Tienes cargado desde <strong className="font-normal text-white/85">{cobertura.desde}</strong>{' '}
            hasta <strong className="font-normal text-white/85">{cobertura.hasta}</strong>. Para
            continuar, descarga del banco a partir de esa última fecha — y si te
            pasas y solapas, no importa: los repetidos no se cuentan dos veces.
          </p>
        ) : null}
      </div>

      {/* --- Todos, por banco --------------------------------------------- */}
      {porBanco.map(([banco, suyos]) => (
        <div key={banco} className="mb-5">
          <h3 className="mb-2 flex items-baseline gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-white/40">
            {banco}
            <span className="text-white/25">
              {suyos.length} {suyos.length === 1 ? 'extracto' : 'extractos'}
            </span>
          </h3>
          <ul className="overflow-hidden rounded-xl border border-white/[0.07]">
            {suyos.map((e, i) => (
              <li
                key={e.id}
                className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 ${
                  i > 0 ? 'border-t border-white/[0.05]' : ''
                } ${e.id === ultimo.id ? 'bg-white/[0.03]' : ''}`}
              >
                <span className="text-[0.84rem] text-white/75">
                  {e.periodoInicio && e.periodoFin
                    ? periodoCorto(e.periodoInicio, e.periodoFin)
                    : 'Periodo no declarado'}
                </span>
                <span className="text-[0.74rem] text-white/35">{e.nombreFichero}</span>
                <span className="ml-auto text-[0.78rem] tabular-nums text-white/55">
                  {e.movimientos}
                </span>
              </li>
            ))}
          </ul>

          {/* La pregunta va donde está el problema: debajo de los extractos
              que no tienen banco, uno por uno, en vez de un aviso general que
              no dice cuál es cuál. */}
          {banco === SIN_IDENTIFICAR ? (
            <div className="mt-2 space-y-2">
              {suyos.map((e) => (
                <PedirBanco key={e.id} extracto={e} />
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {resto.length === 0 ? null : (
        <p className="mt-4 text-[0.74rem] leading-relaxed text-white/25">
          Un extracto que ya esté entero no vuelve a entrar, aunque el fichero sea
          distinto: la comparación es movimiento a movimiento, no por nombre.
        </p>
      )}
    </section>
  );
}

/** Etiqueta de los que no se pudieron identificar. Es un estado, no un banco. */
const SIN_IDENTIFICAR = 'Banco no identificado';

/** Por banco, con los no identificados al final. */
function agrupar(extractos: readonly ExtractoVista[]): [string, ExtractoVista[]][] {
  const mapa = new Map<string, ExtractoVista[]>();
  for (const e of extractos) {
    const clave = e.banco ?? SIN_IDENTIFICAR;
    const lista = mapa.get(clave);
    if (lista) lista.push(e);
    else mapa.set(clave, [e]);
  }
  return [...mapa.entries()].sort(([a], [b]) => {
    if (a === SIN_IDENTIFICAR) return 1;
    if (b === SIN_IDENTIFICAR) return -1;
    return a.localeCompare(b, 'es');
  });
}

/**
 * Desde cuándo y hasta cuándo hay datos cargados.
 *
 * Se calcula sobre TODOS los extractos, no sobre el último: si subiste
 * mayo-agosto y luego enero-marzo, lo que tienes cubierto llega hasta agosto
 * aunque lo último que importaras acabe en marzo.
 */
function calcularCobertura(
  extractos: readonly ExtractoVista[],
): { desde: string; hasta: string } | null {
  const inicios = extractos.map((e) => e.periodoInicio).filter((f): f is string => !!f);
  const fines = extractos.map((e) => e.periodoFin).filter((f): f is string => !!f);
  if (inicios.length === 0 || fines.length === 0) return null;

  const desde = inicios.reduce((a, b) => (a < b ? a : b));
  const hasta = fines.reduce((a, b) => (a > b ? a : b));
  return { desde: enLetra(desde), hasta: enLetra(hasta) };
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

function enLetra(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return fecha;
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** «hace 3 minutos», «ayer», «hace 5 días». */
function haceCuanto(iso: string): string {
  const cuando = new Date(iso).getTime();
  if (Number.isNaN(cuando)) return '';
  const minutos = Math.round((Date.now() - cuando) / 60000);

  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}
