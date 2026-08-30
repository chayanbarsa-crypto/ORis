/**
 * El detalle que hay detrás de cada cifra del resumen.
 *
 * Un KPI contesta «cuánto». Al abrirlo la pregunta es siempre otra: «cuánto
 * **de qué**, y comparado con qué». Este módulo produce esas dos respuestas, y
 * nada más — funciones puras sobre los mismos movimientos que alimentan el
 * resumen, para que el detalle no pueda contradecir a la cifra que lo abrió.
 *
 * Dos decisiones que conviene conocer antes de leer una pantalla que salga de
 * aquí:
 *
 * **1. Los ingresos se agrupan por una raíz del concepto, y eso es una
 * heurística.** Un gasto trae categoría; un ingreso no. Lo único que hay para
 * distinguir la nómina del alquiler cobrado es el texto del banco, lleno de
 * prefijos («TRANSFERENCIA DE», «BIZUM DE») y de referencias
 * («0012938471-CJ»). `raizConcepto` los quita y se queda con lo que suele ser
 * el nombre de quien paga. Acertará casi siempre y fallará alguna vez: por eso
 * agrupa **para leer**, y los totales salen siempre de los movimientos, no de
 * los grupos.
 *
 * **2. La comparación es con el mes anterior de verdad.** Si ese mes no está
 * cargado, no se compara: no hay diferencia entre «gastaste cero» y «no
 * tenemos ese mes», y presentar lo segundo como lo primero convierte un hueco
 * de datos en una caída del 100 %.
 */

import { CATEGORIA_TRASPASO, SIN_CATEGORIZAR, type MovimientoVista } from './agregados';
import { aCentimos, mesDe, type Centimos } from './dinero';

export { SIN_CATEGORIZAR };

export interface LineaDetalle {
  clave: string;
  total: Centimos;
  movimientos: number;
  /** Fracción sobre el total del bloque, 0–1. */
  proporcion: number;
}

/**
 * Palabras que el banco pone delante y que no identifican a nadie.
 *
 * No se tocan las que sí dicen algo por sí solas —NOMINA, PENSION,
 * DEVOLUCION—: si se quitaran, una nómina sin nombre de empresa se quedaría
 * sin raíz y caería en el cajón de «Otros».
 */
const RUIDO = new Set([
  'TRANSFERENCIA', 'TRANSF', 'TRASPASO', 'RECIBIDA', 'RECIBIDO', 'EMITIDA',
  'BIZUM', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'A', 'AL', 'POR', 'CON',
  'RECIBO', 'ADEUDO', 'DOMICILIACION', 'PAGO', 'COMPRA', 'TARJETA', 'TARJ',
  'ABONO', 'INGRESO', 'MOVIMIENTO', 'OPERACION', 'CONCEPTO', 'REF', 'REFERENCIA',
  'SU', 'FAVOR', 'CTA', 'CUENTA', 'ENVIO', 'RECIBIDOS',
  // Verbos y coletillas que trae el extracto de empresa: «Cargo por
  // amortización…», «Transferencia realizada ALQUILER…», «Www.reservas.example».
  // Sin ellos la raíz empieza en «Cargo» o «Realizada», que es lo único que
  // NO distingue a un movimiento de otro.
  'CARGO', 'CARGOS', 'REALIZADA', 'REALIZADO', 'WWW',
]);

/**
 * Marcadores tras los cuales ya no hay nombre, sólo datos de máquina.
 *
 * Van aparte del ruido porque no se quitan: **cortan**. «Acme S.L. ref 00129»
 * con REF sólo tachada daría «Acme Ref»; cortando en REF da «Acme», que es lo
 * que uno reconocería. Y como cortan en vez de tachar, no pueden fundir dos
 * nombres distintos como haría quitar palabras del medio.
 */
const CORTE = new Set(['REF', 'REFERENCIA', 'MANDATO', 'CONCEPTO', 'NUM', 'NUMERO']);

/** Quita tildes y pasa a mayúsculas: «Nómina» y «NOMINA» son lo mismo. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Una referencia bancaria: casi todo dígitos, o un código largo sin vocales. */
function esReferencia(token: string): boolean {
  const digitos = (token.match(/\d/g) ?? []).length;
  if (digitos >= 3) return true;
  if (digitos > 0 && digitos >= token.length / 2) return true;
  return token.length >= 6 && !/[AEIOU]/.test(token);
}

