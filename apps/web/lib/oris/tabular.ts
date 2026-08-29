/**
 * Extractos que vienen ya en tabla: CSV, Excel, TSV.
 *
 * **Aquí no interviene el modelo.** Un CSV o un XLSX ya trae las cifras
 * separadas y exactas; pedirle a un modelo que las transcriba sería pagar por
 * introducir la posibilidad de un error donde no la había. El modelo hace falta
 * para un PDF —hay que *ver* la maquetación en columnas— y para nada más.
 *
 * Lo que sí varía de un banco a otro es cómo se llaman las columnas, cuántas
 * filas de cabecera hay antes de los datos y en qué formato van las fechas. Eso
 * se resuelve con heurísticas sobre los nombres de columna, y lo que no encaje
 * se rechaza diciendo qué falta — nunca adivinando.
 *
 * El dinero se lee con el mismo cuidado que en el resto de ORis: «2.326,96» son
 * dos mil trescientos veintiséis con noventa y seis, y `parseFloat` de esa
 * cadena da 2,32. Ese formato existe de verdad en el extracto de Jordy.
 */

import type { MovimientoExtraido } from './validacion';

/** Lo que puede traer una celda. `Date` llega desde Excel, no desde CSV. */
export type Celda = string | number | Date | null;
export type Fila = Celda[];

/** Nombres con los que los bancos españoles bautizan cada columna. */
const SINONIMOS = {
  fecha: ['fecha', 'fecha operacion', 'f operacion', 'fecha de operacion', 'date', 'data'],
  fechaValor: ['fecha valor', 'f valor', 'valor', 'value date'],
  concepto: [
    'concepto',
    'descripcion',
    'detalle',
    'movimiento',
    'observaciones',
    'referencia',
    'description',
    'concepte',
  ],
  importe: ['importe', 'cantidad', 'euros', 'amount', 'import'],
  saldo: ['saldo', 'saldo posterior', 'balance', 'saldo disponible'],
  debe: ['debe', 'cargo', 'cargos', 'salida', 'salidas', 'pagos', 'debit'],
  haber: ['haber', 'abono', 'abonos', 'entrada', 'entradas', 'ingresos', 'credit'],
} as const;

/**
 * Cómo se llama la fila de totales según el banco.
 *
 * Es una lista explícita a propósito. Lo que no esté aquí y traiga dinero sin
 * fecha se reporta en vez de descartarse: prefiero pararme ante una fila rara a
 * tragármela y descuadrar el extracto.
 */
const ETIQUETAS_DE_PIE = /^(total|totales|suma|sumas|resumen|saldo final|saldo anterior)\b/;

export class ErrorTabular extends Error {
  constructor(
    message: string,
    readonly sugerencia = '',
  ) {
    super(message);
    this.name = 'ErrorTabular';
  }
}

function normalizar(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function texto(c: Celda): string {
  if (c === null || c === undefined) return '';
  return String(c).trim();
}

/**
 * Convierte un importe escrito por un banco a la forma canónica «-1234.56».
 *
 * Cubre los tres formatos que aparecen de verdad: «1.234,56» (España),
 * «1,234.56» (anglosajón) y «1234.56». La regla para decidir cuál es cuál: el
 * separador decimal es el ÚLTIMO que aparece, y el otro es de miles.
 *
 * Devuelve null si no reconoce el número, y eso acaba siendo un rechazo — no un
 * cero, que sumaría perfectamente y estaría mal.
 */
export function importeCanonico(valor: Celda): string | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor.toFixed(2) : null;
  }

  let s = texto(valor);
  if (!s) return null;

  // Paréntesis contables: (1.234,56) es negativo.
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }

  s = s.replace(/[€$£\s ]/g, '');
  if (s.startsWith('-')) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negativo = true;
    s = s.slice(0, -1);
  }

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  let entero: string;
  let decimales: string;

  if (ultimaComa === -1 && ultimoPunto === -1) {
    entero = s;
    decimales = '00';
  } else {
    const corte = Math.max(ultimaComa, ultimoPunto);
    const cola = s.slice(corte + 1);
    // Tres cifras detrás del último separador y ningún otro separador delante:
    // es un millar, no decimales. «1.234» son mil doscientos treinta y cuatro.
    const esMillar = cola.length === 3 && s.slice(0, corte).indexOf(corte === ultimaComa ? '.' : ',') === -1 && !/[.,]/.test(s.slice(0, corte));
    if (esMillar) {
      entero = s.replace(/[.,]/g, '');
      decimales = '00';
    } else {
      entero = s.slice(0, corte).replace(/[.,]/g, '');
      decimales = cola.replace(/\D/g, '');
    }
  }

  if (entero === '') entero = '0';
  if (!/^\d+$/.test(entero)) return null;
  decimales = (decimales + '00').slice(0, 2);

  const n = `${entero}.${decimales}`;
  return negativo && Number(n) !== 0 ? `-${n}` : n;
}

