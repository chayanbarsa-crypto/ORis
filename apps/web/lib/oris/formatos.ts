/**
 * Qué formatos entiende ORis, y cuál es el camino de cada uno.
 *
 * La decisión de fondo, y es de coste y de exactitud a la vez:
 *
 * - **PDF → modelo.** No hay alternativa: las cifras están maquetadas en
 *   columnas y hay que *ver* cuál es cuál. Cuesta una llamada y tarda minutos.
 * - **CSV / Excel → código.** Los números ya vienen separados y exactos. Pasar
 *   por el modelo sería pagar por meter la posibilidad de un error donde no la
 *   había. Tarda milisegundos y no cuesta nada.
 *
 * De ahí que, si tu banco ofrece las dos descargas, el Excel sea la mejor
 * opción — no la peor, como sugiere el hecho de que el PDF sea el formato
 * «oficial».
 */

import { detectarBanco } from './bancos';
import { aCentimos, type Centimos } from './dinero';
import { leerExcel } from './excel';
import { ErrorTabular, filasAMovimientos, leerCSV } from './tabular';
import type { Extraccion } from './validacion';

export type Formato = 'pdf' | 'csv' | 'excel';

const POR_EXTENSION: Record<string, Formato> = {
  pdf: 'pdf',
  csv: 'csv',
  tsv: 'csv',
  txt: 'csv',
  xlsx: 'excel',
  xlsm: 'excel',
  xls: 'excel',
};

/** Lo que acepta el selector de ficheros del navegador. */
export const ACEPTADOS =
  '.pdf,.csv,.tsv,.txt,.xlsx,.xlsm,.xls,application/pdf,text/csv,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function formatoDe(nombre: string): Formato | null {
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  return POR_EXTENSION[ext] ?? null;
}

/**
 * Lee un extracto tabular y lo deja en la misma forma que devuelve el modelo.
 *
 * Los saldos inicial y final no vienen declarados en un CSV, así que se deducen
 * de la columna de saldo corrido **cuando la hay**: el saldo anterior al primer
 * movimiento y el del último. Es deducción, no invención — sale de cifras que
 * el banco escribió.
 *
 * Si no hay columna de saldo se devuelven `null` y la validación lo dirá:
 * declarará el cuadre «no evaluable» en vez de darlo por bueno. Un saldo
 * inventado a partir de los movimientos haría que el cuadre saliera siempre,
 * que es exactamente lo contrario de comprobar algo.
 */
export async function leerTabular(
  datos: Uint8Array,
  formato: Exclude<Formato, 'pdf'>,
  nombreFichero = '',
): Promise<Extraccion> {
  const filas =
    formato === 'excel'
      ? await leerExcel(datos)
      : leerCSV(new TextDecoder('utf-8').decode(datos));

  if (filas.length === 0) throw new ErrorTabular('El fichero está vacío.');

  const { movimientos, preambulo } = filasAMovimientos(filas);

  const conSaldo = movimientos.filter((m) => m.saldo !== null);
  let saldoInicial: string | null = null;
  let saldoFinal: string | null = null;

  if (conSaldo.length === movimientos.length && movimientos.length > 0) {
    const primero = movimientos[0];
    const saldo = aCentimos(primero.saldo);
    const importe = aCentimos(primero.importe);
    if (saldo !== null && importe !== null) {
      // En céntimos enteros, como todo el dinero de ORis. Restar en coma
      // flotante aquí metería el error justo en el número contra el que
      // después se comprueba el cuadre.
      saldoInicial = aTexto(saldo - importe);
      saldoFinal = movimientos[movimientos.length - 1].saldo;
    }
  }

  const fechas = movimientos.map((m) => m.fecha).sort();

  return {
    // El banco no viene en un campo: se reconoce en lo que el fichero sí trae
    // —lo que el banco firma antes de la tabla— y en el nombre del fichero.
    banco: detectarBanco(preambulo, nombreFichero),
    iban: null,
    periodo_inicio: fechas[0] ?? null,
    periodo_fin: fechas[fechas.length - 1] ?? null,
    saldo_inicial: saldoInicial,
    saldo_final: saldoFinal,
    movimientos,
    paginas_ilegibles: [],
  };
}

/** Céntimos a la forma canónica «-1234.56», con aritmética entera. */
function aTexto(centimos: Centimos): string {
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
