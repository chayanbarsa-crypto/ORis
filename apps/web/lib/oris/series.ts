/**
 * La serie temporal del panel y su proyección.
 *
 * Dos decisiones que cambian lo que el gráfico puede afirmar:
 *
 * **1. Lo que se acumula es la variación, no el saldo.** De los movimientos
 * sale cuánto ha entrado y salido cada mes, pero no con cuánto empezaste: eso
 * lo declara el extracto, y muchos no lo declaran. Dibujar «saldo» partiendo de
 * cero sería afirmar que empezaste sin nada. Se dibuja la variación acumulada,
 * y sólo cuando hay un saldo conocido se convierte en saldo de verdad.
 *
 * **2. La proyección es una recta, y se dice.** Prolonga la media de los
 * últimos meses. No sabe de pagas extra, ni de que enero es caro, ni de que
 * dejaste un cliente. Es útil porque responde «si nada cambia, ¿cuánto
 * aguanto?», y es honesta mientras se pinte discontinua y nadie la confunda
 * con una predicción.
 *
 * Todo en céntimos enteros. Una serie de doce meses son doce sumas encadenadas,
 * y en coma flotante el error se arrastra hasta el último punto.
 */

import { CATEGORIA_TRASPASO, type MovimientoVista } from './agregados';
import { aCentimos, mesDe, type Centimos } from './dinero';

export interface PuntoMes {
  /** «2026-05» */
  mes: string;
  ingresos: Centimos;
  gastos: Centimos;
  /** ingresos − gastos. Sin traspasos entre cuentas propias. */
  neto: Centimos;
  /** Suma de los netos hasta este mes incluido. */
  acumulado: Centimos;
  movimientos: number;
}

/**
 * Un mes por cada mes con datos, del más antiguo al más reciente.
 *
 * **Los meses sin movimientos también aparecen**, con ceros. Si se saltaran, el
 * gráfico juntaría marzo con junio y la pendiente parecería mucho más suave de
 * lo que es: tres meses de caída dibujados como uno.
 */
export function serieMensual(movimientos: readonly MovimientoVista[]): PuntoMes[] {
  const porMes = new Map<string, { ingresos: Centimos; gastos: Centimos; n: number }>();

  for (const m of movimientos) {
    // Los traspasos entre cuentas propias no son ni ingreso ni gasto: mover
    // dinero de una cuenta tuya a otra no te hace más rico ni más pobre.
    if (m.categoria === CATEGORIA_TRASPASO) continue;

    const centimos = aCentimos(m.importe);
    if (centimos === null) continue;

    const mes = mesDe(m.fecha);
    const acc = porMes.get(mes) ?? { ingresos: 0, gastos: 0, n: 0 };
    if (centimos >= 0) acc.ingresos += centimos;
    else acc.gastos += -centimos;
    acc.n += 1;
    porMes.set(mes, acc);
  }

  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) return [];

  const serie: PuntoMes[] = [];
  let acumulado = 0;

  for (const mes of rango(meses[0], meses[meses.length - 1])) {
    const acc = porMes.get(mes) ?? { ingresos: 0, gastos: 0, n: 0 };
    const neto = acc.ingresos - acc.gastos;
    acumulado += neto;
    serie.push({
      mes,
      ingresos: acc.ingresos,
      gastos: acc.gastos,
      neto,
      acumulado,
      movimientos: acc.n,
    });
  }

  return serie;
}

/** Todos los meses entre dos, incluidos los extremos. */
function rango(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.split('-').map(Number);
  const [af, mf] = hasta.split('-').map(Number);

  // Guarda contra una fecha corrupta: sin ella, un mes 0 o un año erróneo
  // haría girar este bucle hasta agotar la memoria del servidor.
  for (let i = 0; i < 600 && (a < af || (a === af && m <= mf)); i++) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

export interface Proyeccion {
  /** Media del neto de los meses tomados como referencia. */
  ritmo: Centimos;
  /** Cuántos meses se han promediado. */
  base: number;
  /** Los meses proyectados hacia delante, continuando el acumulado. */
  puntos: { mes: string; acumulado: Centimos }[];
}

/**
 * Prolonga la serie al ritmo de los últimos meses.
 *
 * Se promedian los últimos `base` meses **completos**, no todos: un año
 * incluiría meses que ya no se parecen a tu vida actual. Tres es el mínimo que
 * amortigua un mes raro sin diluir un cambio real.
 */
export function proyectar(serie: readonly PuntoMes[], meses = 6, base = 3): Proyeccion | null {
  if (serie.length === 0) return null;

  const ultimos = serie.slice(-base);
  const usados = ultimos.length;
  const ritmo = Math.round(ultimos.reduce((acc, p) => acc + p.neto, 0) / usados);

  const puntos: { mes: string; acumulado: Centimos }[] = [];
  let acumulado = serie[serie.length - 1].acumulado;
  let [a, m] = serie[serie.length - 1].mes.split('-').map(Number);

  for (let i = 0; i < meses; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
    acumulado += ritmo;
    puntos.push({ mes: `${a}-${String(m).padStart(2, '0')}`, acumulado });
  }

  return { ritmo, base: usados, puntos };
}

/**
 * Cuántos meses aguanta un saldo al ritmo actual.
 *
 * `null` cuando la pregunta no tiene sentido: sin saldo conocido, o cuando el
 * ritmo es positivo —si cada mes entra más de lo que sale, no hay cuenta atrás
 * que dar—. Devolver un número enorme en ese caso sería contestar a algo que
 * nadie preguntó.
 */
export function mesesDeAguante(saldo: Centimos | null, ritmo: Centimos): number | null {
  if (saldo === null || saldo <= 0) return null;
  if (ritmo >= 0) return null;
  return saldo / -ritmo;
}
