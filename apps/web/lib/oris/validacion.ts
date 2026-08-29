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
  /**
   * Los hallazgos por los que NO se guarda, si es que hay alguno.
   *
   * Existe porque «no cumple» y «esto bloquea» no son lo mismo: que ocho
   * apuntes rompan el orden de fechas es un aviso —los bancos ordenan por fecha
   * valor, y pasa a menudo—, mientras que una página ilegible significa que
   * faltan movimientos. Sin distinguirlos, el mensaje de rechazo señalaba el
   * primer hallazgo incumplido en vez de la causa real.
   */
  bloqueantes: Hallazgo[];
  /** Suma de los importes, en céntimos. */
  suma: Centimos;
}

/**
 * De dónde viene lo que se está validando. Cambia qué se exige, y no por
 * capricho: cambia **qué puede salir mal**.
 *
 * - `modelo`: lo leyó un modelo de un PDF. Puede saltarse apuntes sin avisar y
 *   devolver una respuesta impecable, así que hace falta una prueba
 *   independiente de que no falta ninguno — el cuadre, o la cadena de saldos.
 *   Sin ninguna de las dos, no se guarda.
 *
 * - `tabla`: lo leyó el código de un CSV o un Excel, fila a fila. No hay
 *   posibilidad de que se salte una en silencio: una fila ilegible aborta la
 *   lectura entera y lo dice. Aquí el cuadre es una comprobación extra cuando
 *   los datos la permiten, no un requisito — exigirlo sería aplicar a un lector
 *   determinista una salvaguarda diseñada para uno que no lo es, y rechazar
 *   ficheros perfectamente completos porque el banco no imprimió una columna.
 */
export type Fuente = 'modelo' | 'tabla';

