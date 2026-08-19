/**
 * Las comprobaciones deterministas sobre lo que extrae el modelo.
 *
 * Ninguna de ellas pregunta nada a nadie: son aritmética y formato. Ésa es la
 * razón de que existan. El modelo lee el PDF —eso no lo sabe hacer un `if`—,
 * pero decidir si lo leído *cuadra* sí, y eso no se delega: un modelo que se
 * salta tres apuntes escribe una respuesta perfectamente bien formada.
 *
 * La comprobación que sostiene todo lo demás es el cuadre:
 *
 *     saldo_inicial + Σ movimientos = saldo_final
 *
 * Si falla, la extracción está incompleta y no se guarda nada. Guardar «casi
 * todos» los movimientos es peor que no guardar ninguno: el panel enseñaría
 * cifras plausibles y equivocadas, y nadie sospecharía.
 *
 * El dinero va en céntimos enteros de principio a fin, nunca en coma flotante.
 * `0.1 + 0.2` no es `0.3`, y aquí se suman cientos de importes.
 */

import { type Centimos, aCentimos, formatear } from './dinero';

export type Severidad = 'Crítica' | 'Alta' | 'Media' | 'Baja' | 'Informativa';
export type EstadoHallazgo = 'Cumple' | 'No cumple' | 'Requiere revisión' | 'No evaluable';

export interface Hallazgo {
  regla: string;
  pagina: number;
  severidad: Severidad;
  estado: EstadoHallazgo;
  descripcion: string;
  /** De dónde sale la conclusión. Nunca vacía en un hallazgo que no cumple. */
  evidencia: string;
  sugerencia: string;
}

/** Un apunte tal como lo devuelve el modelo: importes como cadena. */
export interface MovimientoExtraido {
  fecha: string;
  fecha_valor: string | null;
  concepto: string;
  importe: string;
  saldo: string | null;
}

/** La respuesta del modelo, ya parseada. Cumple `esquema-movimientos.json`. */
export interface Extraccion {
  banco: string | null;
  iban: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  saldo_inicial: string | null;
  saldo_final: string | null;
  movimientos: MovimientoExtraido[];
  paginas_ilegibles: number[];
}

/**
 * Cero de tolerancia, y es una decisión, no un descuido.
 *
 * Con enteros la suma es exacta, así que cualquier desviación es un apunte que
 * falta o que sobra — no un redondeo. Una tolerancia de un céntimo escondería
 * exactamente el error que esto busca.
 */
const TOLERANCIA: Centimos = 0;

export interface Veredicto {
  hallazgos: Hallazgo[];
  /** Si es `false`, no se guarda nada. */
  cuadra: boolean;
  /** Suma de los importes, en céntimos. */
  suma: Centimos;
}

