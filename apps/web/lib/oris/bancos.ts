/**
 * Identificar de qué banco viene un extracto.
 *
 * Hace falta para dos cosas distintas. La visible: que la lista de extractos
 * diga «BBVA · mayo–agosto» en vez de «extracto_4.xlsx», que no significa nada
 * dentro de tres meses. La que importa: **con varias cuentas, saber cuál es
 * cuál**. Dos bancos distintos tienen saldos distintos, y sumarlos como si
 * fueran uno da una caja que no existe.
 *
 * Un PDF lo dice el modelo, que lee la cabecera. Un CSV o un Excel no traen
 * campo de banco, así que hay que reconocerlo en lo que sí traen: las filas de
 * antes de la tabla —donde el banco suele firmar— y el nombre del fichero, que
 * las descargas de banca electrónica suelen bautizar.
 *
 * Cuando no se reconoce, `null`. En la interfaz eso es «Banco no
 * identificado», que es cierto y no estorba; adivinar el banco equivocado sí
 * estorbaría, porque agruparía cuentas ajenas bajo la misma etiqueta.
 */

/**
 * Bancos que operan en España, con las formas en las que se nombran a sí
 * mismos. Se comparan sobre texto normalizado: mayúsculas, sin acentos y con
 * los espacios colapsados.
 *
 * El orden importa donde una marca contiene a otra: «BANCO SANTANDER» antes
 * que «SANTANDER» no cambia nada, pero «OPENBANK» tiene que ir antes que
 * «BANCO» a secas, o toda descarga de Openbank quedaría como «Banco».
 */
const BANCOS: ReadonlyArray<{ nombre: string; señas: readonly string[] }> = [
  { nombre: 'Openbank', señas: ['OPENBANK'] },
  { nombre: 'Imagin', señas: ['IMAGIN', 'IMAGINBANK'] },
  { nombre: 'CaixaBank', señas: ['CAIXABANK', 'LA CAIXA', 'CAIXA'] },
  { nombre: 'BBVA', señas: ['BBVA', 'BILBAO VIZCAYA'] },
  { nombre: 'Santander', señas: ['SANTANDER'] },
  { nombre: 'Sabadell', señas: ['SABADELL', 'BANCO SABADELL'] },
  { nombre: 'Bankinter', señas: ['BANKINTER'] },
  { nombre: 'Unicaja', señas: ['UNICAJA'] },
  { nombre: 'Kutxabank', señas: ['KUTXABANK', 'KUTXA'] },
  { nombre: 'Ibercaja', señas: ['IBERCAJA'] },
  { nombre: 'Abanca', señas: ['ABANCA'] },
  { nombre: 'Cajamar', señas: ['CAJAMAR'] },
  { nombre: 'Laboral Kutxa', señas: ['LABORAL KUTXA'] },
  { nombre: 'Caja Rural', señas: ['CAJA RURAL', 'RURALVIA'] },
  { nombre: 'EVO Banco', señas: ['EVO BANCO', 'EVOBANCO'] },
  { nombre: 'ING', señas: ['ING DIRECT', 'ING BANK', 'ING '] },
  { nombre: 'Deutsche Bank', señas: ['DEUTSCHE BANK'] },
  { nombre: 'Targobank', señas: ['TARGOBANK'] },
  { nombre: 'Pibank', señas: ['PIBANK'] },
  { nombre: 'MyInvestor', señas: ['MYINVESTOR'] },
  { nombre: 'Revolut', señas: ['REVOLUT'] },
  { nombre: 'N26', señas: ['N26'] },
  { nombre: 'Wise', señas: ['WISE', 'TRANSFERWISE'] },
  { nombre: 'BNP Paribas', señas: ['BNP PARIBAS'] },
  { nombre: 'Trade Republic', señas: ['TRADE REPUBLIC'] },
];

