/**
 * El mes leído como negocio, no como cuenta corriente.
 *
 * `agregados.ts` contesta «cuánto entró y cuánto salió». Para una pyme esa
 * pregunta no basta: dos meses con el mismo neto pueden ser uno bueno y uno
 * malo. Lo que decide cuál es cuál es **de qué está hecho el gasto**.
 *
 * De ahí que aquí el gasto se parta en dos, con la partición que hace
 * `recurrencia.ts`:
 *
 *   estructura   lo que se paga tanto si abres como si no
 *   variable     lo que sube y baja con la actividad
 *
 * Y de esa partición salen las tres cifras que un autónomo mira antes que
 * ninguna otra:
 *
 *   **Cobertura.** Facturación dividida entre estructura. Por debajo de 1 el
 *   mes no ha pagado ni la persiana. Es más útil que el margen porque no se
 *   deja engañar por un mes sin compras.
 *
 *   **Punto de equilibrio en servicios.** La estructura dividida entre el cobro
 *   típico: cuántos clientes hacen falta para empezar a ganar. Un autónomo no
 *   piensa en euros de umbral, piensa en «cuántas manicuras».
 *
 *   **Peso de la estructura.** Qué parte de lo facturado se va antes de
 *   empezar. Es la cifra que dice si el problema es que se vende poco o que se
 *   paga mucho, y son dos problemas con soluciones opuestas.
 *
 * Nada de esto necesita que nadie haya categorizado un solo movimiento.
 */

import { CATEGORIA_TRASPASO, type MovimientoVista } from './agregados';
import { aCentimos, mesDe, mesesDe, type Centimos } from './dinero';
import { huellaCompromiso, huellasEstructurales, type Compromiso } from './recurrencia';

export interface LecturaMes {
  mes: string;
  /** Todo lo que entró que no sea un traspaso entre cuentas propias. */
  facturacion: Centimos;
  /** Cuántos ingresos la componen. */
  cobros: number;
  /**
   * El cobro del medio, en céntimos. `null` si no hubo ninguno.
   *
   * **La mediana, no la media.** Un ingreso en efectivo agrupa la caja de
   * varios días en un solo apunte: en el extracto de referencia, mil euros de
   * golpe conviviendo con cobros de once. La media de eso no es el precio de
   * nada —sale 53 € en un negocio cuyo servicio típico vale 20— y encima se
   * mueve entera según el día que el titular pase por la sucursal. La mediana
   * ignora los dos extremos y contesta a lo que se le pregunta.
   */
  cobroTipico: Centimos | null;
  /** Gasto que pertenece a un compromiso recurrente. Céntimos positivos. */
  estructura: Centimos;
  /** El resto del gasto. Céntimos positivos. */
  variable: Centimos;
  /** estructura + variable. */
  gasto: Centimos;
  /** facturacion − gasto. Con signo. */
  margen: Centimos;
  /** Movido entre cuentas propias. Ni ingreso ni gasto; se informa aparte. */
  traspasos: Centimos;
  /** Cuántos apuntes tuvo el mes, de cualquier signo. */
  movimientos: number;
  /** Saldo al cierre, si el extracto lo declara. `null` si no. */
  saldo: Centimos | null;
}

/** El mes visto desde fuera: los ratios que se leen de un vistazo. */
export interface Indicadores {
  /** facturacion / estructura. `null` sin estructura detectada. */
  cobertura: number | null;
  /** estructura / facturacion, 0–1. `null` sin facturación. */
  pesoEstructura: number | null;
  /** margen / facturacion. `null` sin facturación. */
  margenRelativo: number | null;
  /** Cuántos cobros típicos hacen falta para cubrir la estructura. */
  equilibrio: number | null;
  /** Cuántos cobros típicos faltaron o sobraron respecto del equilibrio. */
  distanciaAlEquilibrio: number | null;
}

function esTraspaso(m: MovimientoVista): boolean {
  return m.categoria === CATEGORIA_TRASPASO;
}

/** Mediana de una lista no vacía. Con par de elementos, el menor de los centrales. */
function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor((ordenados.length - 1) / 2)];
}

