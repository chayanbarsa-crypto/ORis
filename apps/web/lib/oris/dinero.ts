/**
 * Aritmética de dinero en el navegador.
 *
 * Misma regla que en la base de datos y en el extractor: **el dinero nunca es
 * un `number` en euros**. Aquí se trabaja en **céntimos enteros**.
 *
 * Un `number` de JavaScript no representa 0,10 € exactamente, y el panel suma
 * decenas de movimientos para dar totales por categoría. `0.1 + 0.2` da
 * `0.30000000000000004`; noventa y dos sumas así producen un total que no
 * coincide con el del extracto, y el usuario ve un descuadre que no existe.
 *
 * Postgres devuelve `numeric(14,2)` como cadena («-42.10») precisamente para no
 * perderlo en el camino. Aquí se convierte a céntimos, se opera con enteros, y
 * sólo al pintar se vuelve a texto.
 */

/** Céntimos. Entero con signo: negativo = cargo. */
export type Centimos = number;

/** «-42.10» -> -4210. Devuelve null si la cadena no es un importe válido. */
export function aCentimos(importe: string | null | undefined): Centimos | null {
  if (importe == null) return null;
  const limpio = importe.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!m) return null;
  const [, signo, entero, decimales = '0'] = m;
  const cent = Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
  return signo === '-' ? -cent : cent;
}

/** Suma segura: los importes ilegibles se ignoran, no se convierten en cero. */
export function sumar(importes: readonly (string | null | undefined)[]): Centimos {
  let total = 0;
  for (const i of importes) {
    const c = aCentimos(i);
    if (c !== null) total += c;
  }
  return total;
}

/** -4210 -> «-42,10 €». Formato español: punto de miles, coma decimal. */
export function formatear(centimos: Centimos, opciones: { signo?: boolean } = {}): string {
  const negativo = centimos < 0;
  const abs = Math.abs(centimos);
  const euros = Math.trunc(abs / 100);
  const resto = String(abs % 100).padStart(2, '0');

  const conMiles = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const prefijo = negativo ? '−' : opciones.signo ? '+' : '';
  return `${prefijo}${conMiles},${resto} €`;
}

/** Para el atributo `datetime` y las comparaciones: «2026-05-01» -> mes «2026-05». */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «2026-05» -> «mayo de 2026». */
export function nombreMes(mes: string): string {
  const [anio, m] = mes.split('-');
  const indice = Number(m) - 1;
  return indice >= 0 && indice < 12 ? `${MESES[indice]} de ${anio}` : mes;
}
