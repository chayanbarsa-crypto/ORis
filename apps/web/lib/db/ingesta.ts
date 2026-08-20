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
 */

import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from './index';
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
  | { estado: 'guardado'; extractoId: string; movimientos: number }
  | { estado: 'duplicado'; extractoId: string; movimientos: number }
  | { estado: 'rechazado'; motivo: string };

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
    const idPorNombre = await resolverCategorias(tx, usuarioId, extraccion.movimientos);

    await tx.insert(movimientos).values(
      extraccion.movimientos.map((m, i) => ({
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
    // Se relee lo escrito y se recalcula el cuadre *en Postgres*, con numeric.
    // El extractor dijo que cuadraba; esto verifica que lo guardado también.
    // Si la conversión de texto a numeric hubiera perdido un céntimo por el
    // camino, aquí salta — dentro de la transacción, así que no queda rastro.
    const [comprobacion] = await tx
      .select({
        suma: sql<string>`coalesce(sum(${movimientos.importe}), 0)::text`,
        n: sql<number>`count(*)::int`,
      })
      .from(movimientos)
      .where(eq(movimientos.extractoId, extracto.id));

    const [{ cuadra }] = await tx
      .select({
        cuadra: sql<boolean>`
          ${extractos.saldoInicial} + ${comprobacion.suma}::numeric
            = ${extractos.saldoFinal}
        `,
      })
      .from(extractos)
      .where(eq(extractos.id, extracto.id));

    if (!cuadra) {
      // Lanzar deshace la transacción entera: el extracto y sus movimientos
      // desaparecen como si nunca hubieran existido.
      throw new Error(
        `El cuadre no sobrevivió al guardado: ${comprobacion.n} movimientos ` +
          `suman ${comprobacion.suma}, que no lleva de ${extraccion.saldo_inicial} ` +
          `a ${extraccion.saldo_final}.`,
      );
    }

    return {
      estado: 'guardado' as const,
      extractoId: extracto.id,
      movimientos: comprobacion.n,
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