/**
 * Lee un mes.
 *
 * `compromisos` decide qué gasto es estructura. Sin ellos todo el gasto cae en
 * variable, que es lo correcto: **no detectar un compromiso no es lo mismo que
 * saber que no lo hay**, y repartir a ojo sería inventarse la mitad del panel.
 */
export function leerMes(
  movimientos: readonly MovimientoVista[],
  mes: string,
  compromisos: readonly Compromiso[] = [],
): LecturaMes {
  const estructurales = huellasEstructurales(compromisos);

  let facturacion = 0;
  let estructura = 0;
  let variable = 0;
  let traspasos = 0;
  let n = 0;
  const cobros: Centimos[] = [];

  for (const m of movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    const c = aCentimos(m.importe);
    if (c === null) continue;
    n++;

    if (esTraspaso(m)) {
      traspasos += Math.abs(c);
      continue;
    }
    if (c > 0) {
      facturacion += c;
      cobros.push(c);
      continue;
    }
    const salida = Math.abs(c);
    if (estructurales.has(huellaCompromiso(m.concepto))) estructura += salida;
    else variable += salida;
  }

  return {
    mes,
    facturacion,
    cobros: cobros.length,
    cobroTipico: cobros.length > 0 ? mediana(cobros) : null,
    estructura,
    variable,
    gasto: estructura + variable,
    margen: facturacion - estructura - variable,
    traspasos,
    movimientos: n,
    saldo: saldoAlCierre(movimientos, mes),
  };
}

/**
 * Un mes por cada mes entre el primero y el último con datos, del más antiguo
 * al más reciente.
 *
 * Los meses en blanco se rellenan con ceros por la misma razón que en
 * `series.serieMensual`: saltárselos junta marzo con junio y dibuja tres meses
 * de caída como si fueran uno.
 */
export function serieMensual(
  movimientos: readonly MovimientoVista[],
  compromisos: readonly Compromiso[] = [],
): LecturaMes[] {
  const meses = [...new Set(movimientos.map((m) => mesDe(m.fecha)))].sort();
  if (meses.length === 0) return [];
  return mesesDe(meses[0], meses[meses.length - 1]).map((mes) =>
    leerMes(movimientos, mes, compromisos),
  );
}

/**
 * Los ratios de una lectura. Ninguno se inventa cuando el divisor es cero.
 *
 * `cobroReferencia` es el cobro típico contra el que medir el equilibrio. Se
 * pasa el del periodo entero —`cobroTipicoGlobal`— siempre que se pueda: ver
 * ahí por qué el del propio mes no vale para esto.
 */
export function indicadores(l: LecturaMes, cobroReferencia?: Centimos | null): Indicadores {
  const cobro = cobroReferencia ?? l.cobroTipico;
  const equilibrio =
    cobro && cobro > 0 && l.estructura > 0 ? Math.ceil(l.estructura / cobro) : null;

  return {
    cobertura: l.estructura > 0 ? l.facturacion / l.estructura : null,
    pesoEstructura: l.facturacion > 0 ? l.estructura / l.facturacion : null,
    margenRelativo: l.facturacion > 0 ? l.margen / l.facturacion : null,
    equilibrio,
    distanciaAlEquilibrio: equilibrio !== null ? l.cobros - equilibrio : null,
  };
}

/**
 * El cobro típico de todo el periodo, no el de un mes.
 *
 * Es el que hay que usar para el punto de equilibrio de un mes flojo: con
 * cuatro cobros, la mediana del propio mes la fija cualquiera de ellos y el
 * umbral salta de sesenta servicios a veinte sin que haya cambiado el precio
 * de nada.
 */
export function cobroTipicoGlobal(movimientos: readonly MovimientoVista[]): Centimos | null {
  const cobros: Centimos[] = [];
  for (const m of movimientos) {
    if (esTraspaso(m)) continue;
    const c = aCentimos(m.importe);
    if (c !== null && c > 0) cobros.push(c);
  }
  return cobros.length > 0 ? mediana(cobros) : null;
}

