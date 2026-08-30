/**
 * Asignar una categoría a mano, y aprender de ello.
 *
 * Dos cosas pasan aquí, y la segunda es la que hace que ORis mejore:
 *
 * 1. Los movimientos del grupo quedan con esa categoría y `origen = 'manual'`.
 *    Esa marca es definitiva: ni una regla ni el modelo la vuelven a tocar.
 *    Es la única forma de que corregir algo signifique algo.
 *
 * 2. Se guarda una regla con la raíz del concepto. La próxima vez que aparezca
 *    ese comercio, se categoriza solo y ORis no vuelve a preguntar.
 *
 * Las dos van en la misma transacción: si la regla no se pudiera guardar, los
 * movimientos tampoco. Media operación dejaría a ORis preguntando otra vez por
 * algo que ya contestaste, que es la peor forma de perder la confianza de
 * alguien.
 */

import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';

import { db, hayBaseDeDatos } from '@/lib/db';
import { USUARIO } from '@/lib/oris/usuario';
import { categorias, movimientos, reglasCategorizacion } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** Prioridad de lo aprendido: ver `reglaAprendida` en lib/oris/revision.ts. */
const PRIORIDAD_APRENDIDA = 60;

export async function POST(req: Request) {
  if (!hayBaseDeDatos) {
    return NextResponse.json(
      { mensaje: 'No hay base de datos configurada.' },
      { status: 503 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ mensaje: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  const { ids, categoria, raiz, signo } = (cuerpo ?? {}) as {
    ids?: unknown;
    categoria?: unknown;
    raiz?: unknown;
    signo?: unknown;
  };

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ mensaje: 'Faltan los movimientos.' }, { status: 400 });
  }
  if (typeof categoria !== 'string' || categoria.trim() === '') {
    return NextResponse.json({ mensaje: 'Falta la categoría.' }, { status: 400 });
  }

  const nombre = categoria.trim();

  try {
    const resultado = await db().transaction(async (tx) => {
      // La categoría se crea si no existe. `onConflictDoNothing` sobre el
      // índice único (usuario, nombre) evita chocar con una creación paralela;
      // después se relee, así que da igual quién la creara.
      await tx
        .insert(categorias)
        .values({ usuarioId: USUARIO, nombre })
        .onConflictDoNothing();

      const [fila] = await tx
        .select({ id: categorias.id })
        .from(categorias)
        .where(and(eq(categorias.usuarioId, USUARIO), eq(categorias.nombre, nombre)))
        .limit(1);

      if (!fila) throw new Error('No pude resolver la categoría.');

      const actualizados = await tx
        .update(movimientos)
        .set({ categoriaId: fila.id, origen: 'manual' })
        .where(and(eq(movimientos.usuarioId, USUARIO), inArray(movimientos.id, ids)))
        .returning({ id: movimientos.id });

      // La regla sólo se aprende si viene una raíz utilizable. Un patrón vacío
      // o de una letra casaría con medio extracto.
      let reglaGuardada = false;
      if (typeof raiz === 'string' && raiz.trim().length >= 3) {
        await tx
          .insert(reglasCategorizacion)
          .values({
            usuarioId: USUARIO,
            categoriaId: fila.id,
            patron: `\\b${escaparRegex(raiz.trim())}\\b`,
            prioridad: PRIORIDAD_APRENDIDA,
          })
          .onConflictDoNothing();
        reglaGuardada = true;
      }

      return { movimientos: actualizados.length, reglaGuardada, signo: signo ?? null };
    });

    return NextResponse.json({ estado: 'guardado', categoria: nombre, ...resultado });
  } catch (e) {
    console.error('[categoria] fallo', e);
    return NextResponse.json(
      { mensaje: 'No se pudo guardar la categoría. No ha cambiado nada.' },
      { status: 500 },
    );
  }
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
