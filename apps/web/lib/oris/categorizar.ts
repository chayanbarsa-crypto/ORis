/**
 * Categorización determinista, la misma que aplica `oris_core.categorias`.
 *
 * Las reglas vienen del contrato compartido, así que lo que se duplica aquí es
 * sólo el motor: normalizar el concepto y elegir la regla ganadora. La prueba
 * de que los dos motores coinciden está en `pruebas/categorizar.test.ts`, con
 * los mismos conceptos reales que usa el test de Python.
 *
 * Por qué normalizar antes de comparar: el banco escribe «Transacción con
 * tarjeta AHORRAMAS S.L. 4521». El comercio es AHORRAMAS. Sin reducirlo, cada
 * compra en el mismo sitio parece un comercio distinto —cambia la referencia— y
 * ninguna regla razonable acierta.
 *
 * Y una trampa que ya costó dos reglas muertas: **lo que se borra al normalizar
 * deja de existir para las reglas**. Por eso una regla puede pedir que se le
 * compare contra el texto crudo.
 */

import { CATEGORIA_TRASPASO, REGLAS_BASE, type ReglaCategorizacion } from './contratos';
import { aCentimos, type Centimos } from './dinero';
import type { MovimientoExtraido } from './validacion';

/** El tipo de operación no es el comercio. Ver la cabecera. */
const TIPOS =
  /^(TRANSACCION CON TARJETA|TRANSFERENCIA|OPERAR|RECIBO|ADEUDO|BIZUM|PAGO|COMPRA|CARGO|ABONO)\b\s*/;

/**
 * Coletillas del banco que no identifican a nadie.
 *
 * Regla general al tocar esto: si una regla depende de una palabra, esa palabra
 * no es ruido. `MARKUP` está deliberadamente fuera de esta lista — es lo único
 * que distingue una comisión de cambio de la compra que la originó.
 */
const RUIDO =
  /\b(EXCHANGE RATE ECB|INCOMING TRANSFER FROM|OUTGOING TRANSFER FOR|INTEREST PAYMENT|BUY TRADE|SELL TRADE|SAVINGS PLAN EXECUTION|DIVIDEND FOR ISIN|PENDING)\b/g;

const IBAN = /\bES\d{22}\b/g;
const ISIN = /\b[A-Z]{2}[0-9A-Z]{10}\b/g;

// «S.L.» se queda en «S L» al retirar los signos, y `\b(SL)\b` no casa con eso.
// De ahí que el patrón admita también la forma separada.
const FORMA_JURIDICA = /\b(S ?L ?U|S ?L|S ?A|SCA|CB|SCOOP)\b\s*$|\b(S ?L ?U|S ?L|S ?A|SCA|CB|SCOOP)\b/g;

/**
 * Reduce un concepto bancario a su raíz de comercio.
 *
 * «Transacción con tarjeta AHORRAMAS S.L. 4521» → «AHORRAMAS»
 */
export function normalizarConcepto(concepto: string): string {
  let t = concepto
    // NFKD + descartar lo no ASCII: quita tildes sin tocar las letras.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(TIPOS, '');
  t = t.replace(RUIDO, ' ');
  t = t.replace(IBAN, ' ');
  t = t.replace(ISIN, ' ');
  t = t.replace(/\b\d+\b/g, ' ');
  t = t.replace(/[^A-Z ]+/g, ' '); // antes de la forma jurídica, no después
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(FORMA_JURIDICA, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function casa(r: ReglaCategorizacion, raiz: string, crudo: string, importe: Centimos): boolean {
  if (r.signo === 'cargo' && importe >= 0) return false;
  if (r.signo === 'abono' && importe <= 0) return false;
  const texto = r.sobre === 'raiz' ? raiz : crudo.toUpperCase();
  return new RegExp(r.patron).test(texto);
}

export interface MovimientoCategorizado {
  categoria: string | null;
  /** `regla` cuando acertó una; `null` cuando ninguna casó. */
  origen: 'regla' | null;
}

export interface ResultadoCategorizacion {
  categorias: MovimientoCategorizado[];
  categorizados: number;
  sinCategorizar: number;
  traspasos: number;
}

/**
 * Aplica las reglas a una lista de movimientos.
 *
 * Devuelve una categoría por movimiento, en el mismo orden. Lo que ninguna
 * regla cubre se queda en `null` y se declara: son los que después revisa el
 * modelo o corriges tú. Adivinar una categoría para salir del paso convierte el
 * desglose del panel en una opinión disfrazada de dato.
 */
export function categorizar(
  movimientos: readonly MovimientoExtraido[],
  reglas: readonly ReglaCategorizacion[] = REGLAS_BASE,
): ResultadoCategorizacion {
  // El orden es parte del significado, así que se garantiza aquí en vez de
  // confiar en que quien llame pase la lista ya ordenada.
  const ordenadas = [...reglas].sort((a, b) => b.prioridad - a.prioridad);

  const categorias: MovimientoCategorizado[] = [];
  let categorizados = 0;
  let traspasos = 0;

  for (const m of movimientos) {
    const importe = aCentimos(m.importe) ?? 0;
    const raiz = normalizarConcepto(m.concepto);

    const ganadora = ordenadas.find((r) => casa(r, raiz, m.concepto, importe));

    if (ganadora) {
      categorias.push({ categoria: ganadora.categoria, origen: 'regla' });
      categorizados++;
      if (ganadora.categoria === CATEGORIA_TRASPASO) traspasos++;
    } else {
      categorias.push({ categoria: null, origen: null });
    }
  }

  return {
    categorias,
    categorizados,
    sinCategorizar: movimientos.length - categorizados,
    traspasos,
  };
}