export function validar(e: Extraccion, fuente: Fuente = 'modelo'): Veredicto {
  const hallazgos: Hallazgo[] = [];
  const importes = e.movimientos.map((m) => aCentimos(m.importe));
  const suma = importes.reduce<Centimos>((acc, c) => acc + (c ?? 0), 0);

  const inicial = aCentimos(e.saldo_inicial);
  const final = aCentimos(e.saldo_final);

  // --- 1. El cuadre ------------------------------------------------------
  const bloqueantes: Hallazgo[] = [];
  let cuadra = false;

  if (inicial === null || final === null) {
    // Sin saldos declarados queda el plan B: la columna de saldo corrido.
    //
    // Si TODOS los apuntes la traen y la cadena no se rompe en ningún punto,
    // eso demuestra lo mismo que el cuadre —que no falta ninguno por el
    // camino— y con la misma aritmética exacta. Muchos extractos no declaran
    // los saldos del periodo pero sí imprimen el saldo tras cada apunte;
    // rechazarlos por eso sería tirar información que está delante.
    const cadena = cadenaIntacta(e.movimientos);
    const cual = inicial === null ? 'inicial' : 'final';

    if (cadena.completa && cadena.rupturas === 0) {
      cuadra = true;
      hallazgos.push({
        regla: 'Cuadre de saldos',
        pagina: 1,
        severidad: 'Informativa',
        estado: 'Cumple',
        descripcion:
          `El extracto no declara el saldo ${cual}, pero la cadena de saldos ` +
          `está completa: ${e.movimientos.length} movimientos, ninguna ruptura.`,
        evidencia:
          `Cada apunte deja el saldo que el siguiente toma como punto de ` +
          `partida, de ${formatear(cadena.primero!)} a ${formatear(cadena.ultimo!)}.`,
        sugerencia: '',
      });
    } else if (fuente === 'tabla') {
      // El fichero se leyó fila a fila: no falta ninguna. Que el banco no
      // imprimiera los saldos del periodo no es motivo para rechazarlo.
      cuadra = true;
      hallazgos.push({
        regla: 'Cuadre de saldos',
        pagina: 1,
        severidad: 'Informativa',
        estado: 'No evaluable',
        descripcion:
          `El fichero no trae los saldos del periodo, así que no hay cuadre que ` +
          `comprobar. Se guardan los ${e.movimientos.length} movimientos igual.`,
        evidencia:
          'Viene de un CSV o un Excel, leído fila a fila: no puede faltar ninguno ' +
          'sin que la lectura hubiera fallado antes.',
        sugerencia:
          'Si tu banco ofrece una columna de saldo en la descarga, inclúyela y ' +
          'podré verificar además que la cadena no se rompe.',
      });
    } else {
      const h: Hallazgo = {
        regla: 'Cuadre de saldos',
        pagina: 1,
        severidad: 'Crítica',
        estado: 'No cumple',
        descripcion: `No evaluable: el extracto no declara el saldo ${cual}.`,
        evidencia: cadena.completa
          ? `La cadena de saldos tampoco sirve: se rompe en ${cadena.rupturas} punto(s).`
          : 'Y no todos los apuntes traen saldo corrido, así que tampoco hay cadena que seguir.',
        sugerencia:
          'Sin saldos ni cadena completa no puedo comprobar que no falten apuntes, ' +
          'y prefiero no guardar unas cuentas que no puedo verificar.',
      };
      hallazgos.push(h);
      bloqueantes.push(h);
    }
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
    const h: Hallazgo = {
      regla: 'Formato de importes',
      pagina: 1,
      severidad: 'Crítica',
      estado: 'No cumple',
      descripcion: `${ilegibles.length} importe(s) no tienen el formato acordado.`,
      evidencia: `«${ilegibles[0].concepto}» trae «${ilegibles[0].importe}».`,
      sugerencia: 'Se esperan dos decimales con punto, por ejemplo -12.34.',
    };
    hallazgos.push(h);
    bloqueantes.push(h);
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
  // Se comparan pares CONSECUTIVOS en el extracto que traigan los dos su saldo,
  // no la lista filtrada. Filtrar primero y encadenar después inventaría una
  // relación entre dos apuntes que en el extracto no van seguidos: si el de en
  // medio no trae saldo, el salto que aparece es real y esperado, y reportarlo
  // sería una alarma falsa en cada hueco.
  const pasos = e.movimientos.map((m) => ({
    m,
    saldo: aCentimos(m.saldo),
    importe: aCentimos(m.importe),
  }));

  type Paso = (typeof pasos)[number];
  const saltos: [Paso, Paso][] = [];
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1];
    const b = pasos[i];
    if (a.saldo === null || b.saldo === null || b.importe === null) continue;
    if (a.saldo + b.importe !== b.saldo) saltos.push([a, b]);
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
    const h: Hallazgo = {
      regla: 'Integridad de la extracción',
      pagina: e.paginas_ilegibles[0],
      severidad: 'Crítica',
      estado: 'No cumple',
      descripcion: `El modelo no pudo leer ${e.paginas_ilegibles.length} página(s).`,
      evidencia: `Páginas declaradas ilegibles: ${e.paginas_ilegibles.join(', ')}.`,
      sugerencia: 'Faltan movimientos con seguridad. No guardar sin revisar.',
    };
    hallazgos.push(h);
    bloqueantes.push(h);
  }

  return { hallazgos, cuadra, bloqueantes, suma };
}

/**
 * Recorre la columna de saldo corrido y dice si forma una cadena sin huecos.
 *
 * `completa` significa que todos los apuntes traen saldo; `rupturas`, en
 * cuántos puntos el saldo de uno más el importe del siguiente no da el saldo
 * del siguiente. Cero rupturas sobre una cadena completa demuestra lo mismo
 * que el cuadre de saldos declarados: que entre el primero y el último no
 * falta ningún apunte.
 */
function cadenaIntacta(movimientos: readonly MovimientoExtraido[]): {
  completa: boolean;
  rupturas: number;
  primero: Centimos | null;
  ultimo: Centimos | null;
} {
  if (movimientos.length === 0) {
    return { completa: false, rupturas: 0, primero: null, ultimo: null };
  }

  const pasos = movimientos.map((m) => ({
    saldo: aCentimos(m.saldo),
    importe: aCentimos(m.importe),
  }));

  const completa = pasos.every((p) => p.saldo !== null && p.importe !== null);
  if (!completa) return { completa: false, rupturas: 0, primero: null, ultimo: null };

  let rupturas = 0;
  for (let i = 1; i < pasos.length; i++) {
    if (pasos[i - 1].saldo! + pasos[i].importe! !== pasos[i].saldo!) rupturas++;
  }

  return {
    completa: true,
    rupturas,
    primero: pasos[0].saldo,
    ultimo: pasos[pasos.length - 1].saldo,
  };
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
