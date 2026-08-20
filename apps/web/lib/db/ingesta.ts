/**
 * Ingesta: de la salida del extractor a las tablas de la fase 2.
 *
 * Tres invariantes que esta capa hace cumplir, y que son la razón de que exista
 * en vez de llamar a `insert()` desde la ruta:
 *
 * 1. **O entra todo, o no entra nada.** El extracto y sus movimientos van en una
 *    sola transacción. Un extracto guardado a medias es peor que ninguno: la
 *    cuenta parece estar y los cuadres posteriores fallan sin decir por qué.
 *
 * 2. **Lo que no cuadra no se guarda.** Si el extractor declaró que la suma de
 *    movimientos no lleva del saldo inicial al final, aquí se rechaza. Guardar
 *    movimientos incompletos corrompe todo lo que se calcule encima.
 *
 * 3. **Un PDF, una vez.** Deduplicación por hash del fichero, antes de abrir la
 *    transacción. Subir dos veces el mismo extracto desde el móvil es lo más
 *    fácil del mundo.
 *
 * 4. **Un movimiento, una vez.** El hash del fichero no basta: bajar junio-julio
 *    y luego mayo-agosto son dos ficheros distintos con dos meses repetidos
 *    dentro. Sin esto, esos dos meses se contarían dos veces y el panel diría
 *    que gastaste el doble — con todos los movimientos correctos, uno por uno.
 *    Ver `huellaMovimiento`.
 */

import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from './index';
import { aCentimos } from '../oris/dinero';
import { categorias, extractos, hallazgos, movimientos } from './schema';

/** El tipo de la transacción de Drizzle, que no se exporta con nombre propio. */
type Transaccion = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/** Forma de la salida de `extraer.py --json`. Los importes son texto. */
export interface ExtraccionJSON {
  documento: string;
  banco: string | null;
  iban: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  saldo_inicial: string | null;
  saldo_final: string | null;
  cuadra: boolean;
  movimientos: Array<{
    fecha: string;
    fecha_valor: string | null;
    concepto: string;
    importe: string;
    saldo: string | null;
    posicion: number;
    /** Nombre de la categoría, no su id: las categorías se crean aquí si hacen falta. */
    categoria?: string | null;
    /** Quién la asignó. Sin categoría no hay origen. */
    origen?: 'regla' | 'ia' | 'manual' | null;
  }>;
  hallazgos: Array<{
    regla: string;
    severidad: string;
    estado: string;
    descripcion: string;
    evidencia: string;
  }>;
}

export type ResultadoIngesta =
  | {
      estado: 'guardado';
      extractoId: string;
      movimientos: number;
      /** Los que ya estaban por un extracto anterior y no se han vuelto a meter. */
      solapados: number;
    }
  | { estado: 'duplicado'; extractoId: string; movimientos: number }
  | { estado: 'rechazado'; motivo: string };

/**
 * Qué hace «el mismo» a dos movimientos venidos de ficheros distintos.
 *
 * Fecha, importe y concepto. No se incluye el saldo corrido a propósito: el
 * mismo apunte trae saldos distintos según desde qué mes arranque el extracto,
 * y meterlo en la huella haría que nunca coincidieran.
 *
 * El concepto se compara tal cual lo escribió el banco, sin normalizar. Aquí
 * interesa la identidad literal del apunte, no a qué comercio pertenece: dos
 * compras del mismo día en el mismo sitio y por el mismo importe son dos
 * movimientos de verdad, y deben seguir siendo dos.
 */
export function huellaMovimiento(m: {
  fecha: string;
  importe: string;
  concepto: string;
}): string {
  return `${m.fecha}|${m.importe}|${m.concepto.trim().replace(/\s+/g, ' ')}`;
}

/** SHA-256 del PDF. Es la clave de deduplicación. */
export function hashDocumento(pdf: Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(pdf).digest('hex');
}

const SEVERIDADES = ['Crítica', 'Alta', 'Media', 'Baja', 'Informativa'] as const;
const ESTADOS = ['Cumple', 'No cumple', 'Requiere revisión', 'No evaluable'] as const;