export function validar(e: Extraccion): Veredicto {
  const hallazgos: Hallazgo[] = [];
  const importes = e.movimientos.map((m) => aCentimos(m.importe));
  const suma = importes.reduce<Centimos>((acc, c) => acc + (c ?? 0), 0);

  const inicial = aCentimos(e.saldo_inicial);
  const final = aCentimos(e.saldo_final);

  // --- 1. El cuadre ------------------------------------------------------
  let cuadra = false;
  if (inicial === null || final === null) {
    const cual = inicial === null ? 'inicial' : 'final';
    hallazgos.push({
      regla: 'Cuadre de saldos',
      pagina: 1,
      severidad: 'Media',
      estado: 'Requiere revisión',
      descripcion: `No evaluable: el extracto no declara el saldo ${cual}.`,
      evidencia: 'Campo ausente en el documento.',
      sugerencia: 'Sin ambos saldos no se puede verificar que no falten apuntes.',
    });
  } else {
    const esperado = inicial + suma;
    const desvio = esperado - final;
    if (Math.abs(desvio) > TOLERANCIA) {
      hallazgos.push({
        regla: 'Cuadre de saldos',
        pagina: 1,
        severidad: 'Crítica',
        estado: 'No cumple',
        descripcion:
          'La suma de los movimientos no lleva del saldo inicial al final: ' +
          `sobran o faltan ${formatear(Math.abs(desvio))}.`,
        evidencia:
          `${formatear(inicial)} + ${formatear(suma, { signo: true })} = ` +
          `${formatear(esperado)}, pero el extracto declara ${formatear(final)}.`,
        sugerencia:
          'La extracción está incompleta. No guardar estos movimientos hasta revisar el PDF.',
      });
    } else {
      cuadra = true;
      hallazgos.push({
        regla: 'Cuadre de saldos',
        pagina: 1,
        severidad: 'Informativa',
        estado: 'Cumple',
        descripcion: `El cuadre da: ${e.movimientos.length} movimientos.`,
        evidencia: `${formatear(inicial)} + ${formatear(suma, { signo: true })} = ${formatear(final)}.`,
        sugerencia: '',
      });
    }
  }

  // --- 2. Importes que no se pudieron leer -------------------------------
  //     Un importe fuera de formato habría contado como cero en la suma de
  //     arriba, así que el cuadre podría haber salido bien por casualidad.
  const ilegibles = e.movimientos.filter((_, i) => importes[i] === null);
  if (ilegibles.length > 0) {
    cuadra = false;
    hallazgos.push({
      regla: 'Formato de importes',
      pagina: 1,
      severidad: 'Crítica',
      estado: 'No cumple',
      descripcion: `${ilegibles.length} importe(s) no tienen el formato acordado.`,
      evidencia: `«${ilegibles[0].concepto}» trae «${ilegibles[0].importe}».`,
      sugerencia: 'Se esperan dos decimales con punto, por ejemplo -12.34.',
    });
  }

  // --- 3. Orden cronológico ----------------------------------------------
  const desordenados: [MovimientoExtraido, MovimientoExtraido][] = [];
  for (let i = 1; i < e.movimientos.length; i++) {
    const a = e.movimientos[i - 1];
    const b = e.movimientos[i];
    if (b.fecha < a.fecha) desordenados.push([a, b]);
  }
  if (desordenados.length > 0) {
    const [a, b] = desordenados[0];
    hallazgos.push({
      regla: 'Orden cronológico',
      pagina: 1,
      severidad: 'Media',
      estado: 'No cumple',
      descripcion: `${desordenados.length} apunte(s) rompen el orden de fechas.`,
      evidencia: `«${b.concepto}» (${b.fecha}) va después de «${a.concepto}» (${a.fecha}).`,
      sugerencia: 'Puede indicar páginas leídas fuera de orden.',
    });
  }

  // --- 4. Continuidad del saldo, apunte a apunte -------------------------
  //     Dice *dónde* se rompe la cadena, no sólo que se rompe. Con 92
  //     movimientos, saber el punto exacto es la diferencia entre revisar una
  //     línea del PDF y revisarlo entero.
  const conSaldo = e.movimientos
    .map((m) => ({ m, saldo: aCentimos(m.saldo), importe: aCentimos(m.importe) }))
    .filter((x) => x.saldo !== null && x.importe !== null);

  const saltos: (typeof conSaldo)[number][][] = [];
  for (let i = 1; i < conSaldo.length; i++) {
    const a = conSaldo[i - 1];
    const b = conSaldo[i];
    if (a.saldo! + b.importe! !== b.saldo!) saltos.push([a, b]);
  }
  if (saltos.length > 0) {
    const [a, b] = saltos[0];
    hallazgos.push({
      regla: 'Continuidad del saldo',
      pagina: 1,
      severidad: 'Alta',
      estado: 'No cumple',
      descripcion: `El saldo salta en ${saltos.length} punto(s): falta algún apunte entre medias.`,
      evidencia:
        `Tras «${a.m.concepto}» el saldo es ${formatear(a.saldo!)}; ` +
        `«${b.m.concepto}» mueve ${formatear(b.importe!, { signo: true })} y deja ${formatear(b.saldo!)}.`,
      sugerencia: 'Revisar el PDF alrededor de ese apunte.',
    });
  }

  // --- 5. IBAN ------------------------------------------------------------
  if (e.iban && !ibanValido(e.iban)) {
    hallazgos.push({
      regla: 'Identificador de cuenta',
      pagina: 1,
      severidad: 'Alta',
      estado: 'No cumple',
      descripcion: 'El IBAN no supera la comprobación mod-97.',
      evidencia: `Se leyó «${e.iban}» (${e.iban.length} caracteres).`,
      sugerencia: 'Un dígito mal transcrito; contrastar con el original.',
    });
  }

  // --- 6. Páginas que el modelo no pudo leer ------------------------------
  if (e.paginas_ilegibles.length > 0) {
    cuadra = false;
    hallazgos.push({
      regla: 'Integridad de la extracción',
      pagina: e.paginas_ilegibles[0],
      severidad: 'Crítica',
      estado: 'No cumple',
      descripcion: `El modelo no pudo leer ${e.paginas_ilegibles.length} página(s).`,
      evidencia: `Páginas declaradas ilegibles: ${e.paginas_ilegibles.join(', ')}.`,
      sugerencia: 'Faltan movimientos con seguridad. No guardar sin revisar.',
    });
  }

  return { hallazgos, cuadra, suma };
}

/**
 * IBAN según ISO 13616: mod-97 sobre el número entero que resulta de mover los
 * cuatro primeros caracteres al final y sustituir letras por números.
 *
 * Comprobar sólo la longitud deja pasar un dígito cambiado, que es justo el
 * error que comete quien transcribe —y el que hace que el dinero acabe en otra
 * cuenta. El resto se calcula a trozos porque el número entero excede lo que
 * puede representar un `number`.
 */
export function ibanValido(iban: string): boolean {
  const limpio = iban.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(limpio)) return false;

  const reordenado = limpio.slice(4) + limpio.slice(0, 4);
  let resto = 0;
  for (const c of reordenado) {
    const valor = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of valor) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}