/**
 * Los nombres que ORis reconoce, para ofrecerlos cuando hay que preguntar.
 *
 * Es una sugerencia, no una lista cerrada: el campo admite escribir cualquier
 * cosa. Cerrarla dejaría fuera al banco que todavía no está aquí, y entonces
 * la pregunta no tendría respuesta posible.
 */
export const BANCOS_CONOCIDOS: readonly string[] = BANCOS.map((b) => b.nombre);

/**
 * Los cuatro dígitos del IBAN español que identifican a la entidad.
 *
 * Es la vía más fiable de todas: no depende de cómo se escriba el nombre. Sólo
 * se usa cuando el extracto trae el IBAN, que en los tabulares es raro pero en
 * los PDF es casi seguro.
 */
const POR_CODIGO: Record<string, string> = {
  '0049': 'Santander',
  '0075': 'Santander', // ex-Popular
  '0081': 'Sabadell',
  '0128': 'Bankinter',
  '0182': 'BBVA',
  '0234': 'Caja Rural',
  '0238': 'Abanca',
  '0487': 'BBVA', // ex-Unicaja Banco/BMN según ficha
  '1465': 'ING',
  '2038': 'Bankia', // histórico, hoy CaixaBank
  '2080': 'Abanca',
  '2085': 'Ibercaja',
  '2095': 'Kutxabank',
  '2100': 'CaixaBank',
  '3058': 'Cajamar',
  '3183': 'Caja Rural',
  '3187': 'Caja Rural',
  '0073': 'Openbank',
  '1583': 'Trade Republic',
  '1544': 'MyInvestor',
};

function normalizar(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Entidad a partir del IBAN. Es la vía fiable cuando el IBAN está. */
export function bancoDesdeIban(iban: string | null): string | null {
  if (!iban) return null;
  const limpio = iban.replace(/[\s-]/g, '').toUpperCase();
  if (!/^ES\d{22}$/.test(limpio)) return null;
  return POR_CODIGO[limpio.slice(4, 8)] ?? null;
}

/**
 * Entidad a partir del texto suelto del fichero y de su nombre.
 *
 * `lineas` son las filas de antes de la tabla: la cabecera del documento, donde
 * el banco firma. Se limita a las primeras porque más abajo ya son movimientos,
 * y un pago a «BBVA SEGUROS» no convierte el extracto en uno de BBVA.
 */
export function detectarBanco(
  lineas: readonly string[],
  nombreFichero = '',
  iban: string | null = null,
): string | null {
  const porIban = bancoDesdeIban(iban);
  if (porIban) return porIban;

  const heno = normalizar([...lineas.slice(0, 12), nombreFichero].join(' | '));

  for (const banco of BANCOS) {
    for (const seña of banco.señas) {
      if (heno.includes(normalizar(seña))) return banco.nombre;
    }
  }
  return null;
}

/**
 * Cómo se llama un extracto en una lista.
 *
 * «CaixaBank · 1 ene – 31 ago» dice mucho más que «movimientos(3).xlsx», que
 * es como los bautizan los navegadores. El nombre del fichero se guarda igual
 * y se enseña debajo, porque a veces es lo único que reconoces.
 */
export function tituloExtracto(
  banco: string | null,
  inicio: string | null,
  fin: string | null,
): string {
  const entidad = banco ?? 'Banco no identificado';
  if (!inicio || !fin) return entidad;
  return `${entidad} · ${periodoCorto(inicio, fin)}`;
}

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

export function periodoCorto(inicio: string, fin: string): string {
  const [ai, mi, di] = inicio.split('-').map(Number);
  const [af, mf, df] = fin.split('-').map(Number);
  if (!ai || !af) return `${inicio} – ${fin}`;

  const desde = `${di} ${MESES_CORTOS[mi - 1]}`;
  const hasta = `${df} ${MESES_CORTOS[mf - 1]}`;
  // El año sólo aparece cuando aporta algo: si el periodo no lo cruza, sobra
  // repetirlo dos veces en la misma línea.
  return ai === af ? `${desde} – ${hasta} ${af}` : `${desde} ${ai} – ${hasta} ${af}`;
}