type Severidad = (typeof SEVERIDADES)[number];
type EstadoHallazgo = (typeof ESTADOS)[number];

function severidadValida(v: string): Severidad {
  return (SEVERIDADES as readonly string[]).includes(v) ? (v as Severidad) : 'Media';
}

function estadoValido(v: string): EstadoHallazgo {
  return (ESTADOS as readonly string[]).includes(v) ? (v as EstadoHallazgo) : 'No evaluable';
}

export async function ingerir(
  extraccion: ExtraccionJSON,
  pdf: Uint8Array,
  usuarioId: string,
): Promise<ResultadoIngesta> {
  // --- Invariante 2: lo que no cuadra no entra ------------------------------
  //     Se comprueba antes que nada: no tiene sentido deduplicar ni abrir una
  //     transacción para algo que vamos a rechazar.
  if (!extraccion.cuadra) {
    const critico = extraccion.hallazgos.find((h) => h.estado === 'No cumple');
    return {
      estado: 'rechazado',
      motivo: critico
        ? `${critico.regla}: ${critico.descripcion}`
        : 'La extracción no cuadra.',
    };
  }
  if (extraccion.movimientos.length === 0) {
    return { estado: 'rechazado', motivo: 'La extracción no trae movimientos.' };
  }

  const hash = hashDocumento(pdf);
  const cliente = db();

  // --- Invariante 3: un PDF, una vez ----------------------------------------
  const yaEsta = await cliente
    .select({ id: extractos.id })
    .from(extractos)
    .where(and(eq(extractos.usuarioId, usuarioId), eq(extractos.hash, hash)))
    .limit(1);

  if (yaEsta.length > 0) {
    const [{ n }] = await cliente
      .select({ n: sql<number>`count(*)::int` })
      .from(movimientos)
      .where(eq(movimientos.extractoId, yaEsta[0].id));
    return { estado: 'duplicado', extractoId: yaEsta[0].id, movimientos: n };
  }

  // --- Invariante 4: un movimiento, una vez ---------------------------------
  //
  // Se cuenta antes de abrir la transacción para poder responder «esto ya lo
  // tengo entero» sin crear un extracto vacío. Un extracto sin movimientos en
  // la lista es ruido: parece que subiste algo y que no se guardó nada.
  //
  // El solape se mide por MULTIPLICIDAD, no por presencia. Dos cafés de tres
  // euros el mismo día en el mismo sitio son dos movimientos legítimos, así
  // que la pregunta no es «¿existe ya éste?» sino «¿cuántos como éste hay ya
  // guardados?». Sólo entran los que sobran de esa cuenta.
  const yaGuardados = await contarPorHuella(cliente, usuarioId, extraccion.movimientos);
  const nuevos: ExtraccionJSON['movimientos'] = [];
  let solapados = 0;

  for (const m of extraccion.movimientos) {
    const huella = huellaMovimiento(m);
    const restantes = yaGuardados.get(huella) ?? 0;
    if (restantes > 0) {
      yaGuardados.set(huella, restantes - 1);
      solapados++;
    } else {
      nuevos.push(m);
    }
  }

  if (nuevos.length === 0) {
    // Fichero distinto, contenido ya guardado: por ejemplo mayo-agosto después
    // de haber subido mayo-agosto en dos trozos.
    return { estado: 'duplicado', extractoId: '', movimientos: solapados };
  }

  // --- Invariante 1: o entra todo, o no entra nada ---------------------------
  return cliente.transaction(async (tx) => {
    const [extracto] = await tx
      .insert(extractos)
      .values({
        usuarioId,
        nombreFichero: extraccion.documento,
        hash,
        tamanoKb: (pdf.byteLength / 1024).toFixed(1),
        banco: extraccion.banco,
        iban: extraccion.iban,
        periodoInicio: extraccion.periodo_inicio,
        periodoFin: extraccion.periodo_fin,
        saldoInicial: extraccion.saldo_inicial,
        saldoFinal: extraccion.saldo_final,
        estado: 'auditado',
        motor: 'oris_core.extractos',
        modelo: 'claude-opus-5',
        auditadoEn: new Date(),
      })
      .returning({ id: extractos.id });

    // Las categorías se resuelven por NOMBRE y se crean si no existen, dentro
    // de la misma transacción. Guardar el nombre en el movimiento habría sido
    // más simple, pero entonces renombrar una categoría obligaría a reescribir
    // cada fila y las de dos meses atrás se quedarían con el nombre viejo.
    const idPorNombre = await resolverCategorias(tx, usuarioId, nuevos);

    await tx.insert(movimientos).values(
      nuevos.map((m, i) => ({
        extractoId: extracto.id,
        usuarioId,
        fecha: m.fecha,
        fechaValor: m.fecha_valor,
        concepto: m.concepto,
        importe: m.importe,
        saldo: m.saldo,
        categoriaId: m.categoria ? (idPorNombre.get(m.categoria) ?? null) : null,
        origen: m.categoria ? (m.origen ?? 'regla') : null,
        // La posición del extractor manda; el índice es el plan B, porque los
        // bancos no siempre dan hora y el orden de la página es el único
        // criterio para desempatar apuntes del mismo día.
        posicion: m.posicion ?? i,
      })),
    );

    if (extraccion.hallazgos.length > 0) {
      await tx.insert(hallazgos).values(
        extraccion.hallazgos.map((h) => ({
          extractoId: extracto.id,
          regla: h.regla,
          pagina: 1,
          severidad: severidadValida(h.severidad),
          estado: estadoValido(h.estado),
          descripcion: h.descripcion,
          evidencia: h.evidencia ?? '',
        })),
      );
    }

    // --- La comprobación que cierra el círculo -------------------------------
    //
    // Se relee lo escrito y se suma *en Postgres*, con numeric, para verificar
    // que la conversión de texto a numeric no perdió un céntimo por el camino.
    //
    // Se compara contra la suma de lo que se ha insertado, no contra los saldos
    // del extracto: cuando parte de los movimientos ya estaban por un extracto
    // anterior, en esta fila sólo viven los nuevos y el cuadre del periodo
    // completo no puede salir de ellos. Ese cuadre ya se verificó antes de
    // llegar aquí, sobre la extracción entera — que es donde significa algo.
    const [comprobacion] = await tx
      .select({
        suma: sql<string>`coalesce(sum(${movimientos.importe}), 0)::text`,
        n: sql<number>`count(*)::int`,
      })
      .from(movimientos)
      .where(eq(movimientos.extractoId, extracto.id));

    if (solapados === 0) {
      // Sin solape se puede hacer la comprobación fuerte: recalcular el cuadre
      // del periodo entero contra los saldos que declara el extracto. Es la que
      // detecta que alguien haya dicho «cuadra» sin que cuadre.
      const [{ cuadraEnBase }] = await tx
        .select({
          cuadraEnBase: sql<boolean>`
            ${extractos.saldoInicial} + ${comprobacion.suma}::numeric
              = ${extractos.saldoFinal}
          `,
        })
        .from(extractos)
        .where(eq(extractos.id, extracto.id));

      if (!cuadraEnBase) {
        // Lanzar deshace la transacción entera: el extracto y sus movimientos
        // desaparecen como si nunca hubieran existido.
        throw new Error(
          `El cuadre no sobrevivió al guardado: ${comprobacion.n} movimientos ` +
            `suman ${comprobacion.suma}, que no lleva de ${extraccion.saldo_inicial} ` +
            `a ${extraccion.saldo_final}.`,
        );
      }
    } else {
      // Con solape, en esta fila viven sólo los movimientos nuevos, así que el
      // cuadre del periodo completo no puede salir de ellos. Lo que sí se
      // comprueba es que lo escrito es exactamente lo que se quiso escribir —
      // que la conversión de texto a numeric no perdió un céntimo. El cuadre
      // del periodo ya se verificó sobre la extracción entera antes de llegar
      // aquí, que es donde significa algo.
      const esperada = sumaEnTexto(nuevos);
      // Se compara en Postgres con numeric, no en JavaScript: es el mismo tipo
      // con el que está guardado, y comparar textos daría falsos negativos por
      // ceros a la derecha («-6.00» frente a «-6.000»).
      const [{ igual }] = await tx
        .select({
          igual: sql<boolean>`${comprobacion.suma}::numeric = ${esperada}::numeric`,
        })
        .from(extractos)
        .where(eq(extractos.id, extracto.id));

      if (!igual || comprobacion.n !== nuevos.length) {
        throw new Error(
          `Lo guardado no coincide con lo auditado: ${comprobacion.n} movimientos ` +
            `suman ${comprobacion.suma}, y esperaba ${nuevos.length} sumando ${esperada}.`,
        );
      }
    }

    return {
      estado: 'guardado' as const,
      extractoId: extracto.id,
      movimientos: comprobacion.n,
      solapados,
    };
  });
}

