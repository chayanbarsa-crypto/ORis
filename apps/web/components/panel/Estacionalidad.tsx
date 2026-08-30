'use client';

/**
 * Cuánto pesa cada mes del año.
 *
 * Es la pieza que convierte «septiembre ha ido mal» en «septiembre siempre va
 * mal». En el negocio de referencia —un salón de estética— septiembre factura
 * la mitad que abril, todos los años, y sin este gráfico cada septiembre parece
 * una crisis nueva.
 *
 * Doce barras verticales, no horizontales: el eje es el calendario, y el
 * calendario se lee de izquierda a derecha. Es la única excepción a la regla de
 * `DesgloseGasto` —barras horizontales porque las etiquetas son palabras—:
 * aquí las etiquetas son tres letras y el orden es lo que hay que leer.
 *
 * La referencia es 1, no el cero. Lo que se compara es cada mes contra el mes
 * medio, así que la línea del uno es el suelo conceptual y las barras crecen o
 * caen desde ella. Con el cero abajo, un abril a 1,57 y un septiembre a 0,54
 * se dibujarían como dos barras altas y la diferencia se perdería.
 */

import { PENDIENTE } from '@/lib/oris/paleta';
import { BARRA } from '@/lib/oris/paleta';
import type { FactorEstacional } from '@/lib/oris/prevision';

const CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface EstacionalidadProps {
  factores: readonly FactorEstacional[];
  /** El mes que se está previendo, para señalarlo. «2026-09» */
  destacado?: string;
}

export function Estacionalidad({ factores, destacado }: EstacionalidadProps) {
  if (factores.length === 0) {
    return (
      <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
          Los meses del año
        </h3>
        <p className="mt-2.5 text-[0.8rem] leading-relaxed text-tinta-4">
          Hacen falta dos años de histórico para saber si septiembre es flojo o si lo fue aquel
          septiembre. Con un solo ciclo no hay forma de distinguir la estación de la casualidad, y
          prefiero no dibujarlo a dibujarlo con una advertencia que nadie lee.
        </p>
      </section>
    );
  }

  const mesDestacado = destacado ? Number(destacado.slice(5, 7)) : null;
  const maximo = Math.max(1.2, ...factores.map((f) => f.factor));
  const flojo = factores.filter((f) => f.factor < 0.85);
  // Las alturas van en píxeles y no en porcentaje. Un `height: 62%` dentro de
  // un elemento flexible sin altura propia resuelve a `auto`, que es cero: las
  // barras desaparecían y quedaban las etiquetas flotando sobre la nada, sin
  // que ningún error lo dijera.
  const ALTO_CAJA = 96;
  const ALTO_UNO = 60;

  return (
    <section className="rounded-xl border border-borde bg-superficie px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">Los meses del año</h3>
        <p className="text-[0.74rem] text-tinta-4">Facturación frente a un mes medio</p>
      </div>

      <ul className="flex items-end gap-[3px]" style={{ height: ALTO_CAJA + 34 }}>
        {factores.map((f) => {
          // El uno queda a dos tercios de la altura: deja sitio arriba para un
          // mes fuerte sin aplastar la caída de uno flojo, que es la mitad de
          // la información.
          const alto =
            f.factor >= 1
              ? ALTO_UNO + ((f.factor - 1) / (maximo - 1)) * (ALTO_CAJA - ALTO_UNO)
              : ALTO_UNO * f.factor;
          const activo = mesDestacado === f.mes;

          return (
            <li key={f.mes} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span
                className={`text-[0.6rem] tabular-nums ${
                  activo ? 'text-tinta-2' : 'text-tinta-5'
                }`}
              >
                {f.factor.toFixed(2).replace('.', ',')}
              </span>
              <div
                className="w-full rounded-[2px]"
                style={{
                  height: `${Math.max(3, alto)}px`,
                  background: activo ? PENDIENTE : BARRA,
                  opacity: activo ? 1 : f.factor < 1 ? 0.42 : 0.85,
                }}
                role="img"
                aria-label={`${CORTOS[f.mes - 1]}: ${f.factor.toFixed(2)} veces un mes medio, sobre ${
                  f.observaciones
                } años`}
              />
              <span
                className={`text-[0.62rem] ${activo ? 'text-tinta-2' : 'text-tinta-4'}`}
              >
                {CORTOS[f.mes - 1]}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[0.72rem] leading-relaxed text-tinta-5">
        {flojo.length > 0 ? (
          <>
            Los meses flojos son{' '}
            <strong className="font-normal text-tinta-3">
              {flojo.map((f) => CORTOS[f.mes - 1]).join(', ')}
            </strong>
            . La estructura se paga igual, así que son los meses que hay que llegar con caja, no
            los que hay que explicar.
          </>
        ) : (
          'Ningún mes se queda muy por debajo de la media: la facturación es bastante pareja durante el año.'
        )}
      </p>
    </section>
  );
}
