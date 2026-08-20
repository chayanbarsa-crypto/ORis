/**
 * Lectura de extractos en Excel.
 *
 * Separado de `tabular.ts` a propósito: aquel es lógica pura y se prueba sin
 * nada, éste depende de una librería y sólo corre en el servidor. La conversión
 * de celdas a movimientos es la misma para CSV y para Excel — lo único que
 * cambia es cómo se llega a la rejilla.
 */

import ExcelJS from 'exceljs';

import { ErrorTabular, type Fila } from './tabular';

/** Hojas que no son el extracto y que algunos bancos añaden delante. */
const HOJAS_IGNORADAS = /^(instrucciones|leyenda|ayuda|info|portada)/i;

export async function leerExcel(datos: Uint8Array): Promise<Fila[]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(Buffer.from(datos) as unknown as ArrayBuffer);
  } catch {
    throw new ErrorTabular(
      'No pude abrir ese fichero como Excel.',
      'Si tu banco te lo dio como .xls antiguo, ábrelo y guárdalo como .xlsx o como CSV.',
    );
  }

  const hoja =
    libro.worksheets.find((h) => !HOJAS_IGNORADAS.test(h.name)) ?? libro.worksheets[0];

  if (!hoja) throw new ErrorTabular('El libro de Excel no tiene ninguna hoja.');

  const filas: Fila[] = [];
  hoja.eachRow({ includeEmpty: true }, (fila) => {
    const celdas: Fila = [];
    // `cellCount` en vez de `values`: así las columnas vacías cuentan y los
    // índices siguen cuadrando con los de la cabecera.
    for (let c = 1; c <= hoja.columnCount; c++) {
      celdas.push(valorDeCelda(fila.getCell(c).value));
    }
    filas.push(celdas);
  });

  return filas;
}

/**
 * Reduce el valor de una celda a texto, número o nada.
 *
 * ExcelJS devuelve objetos para fórmulas, hipervínculos y texto con formato.
 * Lo importante aquí: **una fórmula se lee por su resultado**, porque el saldo
 * corrido de un extracto en Excel suele ser `=D5+E6` y su fórmula no es un
 * número. Y una fecha se devuelve en ISO, que es lo que `fechaCanonica` espera.
 */
function valorDeCelda(valor: unknown): string | number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number') return valor;
  if (typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  const v = valor as Record<string, unknown>;
  if ('result' in v) return valorDeCelda(v.result);
  if ('text' in v) return valorDeCelda(v.text);
  if ('richText' in v && Array.isArray(v.richText)) {
    return v.richText.map((t) => (t as { text?: string }).text ?? '').join('');
  }
  if ('error' in v) return null;

  return null;
}