/**
 * El nombre de quien está detrás de un movimiento, sacado del concepto.
 *
 * Devuelve cadena vacía cuando no queda nada legible; quien llame decide qué
 * hacer con eso. Devolver el concepto crudo sería peor: agruparía cada
 * transferencia bajo su propia referencia y daría cien grupos de uno.
 */
export function raizConcepto(concepto: string, palabras = 3): string {
  const tokens = normalizar(concepto)
    .split(/[^A-ZÑ0-9]+/)
    .filter(Boolean)
    .filter((t) => !esReferencia(t));

  // El ruido sólo se quita por delante. Quitarlo en medio uniría «PEDRO DE LA
  // FUENTE» con «PEDRO FUENTES», que son dos personas distintas.
  let i = 0;
  while (i < tokens.length && RUIDO.has(tokens[i])) i++;

  const corte = tokens.findIndex((t, j) => j >= i && CORTE.has(t));
  const cuerpo = corte === -1 ? tokens.slice(i) : tokens.slice(i, corte);
  const utiles = cuerpo.filter((t) => t.length > 1);
  if (utiles.length === 0) return '';

  return utiles
    .slice(0, palabras)
    .map((t) => t[0] + t.slice(1).toLowerCase())
    .join(' ');
}

const OTROS = 'Otros';

