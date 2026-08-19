/**
 * Agregados del panel: los cálculos que alimentan el dashboard.
 *
 * Funciones puras sobre datos ya cargados. Ni un `fetch`, ni un hook, ni una
 * referencia a React — igual que `lib/constellation/geometry.ts` en IRES. Así
 * se pueden probar sin montar un navegador, y el componente sólo pinta.
 *
 * La decisión que gobierna todo este módulo: **los traspasos entre cuentas
 * propias no son ingreso ni gasto**. En el extracto real de referencia, 8 de
 * los 15 ingresos eran transferencias del titular a sí mismo. Sumarlos como
 * ingreso infla el mes en cientos de euros y convierte el panel en un
 * generador de cifras bonitas y falsas.
 */

import { CATEGORIA_TRASPASO } from './contratos';
import { type Centimos, aCentimos, mesDe } from './dinero';

// Se reexporta porque media interfaz la importa de aquí, pero la define el
// contrato compartido: el nombre tiene que ser idéntico al de la regla de
// prioridad 100, o el traspaso dejaría de excluirse de los totales.
export { CATEGORIA_TRASPASO };
export const SIN_CATEGORIZAR = 'Sin categorizar';

export interface MovimientoVista {
  id: string;
  fecha: string;
  concepto: string;
  /** Cadena de `numeric(14,2)` tal como llega de Postgres. */
  importe: string;
  categoria: string | null;
  origen: 'regla' | 'ia' | 'manual' | null;
}

export interface ResumenMes {
  mes: string;
  ingresos: Centimos;
  gastos: Centimos;
  /** ingresos − gastos. Sin contar traspasos. */
  neto: Centimos;
  /** Movido entre cuentas propias. Se informa aparte, no se suma. */
  traspasos: Centimos;
  movimientos: number;
}

export interface LineaCategoria {
  categoria: string;
  total: Centimos;
  movimientos: number;
  /** Fracción del gasto total del periodo, 0–1. */
  proporcion: number;
  /** Cuántos vienen del modelo y no de una regla: los que conviene revisar. */
  porIA: number;
}

function esTraspaso(m: MovimientoVista): boolean {
  return m.categoria === CATEGORIA_TRASPASO;
}

/** Resumen de un mes. Los traspasos se informan aparte, nunca sumados. */
export function resumirMes(movimientos: readonly MovimientoVista[], mes: string): ResumenMes {
  let ingresos = 0;
  let gastos = 0;
  let traspasos = 0;
  let n = 0;

  for (const m of movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    const c = aCentimos(m.importe);
    if (c === null) continue;
    n++;

    if (esTraspaso(m)) {
      traspasos += Math.abs(c);
      continue;
    }
    if (c > 0) ingresos += c;
    else gastos += Math.abs(c);
  }

  return { mes, ingresos, gastos, neto: ingresos - gastos, traspasos, movimientos: n };
}

/**
 * Desglose del **gasto** por categoría, de mayor a menor.
 *
 * Sólo gasto: mezclar ingresos y gastos en el mismo desglose da porcentajes que
 * no significan nada. Los traspasos quedan fuera por la razón de la cabecera.
 */
export function desglosarGasto(
  movimientos: readonly MovimientoVista[],
  mes?: string,
): LineaCategoria[] {
  const acumulado = new Map<string, { total: Centimos; n: number; ia: number }>();
  let totalGasto = 0;

  for (const m of movimientos) {
    if (mes && mesDe(m.fecha) !== mes) continue;
    if (esTraspaso(m)) continue;
    const c = aCentimos(m.importe);
    if (c === null || c >= 0) continue;

    const clave = m.categoria ?? SIN_CATEGORIZAR;
    const previo = acumulado.get(clave) ?? { total: 0, n: 0, ia: 0 };
    previo.total += Math.abs(c);
    previo.n += 1;
    if (m.origen === 'ia') previo.ia += 1;
    acumulado.set(clave, previo);
    totalGasto += Math.abs(c);
  }

  return [...acumulado.entries()]
    .map(([categoria, v]) => ({
      categoria,
      total: v.total,
      movimientos: v.n,
      proporcion: totalGasto > 0 ? v.total / totalGasto : 0,
      porIA: v.ia,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Meses presentes en los datos, del más reciente al más antiguo. */
export function mesesDisponibles(movimientos: readonly MovimientoVista[]): string[] {
  return [...new Set(movimientos.map((m) => mesDe(m.fecha)))].sort().reverse();
}

/**
 * Cuántos movimientos convendría revisar: los que puso el modelo y los que
 * nadie ha categorizado. Es la cifra que dice si el panel es de fiar.
 */
export function pendientesDeRevision(movimientos: readonly MovimientoVista[]): number {
  return movimientos.filter((m) => m.categoria == null || m.origen === 'ia').length;
}
