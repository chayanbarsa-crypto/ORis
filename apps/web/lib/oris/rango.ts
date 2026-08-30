/**
 * Los rangos temporales del histórico.
 *
 * Una decisión que se nota en cuanto los datos tienen unos meses: **«últimos
 * seis meses» se cuenta desde el último movimiento que hay cargado, no desde
 * hoy**. Si el extracto más reciente es de mayo y estamos en agosto, contar
 * desde hoy devolvería tres meses vacíos y dos con datos, y el gráfico diría
 * que los ingresos se han desplomado cuando lo que pasa es que falta importar.
 *
 * De paso resuelve un problema técnico real: `new Date()` en el render da una
 * hora en el servidor y otra en el navegador, y React avisa de que el HTML no
 * coincide. Anclando en el dato no hay reloj de por medio y las dos mitades
 * pintan lo mismo.
 *
 * Los rangos que no aportan nada no se ofrecen: con cuatro meses cargados,
 * «últimos 12 meses» y «todo» enseñan exactamente lo mismo, y un desplegable
 * con tres opciones que hacen lo mismo hace dudar de si el filtro funciona.
 */

import type { MovimientoVista } from './agregados';
import { mesDe, sumarMeses } from './dinero';

export type ClaveRango = '3m' | '6m' | '12m' | 'anio' | 'todo';

export interface Rango {
  clave: ClaveRango;
  /** Lo que se lee en el desplegable. */
  etiqueta: string;
  /** Primer mes incluido, «2026-01». `null` = sin límite por abajo. */
  desde: string | null;
}

const MESES: Record<Exclude<ClaveRango, 'anio' | 'todo'>, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

/** El mes del movimiento más reciente. Es el ancla de todos los rangos. */
export function anclaje(movimientos: readonly MovimientoVista[]): string | null {
  let ultimo: string | null = null;
  for (const m of movimientos) {
    const mes = mesDe(m.fecha);
    if (ultimo === null || mes > ultimo) ultimo = mes;
  }
  return ultimo;
}

/** El mes más antiguo con datos. */
export function origen(movimientos: readonly MovimientoVista[]): string | null {
  let primero: string | null = null;
  for (const m of movimientos) {
    const mes = mesDe(m.fecha);
    if (primero === null || mes < primero) primero = mes;
  }
  return primero;
}

/** Retrocede `n` meses sobre «2026-05». `n = 0` devuelve el mismo. */
export function restarMeses(mes: string, n: number): string {
  return sumarMeses(mes, -n);
}

/**
 * Los rangos que tienen sentido con estos datos, del más corto al más largo.
 *
 * Siempre acaba en «Todo el histórico», que es el que no puede mentir: cuando
 * los demás recortan, ése enseña lo que hay.
 */
export function rangosDisponibles(movimientos: readonly MovimientoVista[]): Rango[] {
  const fin = anclaje(movimientos);
  const ini = origen(movimientos);
  if (!fin || !ini) return [];

  const disponibles: Rango[] = [];
  const abarca = (desde: string) => desde > ini;

  for (const clave of ['3m', '6m', '12m'] as const) {
    const desde = restarMeses(fin, MESES[clave] - 1);
    // Sólo si recorta algo. Si no, es otro nombre para «todo».
    if (abarca(desde)) {
      disponibles.push({ clave, etiqueta: `Últimos ${MESES[clave]} meses`, desde });
    }
  }

  const anio = fin.slice(0, 4);
  const eneroDelAncla = `${anio}-01`;
  if (abarca(eneroDelAncla)) {
    disponibles.push({ clave: 'anio', etiqueta: `Año ${anio}`, desde: eneroDelAncla });
  }

  disponibles.push({ clave: 'todo', etiqueta: 'Todo el histórico', desde: null });
  return disponibles;
}

/** Los movimientos dentro del rango. Sin `desde`, todos. */
export function aplicar(
  movimientos: readonly MovimientoVista[],
  rango: Rango | null,
): MovimientoVista[] {
  const lista = [...movimientos];
  if (!rango?.desde) return lista;
  return lista.filter((m) => mesDe(m.fecha) >= rango.desde!);
}

/**
 * Qué periodo se está mirando, en palabras: «jun 2025 – may 2026».
 *
 * Va junto al desplegable porque «últimos 6 meses» no dice cuáles son cuando
 * los datos no llegan hasta hoy, que es justo el caso en el que uno se
 * confunde.
 */
export function periodoDe(movimientos: readonly MovimientoVista[]): string | null {
  const ini = origen(movimientos);
  const fin = anclaje(movimientos);
  if (!ini || !fin) return null;
  return ini === fin ? nombreCorto(ini) : `${nombreCorto(ini)} – ${nombreCorto(fin)}`;
}

const CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function nombreCorto(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${CORTOS[m - 1]} ${a}`;
}

/** Los bancos presentes, ordenados. Los movimientos sin banco quedan fuera. */
export function bancosDe(movimientos: readonly MovimientoVista[]): string[] {
  const vistos = new Set<string>();
  for (const m of movimientos) if (m.banco) vistos.add(m.banco);
  return [...vistos].sort();
}

/** Cuántos movimientos vienen de un extracto cuyo banco nadie ha dicho. */
export function sinBanco(movimientos: readonly MovimientoVista[]): number {
  return movimientos.filter((m) => !m.banco).length;
}