function agrupar(
  entradas: readonly { clave: string; centimos: Centimos }[],
): LineaDetalle[] {
  const mapa = new Map<string, { total: Centimos; n: number }>();
  let total = 0;

  for (const e of entradas) {
    const previo = mapa.get(e.clave) ?? { total: 0, n: 0 };
    previo.total += e.centimos;
    previo.n += 1;
    mapa.set(e.clave, previo);
    total += e.centimos;
  }

  return [...mapa.entries()]
    .map(([clave, v]) => ({
      clave,
      total: v.total,
      movimientos: v.n,
      proporcion: total > 0 ? v.total / total : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

const delMes = (m: MovimientoVista, mes: string) => mesDe(m.fecha) === mes;

/** De dónde viene el dinero que entra, agrupado por la raíz del concepto. */
export function ingresosPorOrigen(
  movimientos: readonly MovimientoVista[],
  mes: string,
): LineaDetalle[] {
  const entradas: { clave: string; centimos: Centimos }[] = [];

  for (const m of movimientos) {
    if (!delMes(m, mes)) continue;
    if (m.categoria === CATEGORIA_TRASPASO) continue;
    const c = aCentimos(m.importe);
    if (c === null || c <= 0) continue;
    entradas.push({ clave: raizConcepto(m.concepto) || OTROS, centimos: c });
  }

  return agrupar(entradas);
}

/**
 * Los movimientos más grandes del mes, del signo pedido.
 *
 * Sirve para una pregunta muy concreta —«¿qué se llevó el dinero?»— que el
 * desglose por categoría no responde: una categoría de 900 € puede ser una
 * compra o treinta cafés, y la decisión que se toma no es la misma.
 */
export function mayores(
  movimientos: readonly MovimientoVista[],
  mes: string,
  tipo: 'ingreso' | 'gasto',
  cuantos = 5,
): MovimientoVista[] {
  return movimientos
    .filter((m) => {
      if (!delMes(m, mes)) return false;
      if (m.categoria === CATEGORIA_TRASPASO) return false;
      const c = aCentimos(m.importe);
      if (c === null || c === 0) return false;
      return tipo === 'ingreso' ? c > 0 : c < 0;
    })
    .sort((a, b) => Math.abs(aCentimos(b.importe) ?? 0) - Math.abs(aCentimos(a.importe) ?? 0))
    .slice(0, cuantos);
}

export interface Traspasos {
  /** Lo que ha llegado desde otra cuenta propia. */
  entradas: Centimos;
  /** Lo que ha salido hacia otra cuenta propia, en positivo. */
  salidas: Centimos;
  lista: MovimientoVista[];
}

/**
 * Los traspasos del mes, separados por sentido.
 *
 * Si entradas y salidas cuadran, el dinero sólo cambió de sitio. Si no cuadran
 * —lo normal cuando la otra cuenta no está cargada— la diferencia no es un
 * beneficio ni una pérdida: es la parte del viaje que no vemos.
 */
export function traspasosDelMes(
  movimientos: readonly MovimientoVista[],
  mes: string,
): Traspasos {
  let entradas = 0;
  let salidas = 0;
  const lista: MovimientoVista[] = [];

  for (const m of movimientos) {
    if (!delMes(m, mes)) continue;
    if (m.categoria !== CATEGORIA_TRASPASO) continue;
    const c = aCentimos(m.importe);
    if (c === null) continue;
    if (c >= 0) entradas += c;
    else salidas += -c;
    lista.push(m);
  }

  lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return { entradas, salidas, lista };
}

/** «2026-01» -> «2025-12». */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

export interface Variacion {
  mes: string;
  anterior: Centimos;
  actual: Centimos;
  diferencia: Centimos;
  /** Fracción sobre el mes anterior. `null` si el anterior era cero. */
  relativa: number | null;
}

/**
 * Comparación con el mes anterior, o `null` si ese mes no está cargado.
 *
 * `medida` recibe los movimientos de un mes y devuelve la cifra a comparar, de
 * modo que ingresos, gastos y neto se comparan con el mismo código y no pueden
 * divergir en el redondeo ni en qué se excluye.
 */
export function compararConAnterior(
  movimientos: readonly MovimientoVista[],
  mes: string,
  medida: (movs: readonly MovimientoVista[]) => Centimos,
): Variacion | null {
  const previo = mesAnterior(mes);
  const movsPrevios = movimientos.filter((m) => delMes(m, previo));
  if (movsPrevios.length === 0) return null;

  const anterior = medida(movsPrevios);
  const actual = medida(movimientos.filter((m) => delMes(m, mes)));
  return {
    mes: previo,
    anterior,
    actual,
    diferencia: actual - anterior,
    relativa: anterior === 0 ? null : (actual - anterior) / Math.abs(anterior),
  };
}

/** Ingresos del conjunto, sin traspasos. Pensada para `compararConAnterior`. */
export function medidaIngresos(movs: readonly MovimientoVista[]): Centimos {
  return sumaSi(movs, (c) => c > 0, false);
}

/** Gastos en positivo, sin traspasos. */
export function medidaGastos(movs: readonly MovimientoVista[]): Centimos {
  return sumaSi(movs, (c) => c < 0, true);
}

/** Ingresos − gastos. */
export function medidaNeto(movs: readonly MovimientoVista[]): Centimos {
  return medidaIngresos(movs) - medidaGastos(movs);
}

function sumaSi(
  movs: readonly MovimientoVista[],
  filtro: (c: Centimos) => boolean,
  enPositivo: boolean,
): Centimos {
  let total = 0;
  for (const m of movs) {
    if (m.categoria === CATEGORIA_TRASPASO) continue;
    const c = aCentimos(m.importe);
    if (c === null || !filtro(c)) continue;
    total += enPositivo ? Math.abs(c) : c;
  }
  return total;
}

/**
 * Qué parte de lo que entra no se gasta, 0–1.
 *
 * `null` cuando no entró nada: dividir entre cero daría infinito, y decir
 * «−∞ % de ahorro» en un mes sin ingresos no informa de nada.
 */
export function tasaDeAhorro(ingresos: Centimos, neto: Centimos): number | null {
  if (ingresos <= 0) return null;
  return neto / ingresos;
}

export interface Cobertura {
  /** Día del mes del primer movimiento, 1–31. */
  desde: number;
  hasta: number;
  /** Días entre ambos, extremos incluidos. Nunca cero. */
  dias: number;
}

/**
 * Qué tramo del mes cubren realmente los datos.
 *
 * Hace falta para dar una media diaria sin mentir. Dividir el gasto entre 30
 * cuando el extracto llega al día 12 rebaja la media a la mitad, y justo en el
 * mes en curso —el único en el que uno mira la media para decidir algo—. Se
 * mide sobre los movimientos y no sobre el calendario ni sobre el reloj del
 * navegador, que además daría un render distinto en servidor y en cliente.
 */
export function cobertura(
  movimientos: readonly MovimientoVista[],
  mes: string,
): Cobertura | null {
  const dias = movimientos
    .filter((m) => delMes(m, mes))
    .map((m) => Number(m.fecha.slice(8, 10)))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);
  if (dias.length === 0) return null;

  const desde = Math.min(...dias);
  const hasta = Math.max(...dias);
  return { desde, hasta, dias: hasta - desde + 1 };
}
