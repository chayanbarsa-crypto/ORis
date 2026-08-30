'use client';

/**
 * El cuadro de mando: seis cifras y ninguna más.
 *
 * Las seis contestan preguntas distintas, y ese es el criterio con el que se
 * eligieron. Un cuadro de mando con doce números no informa el doble — obliga a
 * decidir cuáles mirar, que es trabajo que debería haber hecho el panel:
 *
 *   Tesorería      cuánto hay
 *   Días de caja   cuánto dura si dejo de facturar
 *   Facturación    cuánto entró el último mes
 *   Estructura     cuánto cuesta tener abierto, al mes
 *   Cobertura      si el mes pagó la persiana
 *   Equilibrio     cuántos clientes hacen falta para llegar
 *
 * Ninguna es un porcentaje sobre otra: se solapan lo justo para que la
 * respuesta a «¿voy bien?» no dependa de una sola.
 *
 * `null` se pinta como «—» con su motivo al pie. Poner un cero en su lugar
 * convertiría «no lo sé» en «no tienes», que son cosas opuestas y la segunda
 * asusta.
 */

import { formatear, type Centimos } from '@/lib/oris/dinero';
import type { Indicadores, LecturaMes } from '@/lib/oris/pyme';

export interface CuadroMandoProps {
  /** El último mes con datos. */
  mes: LecturaMes;
  indicadores: Indicadores;
  tesoreria: Centimos | null;
  /** Bancos que aportan al saldo, para decir de dónde sale la cifra. */
  bancos: number;
  diasDeCaja: number | null;
  /** Coste mensual de los compromisos vigentes. */
  estructuraMensual: Centimos;
  /** Cuántos compromisos la componen. */
  compromisos: number;
}

export function CuadroMando({
  mes,
  indicadores: ind,
  tesoreria,
  bancos,
  diasDeCaja,
  estructuraMensual,
  compromisos,
}: CuadroMandoProps) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      <Cifra
        etiqueta="Tesorería"
        valor={tesoreria !== null ? formatear(tesoreria) : null}
        pie={
          tesoreria === null
            ? 'Ningún extracto declara el saldo'
            : bancos > 1
              ? `Suma de ${bancos} cuentas`
              : 'Último saldo del extracto'
        }
      />
      <Cifra
        etiqueta="Días de caja"
        valor={diasDeCaja !== null ? `${diasDeCaja}` : null}
        pie={
          diasDeCaja !== null
            ? 'Si dejaras de facturar mañana'
            : tesoreria === null
              ? 'Hace falta un saldo declarado para contarlos'
              : tesoreria <= 0
                ? 'La cuenta ya está en descubierto'
                : 'Hace falta gasto de los últimos meses para contarlos'
        }
        estado={
          (diasDeCaja !== null && diasDeCaja < 45) || (tesoreria !== null && tesoreria <= 0)
            ? 'aviso'
            : undefined
        }
      />
      <Cifra
        etiqueta="Facturación"
        valor={formatear(mes.facturacion)}
        pie={`${mes.cobros} cobro${mes.cobros === 1 ? '' : 's'} · sin traspasos propios`}
      />
      <Cifra
        etiqueta="Estructura"
        valor={formatear(estructuraMensual)}
        pie={`${compromisos} compromiso${compromisos === 1 ? '' : 's'} al mes`}
      />
      <Cifra
        etiqueta="Cobertura"
        valor={ind.cobertura !== null ? `${ind.cobertura.toFixed(2).replace('.', ',')}×` : null}
        pie={
          ind.cobertura === null
            ? 'Sin estructura detectada todavía'
            : ind.cobertura >= 1
              ? 'El mes pagó lo que cuesta abrir'
              : 'El mes no llegó a pagar la estructura'
        }
        estado={ind.cobertura !== null && ind.cobertura < 1 ? 'aviso' : undefined}
      />
      <Cifra
        etiqueta="Equilibrio"
        valor={ind.equilibrio !== null ? `${ind.equilibrio}` : null}
        pie={
          ind.equilibrio === null
            ? 'Hace falta un cobro típico para calcularlo'
            : `Cobros típicos para cubrir la estructura. El mes valió ${ind.equivalentes}` +
              (ind.distanciaAlEquilibrio !== null && ind.distanciaAlEquilibrio >= 0
                ? ` — sobraron ${ind.distanciaAlEquilibrio}`
                : ` — faltaron ${Math.abs(ind.distanciaAlEquilibrio ?? 0)}`)
        }
        estado={
          ind.distanciaAlEquilibrio !== null && ind.distanciaAlEquilibrio < 0 ? 'aviso' : undefined
        }
      />
    </div>
  );
}

/**
 * Una cifra del cuadro.
 *
 * No reutiliza `Kpi` a propósito: aquél toma céntimos y abre un panel de
 * detalle, y aquí la mitad de las cifras no son dinero —días, veces, número de
 * clientes— ni tienen detalle que abrir. Forzar el tipo obligaría a colar «45
 * días» como 4500 céntimos y a formatearlo como euros por descuido.
 */
function Cifra({
  etiqueta,
  valor,
  pie,
  estado,
}: {
  etiqueta: string;
  valor: string | null;
  pie: string;
  estado?: 'aviso';
}) {
  return (
    <div
      className={`flex w-full flex-col items-start overflow-hidden rounded-xl border px-4 py-3.5 ${
        estado === 'aviso'
          ? 'border-[var(--aviso-borde)] bg-[var(--aviso-fondo)]'
          : 'border-borde bg-superficie'
      }`}
    >
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">{etiqueta}</p>
      <p
        className={`mt-1.5 whitespace-nowrap text-xl font-light tabular-nums sm:text-2xl ${
          valor === null ? 'text-tinta-5' : 'text-tinta'
        }`}
      >
        {valor ?? '—'}
      </p>
      <p className="mt-1 text-[0.68rem] leading-snug text-tinta-4">{pie}</p>
    </div>
  );
}