/**
 * Traduce nombres de categoría a sus identificadores, creando las que falten.
 *
 * Va dentro de la transacción de la ingesta a propósito: si el guardado se
 * deshace, las categorías que se hayan creado por el camino se deshacen con él.
 * De otro modo un extracto rechazado dejaría categorías huérfanas en la lista.
 *
 * `onConflictDoNothing` sobre el índice único (usuario, nombre) hace que dos
 * subidas simultáneas con la misma categoría nueva no choquen; después se
 * releen todas, así que da igual quién la creara.
 */
async function resolverCategorias(
  tx: Transaccion,
  usuarioId: string,
  movs: ExtraccionJSON['movimientos'],
): Promise<Map<string, string>> {
  const nombres = [...new Set(movs.map((m) => m.categoria).filter((n): n is string => !!n))];
  if (nombres.length === 0) return new Map();

  await tx
    .insert(categorias)
    .values(nombres.map((nombre) => ({ usuarioId, nombre })))
    .onConflictDoNothing();

  const filas = await tx
    .select({ id: categorias.id, nombre: categorias.nombre })
    .from(categorias)
    .where(and(eq(categorias.usuarioId, usuarioId), inArray(categorias.nombre, nombres)));

  return new Map(filas.map((f) => [f.nombre, f.id]));
}

