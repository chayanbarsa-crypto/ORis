'use client';

/**
 * Los movimientos, en tabla.
 *
 * Es también la «vista de tabla» que el desglose necesita para ser accesible:
 * quien no distinga las barras tiene aquí las mismas cifras en texto.
 *
 * La procedencia de cada categoría se muestra siempre. Una categoría puesta por
 * el modelo y una puesta por una regla valen distinto —la primera hay que
 * revisarla— y esconder esa diferencia haría el panel más limpio y menos
 * fiable.
 */

import { aCentimos, formatear } from '@/lib/oris/dinero';
import { CATEGORIA_TRASPASO, type MovimientoVista } from '@/lib/oris/agregados';

const ORIGEN: Record<string, { texto: string; titulo: string }> = {
  regla: { texto: 'regla', titulo: 'Categorizado por una regla determinista' },
  ia: { texto: 'IA', titulo: 'Categorizado por el modelo — conviene revisarlo' },
  manual: { texto: 'tuyo', titulo: 'Lo categorizaste tú; nada lo sobrescribe' },
};

export function ListaMovimientos({ movimientos }: { movimientos: readonly MovimientoVista[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/35">
        Sin movimientos en este periodo.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Movimientos del periodo seleccionado</caption>
        <thead>
          <tr className="text-left text-[0.6rem] uppercase tracking-[0.18em] text-white/35">
            <th scope="col" className="pb-2 pr-3 font-normal">Fecha</th>
            <th scope="col" className="pb-2 pr-3 font-normal">Concepto</th>
            <th scope="col" className="pb-2 pr-3 font-normal">Categoría</th>
            <th scope="col" className="pb-2 text-right font-normal">Importe</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => {
            const traspaso = m.categoria === CATEGORIA_TRASPASO;
            const marca = m.origen ? ORIGEN[m.origen] : null;
            // aCentimos y no aritmética a mano: «12» son 1200 céntimos, no 12,
            // y un replace del punto acierta sólo cuando hay dos decimales.
            const centimos = aCentimos(m.importe);
            const negativo = centimos !== null && centimos < 0;

            return (
              <tr key={m.id} className="border-t border-white/[0.05] align-top">
                <td className="py-2 pr-3 tabular-nums text-white/45">{m.fecha}</td>
                <td className="py-2 pr-3 text-white/75">{m.concepto}</td>
                <td className="py-2 pr-3">
                  {m.categoria ? (
                    <span className={traspaso ? 'text-white/40' : 'text-white/60'}>
                      {m.categoria}
                      {marca ? (
                        <span
                          className="ml-1.5 text-[0.6rem] uppercase tracking-wider text-white/30"
                          title={marca.titulo}
                        >
                          {marca.texto}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-white/30">sin categorizar</span>
                  )}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    traspaso ? 'text-white/35' : negativo ? 'text-white/70' : 'text-white/85'
                  }`}
                  title={traspaso ? 'Traspaso entre cuentas propias: ni ingreso ni gasto' : undefined}
                >
                  {centimos === null ? (
                    <span className="text-white/30" title={`Importe ilegible: ${m.importe}`}>
                      —
                    </span>
                  ) : (
                    formatear(centimos)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