/**
 * Fechas a AAAA-MM-DD.
 *
 * Ante «03/04/2026» se asume día/mes/año, que es lo que usan los bancos
 * españoles. Es una suposición y por eso está escrita aquí: en un extracto de
 * un banco estadounidense daría marzo en vez de abril.
 */
export function fechaCanonica(valor: Celda): string | null {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  const s = texto(valor);
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const partes = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (partes) {
    const dia = partes[1].padStart(2, '0');
    const mes = partes[2].padStart(2, '0');
    let anio = partes[3];
    if (anio.length === 2) anio = `20${anio}`;
    return `${anio}-${mes}-${dia}`;
  }

  return null;
}

interface Mapeo {
  fecha: number;
  fechaValor: number;
  concepto: number;
  importe: number;
  debe: number;
  haber: number;
  saldo: number;
  filaCabecera: number;
}

/**
 * Encuentra la fila de cabecera y a qué corresponde cada columna.
 *
 * La cabecera no es siempre la primera fila: los extractos en Excel suelen
 * traer el nombre del banco, el titular y el periodo antes de la tabla. Se
 * busca la primera fila que contenga a la vez algo que parezca fecha y algo que
 * parezca concepto.
 */
export function mapearColumnas(filas: readonly Fila[]): Mapeo {
  const buscar = (celdas: string[], claves: readonly string[]) =>
    celdas.findIndex((c) => claves.some((k) => c === k || c.startsWith(k)));

  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const celdas = filas[i].map((c) => normalizar(texto(c)));

    const fecha = buscar(celdas, SINONIMOS.fecha);
    const concepto = buscar(celdas, SINONIMOS.concepto);
    if (fecha === -1 || concepto === -1) continue;

    const importe = buscar(celdas, SINONIMOS.importe);
    const debe = buscar(celdas, SINONIMOS.debe);
    const haber = buscar(celdas, SINONIMOS.haber);

    if (importe === -1 && (debe === -1 || haber === -1)) continue;

    return {
      fecha,
      fechaValor: buscar(celdas, SINONIMOS.fechaValor),
      concepto,
      importe,
      debe,
      haber,
      saldo: buscar(celdas, SINONIMOS.saldo),
      filaCabecera: i,
    };
  }

  throw new ErrorTabular(
    'No encuentro la cabecera de la tabla en ese fichero.',
    'Hacen falta una columna de fecha, una de concepto y una de importe ' +
      '(o dos columnas de cargo y abono).',
  );
}

/**
 * De una rejilla de celdas a movimientos.
 *
 * Sólo se descartan en silencio las filas cuyas celdas de fecha e importe
 * están *vacías*: los pies de página y las líneas de totales. Una celda escrita
 * que no se entiende aborta la lectura entera, porque saltársela sería perder
 * un movimiento y descuadrar el extracto sin dejar rastro de por qué.
 */