/**
 * El saldo con el que se cierra un mes, si el extracto lo declara.
 *
 * Se queda con el apunte de fecha más alta y, dentro del mismo día, el de
 * `posicion` más alta: dos movimientos del día 31 dejan saldos distintos y
 * elegir el equivocado da una tesorería que no es la de nadie. Cuando el banco
 * no declara saldos, `null` — y quien pinte tendrá que decirlo en vez de poner
 * un cero, que se leería como «no te queda nada».
 */
export function saldoAlCierre(
  movimientos: readonly MovimientoVista[],
  mes?: string,
): Centimos | null {
  let mejor: MovimientoVista | null = null;

  for (const m of movimientos) {
    if (mes && mesDe(m.fecha) !== mes) continue;
    if (m.saldo == null || aCentimos(m.saldo) === null) continue;
    if (
      mejor === null ||
      m.fecha > mejor.fecha ||
      (m.fecha === mejor.fecha && (m.posicion ?? 0) >= (mejor.posicion ?? 0))
    ) {
      mejor = m;
    }
  }

  return mejor ? aCentimos(mejor.saldo) : null;
}

export interface Tesoreria {
  /** Suma de los saldos conocidos. `null` si ningún extracto declara saldo. */
  total: Centimos | null;
  /** Lo que hay en cada banco, para no sumar cajas que no se comunican. */
  porBanco: { banco: string; saldo: Centimos; fecha: string }[];
  /** Movimientos cuyo extracto no declara saldo: no cuentan y hay que decirlo. */
  sinSaldo: number;
}

/**
 * Cuánto hay ahora mismo, por banco y en total.
 *
 * **Se suma por banco, no en bruto.** Dos cuentas son dos cajas: el saldo total
 * vale para saber cuánto hay, y no vale para saber si una de ellas se está
 * vaciando. Sumar el último saldo de cada movimiento sin agrupar daría una
 * cifra sin significado — la suma de todos los saldos intermedios del extracto.
 *
 * El banco puede faltar (`bancos.ts` no siempre lo identifica). Los movimientos
 * sin banco se agrupan bajo una caja propia en vez de descartarse: descartarlos
 * enseñaría una tesorería menor que la real sin decir por qué.
 */
export function tesoreria(movimientos: readonly MovimientoVista[]): Tesoreria {
  const SIN_BANCO = 'Sin identificar';
  const porBanco = new Map<string, MovimientoVista>();
  let sinSaldo = 0;

  for (const m of movimientos) {
    if (m.saldo == null || aCentimos(m.saldo) === null) {
      sinSaldo++;
      continue;
    }
    const clave = m.banco ?? SIN_BANCO;
    const previo = porBanco.get(clave);
    if (
      !previo ||
      m.fecha > previo.fecha ||
      (m.fecha === previo.fecha && (m.posicion ?? 0) >= (previo.posicion ?? 0))
    ) {
      porBanco.set(clave, m);
    }
  }

  const cajas = [...porBanco.entries()]
    .map(([banco, m]) => ({ banco, saldo: aCentimos(m.saldo) ?? 0, fecha: m.fecha }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    total: cajas.length > 0 ? cajas.reduce((acc, c) => acc + c.saldo, 0) : null,
    porBanco: cajas,
    sinSaldo,
  };
}

/**
 * Cuántos días aguanta la caja al ritmo de salida de los últimos meses.
 *
 * El divisor es el **gasto**, no el neto: la pregunta es «si dejo de facturar
 * mañana, cuánto me queda», y es la que se hace cuando algo va mal. Con el neto
 * saldría infinito en cuanto un mes cerrara en positivo, que es justo cuando
 * nadie necesita la respuesta.
 *
 * `null` cuando no hay saldo conocido o cuando no hay gasto que dividir.
 */
export function diasDeCaja(saldo: Centimos | null, serie: readonly LecturaMes[]): number | null {
  if (saldo === null || saldo <= 0 || serie.length === 0) return null;
  const ultimos = serie.slice(-3);
  const gastoMensual = ultimos.reduce((acc, l) => acc + l.gasto, 0) / ultimos.length;
  if (gastoMensual <= 0) return null;
  return Math.round((saldo / gastoMensual) * 30);
}