/**
 * Cuántos movimientos con cada huella hay ya guardados para este usuario.
 *
 * Se consulta acotado a las huellas que trae el fichero, no a todo el
 * histórico: con veinte años de movimientos, traérselos enteros para comparar
 * doscientos sería absurdo. La comparación se hace en Postgres con la misma
 * expresión que `huellaMovimiento` construye en TypeScript — si una de las dos
 * cambia, la otra tiene que cambiar con ella.
 */
async function contarPorHuella(
  tx: Transaccion | ReturnType<typeof db>,
  usuarioId: string,
  movs: ExtraccionJSON['movimientos'],
): Promise<Map<string, number>> {
  const huellas = [...new Set(movs.map((m) => huellaMovimiento(m)))];
  if (huellas.length === 0) return new Map();

  const expresion = sql`
    ${movimientos.fecha}::text || '|' ||
    ${movimientos.importe}::text || '|' ||
    regexp_replace(btrim(${movimientos.concepto}), '\\s+', ' ', 'g')
  `;

  const filas = await tx
    .select({ huella: sql<string>`${expresion}`, n: sql<number>`count(*)::int` })
    .from(movimientos)
    .where(and(eq(movimientos.usuarioId, usuarioId), inArray(sql`${expresion}`, huellas)))
    .groupBy(sql`${expresion}`);

  return new Map(filas.map((f) => [f.huella, f.n]));
}

/** Suma de importes en céntimos enteros, devuelta como texto para Postgres. */
function sumaEnTexto(movs: ExtraccionJSON['movimientos']): string {
  const centimos = movs.reduce((acc, m) => acc + (aCentimos(m.importe) ?? 0), 0);
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