export function filasAMovimientos(filas: readonly Fila[]): {
  movimientos: MovimientoExtraido[];
  descartadas: number;
  /** Lo que hay antes de la cabecera: donde el banco suele firmar. */
  preambulo: string[];
} {
  const mapa = mapearColumnas(filas);
  const movimientos: MovimientoExtraido[] = [];
  const problemas: string[] = [];
  let descartadas = 0;

  for (let i = mapa.filaCabecera + 1; i < filas.length; i++) {
    const fila = filas[i];
    const vacia = fila.every((c) => texto(c) === '');
    if (vacia) continue;

    const fecha = fechaCanonica(fila[mapa.fecha]);
    const concepto = texto(fila[mapa.concepto]);

    let importe: string | null = null;
    if (mapa.importe !== -1) {
      importe = importeCanonico(fila[mapa.importe]);
    } else {
      // Dos columnas: el signo lo decide la columna, no el número. Lo que está
      // en «debe» va en negativo aunque venga impreso sin signo.
      const debe = importeCanonico(fila[mapa.debe]);
      const haber = importeCanonico(fila[mapa.haber]);
      if (debe && Number(debe) !== 0) importe = debe.startsWith('-') ? debe : `-${debe}`;
      else if (haber && Number(haber) !== 0) importe = haber.replace(/^-/, '');
      else if (debe || haber) importe = '0.00';
    }

    if (!fecha) {
      // La fecha es lo que convierte una fila en un movimiento. Sin ella puede
      // ser el pie del banco o la fila de totales — que en un Excel **sí trae
      // números** en las columnas de cargos y abonos, así que mirar si el
      // importe está vacío no basta para reconocerla.
      const celdaFecha = texto(fila[mapa.fecha]);
      const etiqueta = normalizar(concepto);

      if (celdaFecha === '' && (ETIQUETAS_DE_PIE.test(etiqueta) || importe === null)) {
        descartadas++;
        continue;
      }

      // Una fila con dinero y sin fecha que no se llama «Total» no se descarta:
      // podría ser un movimiento con la fecha en un formato que no entiendo, y
      // perderlo descuadraría el extracto sin dejar rastro de por qué.
      problemas.push(`fila ${i + 1}: «${concepto || celdaFecha || texto(fila[mapa.importe])}»`);
      continue;
    }

    if (importe === null) {
      // Con fecha pero sin importe legible sí es un movimiento perdido seguro.
      problemas.push(`fila ${i + 1}: «${concepto}» sin importe legible`);
      continue;
    }

    movimientos.push({
      fecha,
      fecha_valor: mapa.fechaValor === -1 ? null : fechaCanonica(fila[mapa.fechaValor]),
      concepto,
      importe,
      saldo: mapa.saldo === -1 ? null : importeCanonico(fila[mapa.saldo]),
    });
  }

  // Muchos bancos exportan el más reciente primero. Nada de lo que viene
  // después funciona con ese orden: la cadena de saldos se rompe en cada paso y
  // el orden cronológico salta en todas las filas. Se detecta comparando la
  // primera fecha con la última — no fila a fila, porque dentro de un mismo día
  // el orden es arbitrario y unas cuantas inversiones locales son normales.
  if (movimientos.length > 1 && movimientos[0].fecha > movimientos[movimientos.length - 1].fecha) {
    movimientos.reverse();
  }

  if (problemas.length > 0) {
    throw new ErrorTabular(
      `No pude leer ${problemas.length} fila(s) con datos: ${problemas.slice(0, 3).join('; ')}.`,
      'Perder una fila descuadraría el extracto, así que prefiero no guardar nada.',
    );
  }

  if (movimientos.length === 0) {
    throw new ErrorTabular('La tabla no trae ningún movimiento legible.');
  }

  const preambulo = filas
    .slice(0, mapa.filaCabecera)
    .map((f) => f.map(texto).filter(Boolean).join(' '))
    .filter(Boolean);

  return { movimientos, descartadas, preambulo };
}

/**
 * Lector de CSV con comillas, saltos de línea dentro de campo y separador
 * autodetectado.
 *
 * Sin dependencia porque un CSV bancario no necesita más que esto, y un
 * `split(',')` se rompe con el primer concepto que lleve una coma dentro —
 * «TRANSFERENCIA A GARCIA, LAURA» es de lo más normal.
 */
export function leerCSV(texto: string): Fila[] {
  const sin = texto.replace(/^﻿/, '');
  const sep = detectarSeparador(sin);

  const filas: Fila[] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < sin.length; i++) {
    const c = sin[i];

    if (entreComillas) {
      if (c === '"') {
        if (sin[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreComillas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') entreComillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') campo += c;
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas;
}

function detectarSeparador(texto: string): string {
  const muestra = texto.split('\n').slice(0, 10).join('\n');
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ';';
  let max = -1;
  for (const c of candidatos) {
    const n = muestra.split(c).length - 1;
    if (n > max) {
      max = n;
      mejor = c;
    }
  }
  return mejor;
}
