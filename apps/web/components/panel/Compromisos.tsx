'use client';

/**
 * Lo que ya está firmado: el coste de tener abierto, recibo a recibo.
 *
 * No es un gráfico y no debería serlo. La pregunta es «¿qué se me va a cobrar y
 * cuándo?», y eso es una lista con fechas — dibujarla en barras obligaría a
 * volver al número para saber si el recibo cae antes o después de cobrar.
 *
 * Dos cosas que esta lista enseña y ningún total mensual dice:
 *
 * **Lo que se paró.** Un compromiso con veinte meses de historia que lleva
 * cinco sin aparecer no se proyecta —sería inventar una factura— pero tampoco
 * se calla: que desde marzo no haya nómina es un hecho del negocio. En el
 * total sólo se vería que el gasto ha bajado, y bajar parece bueno hasta que
 * resulta que era un recibo devuelto.
 *
 * **Cuánto se puede confiar en cada uno.** Un recibo que ha caído veinticinco
 * de veinticinco meses es una certeza; uno que ha caído tres de cinco es una
 * corazonada. Van con la misma tipografía pero no con la misma cifra al lado, y
 * quien lea la previsión puede saber de qué está hecha.
 */

import { formatear, nombreMes } from '@/lib/oris/dinero';
import {
  cesados,
  costeMensual,
  proximoCargo,
  vigentes,
  type Cadencia,
  type Compromiso,
} from '@/lib/oris/recurrencia';

const CADENCIA: Record<Cadencia, string> = {
  mensual: 'cada mes',
  bimestral: 'cada 2 meses',
  trimestral: 'cada 3 meses',
  irregular: 'sin cadencia fija',
};

export interface CompromisosProps {
  compromisos: readonly Compromiso[];
  /** Mes de referencia para calcular el próximo vencimiento. */
  ancla: string;
}

export function Compromisos({ compromisos, ancla }: CompromisosProps) {
  const enPie = vigentes(compromisos);
  const parados = cesados(compromisos);
  const alMes = enPie.reduce((acc, c) => acc + costeMensual(c), 0);

  if (enPie.length === 0 && parados.length === 0) {
    return (
      <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">Compromisos</h3>
        <p className="mt-2.5 text-[0.8rem] leading-relaxed text-tinta-4">
          Todavía no hay ningún gasto que se repita con cadencia estable. Hacen falta al menos tres
          cargos del mismo recibo para poder decir que es un compromiso, y con menos prefiero no
          decirlo: la previsión se apoya en esta lista.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
          Compromisos vigentes
        </h3>
        <p className="text-[0.74rem] text-tinta-3">
          <span className="tabular-nums text-tinta-2">{formatear(alMes)}</span> al mes
        </p>
      </div>

      {enPie.length > 0 ? (
        <ul className="space-y-px">
          {enPie.map((c) => (
            <li
              key={c.huella}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-superficie-2"
            >
              <span className="min-w-0 flex-1 truncate text-[0.82rem] text-tinta-2">
                {c.huella}
              </span>
              <span className="shrink-0 tabular-nums text-[0.82rem] text-tinta-2">
                {formatear(c.importe)}
              </span>
              <span className="w-full text-[0.68rem] text-tinta-4 sm:w-auto sm:shrink-0">
                {CADENCIA[c.cadencia]}
                {c.cadencia !== 'mensual' ? ` · ${formatear(costeMensual(c))}/mes` : ''}
                {' · '}
                {fechaCorta(proximoCargo(c, ancla))}
                {' · '}
                <Fiabilidad c={c} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.8rem] text-tinta-4">
          Ninguno sigue en pie: todos los recibos que se repetían han dejado de cargarse.
        </p>
      )}

      {parados.length > 0 ? (
        <div className="mt-5 border-t border-borde pt-3.5">
          <h4 className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
            Han dejado de cargarse
          </h4>
          <ul className="space-y-px">
            {parados.map((c) => (
              <li
                key={c.huella}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md px-1.5 py-1 text-tinta-4"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8rem]">{c.huella}</span>
                <span className="shrink-0 tabular-nums text-[0.8rem]">{formatear(c.importe)}</span>
                <span className="w-full text-[0.68rem] text-tinta-5 sm:w-auto sm:shrink-0">
                  el último, en {nombreMes(c.hasta)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[0.7rem] leading-relaxed text-tinta-5">
            No entran en la previsión — proyectar un recibo cancelado sería inventarse una factura.
            Están aquí porque dejar de pagar algo baja el gasto igual que ahorrarlo, y no es lo
            mismo: conviene mirar si fue una baja o una devolución.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Cuántas veces de las que tocaba ha aparecido.
 *
 * En texto y no en una barra de progreso: son dos números pequeños que se leen
 * antes escritos, y una barra al 88 % junto a otra al 100 % obliga a comparar
 * longitudes de doce píxeles para saber cuál es cuál.
 */
function Fiabilidad({ c }: { c: Compromiso }) {
  // «26/26» se lee solo; «10/8» no se lee de ninguna manera, y sale en cuanto
  // un recibo aparece más veces de las que marca su cadencia —un impuesto
  // trimestral con un pago suelto a cuenta entre medias—. Cuando no ha fallado
  // ningún periodo, la fracción no aporta nada que no diga la frase.
  const completo = c.confianza >= 0.95;
  return (
    <span
      className={completo ? 'text-tinta-3' : undefined}
      title={`${c.meses} ${c.meses === 1 ? 'mes' : 'meses'} con cargo de los ${
        c.esperados
      } que marca su cadencia${
        c.oscilacion > 0 ? `; el importe ha variado hasta ${formatear(c.oscilacion)}` : ', siempre por el mismo importe'
      }`}
    >
      {completo ? 'sin fallar uno' : `${c.meses} de ${c.esperados}`}
      {c.oscilacion > 0 ? ` · ±${formatear(c.oscilacion)}` : ''}
    </span>
  );
}

/** «4 de septiembre». Sin año: todos los próximos cargos caen dentro de uno. */
function fechaCorta(iso: string | null): string {
  if (!iso) return 'sin fecha';
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} de ${MESES[Number(mes) - 1]}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
