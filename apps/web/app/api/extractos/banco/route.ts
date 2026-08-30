/**
 * Decir de qué banco es un extracto que ORis no supo reconocer.
 *
 * Hace falta porque la detección automática falla de una forma concreta: un
 * Excel descargado de banca electrónica puede no nombrar a su banco en ninguna
 * parte —ni en la cabecera, ni en el nombre del fichero, ni con un IBAN— y
 * entonces no hay nada que leer. Adivinar sería peor que preguntar: etiquetar
 * mal un extracto agrupa cuentas distintas bajo el mismo banco, y eso da una
 * caja que no existe.
 *
 * Sólo se toca el banco. Ni los movimientos, ni el periodo, ni los saldos: lo
 * que auditó la ingesta queda como estaba, porque el usuario está contestando
 * a una etiqueta, no reabriendo una auditoría.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db, hayBaseDeDatos } from '@/lib/db';
import { USUARIO } from '@/lib/oris/usuario';
import { extractos } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** Un nombre de banco, no un párrafo. Suficiente para «Caja Rural de Navarra». */
const MAXIMO = 60;

export async function POST(req: Request) {
  if (!hayBaseDeDatos) {
    return NextResponse.json({ mensaje: 'No hay base de datos configurada.' }, { status: 503 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ mensaje: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  const { id, banco } = (cuerpo ?? {}) as { id?: unknown; banco?: unknown };

  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ mensaje: 'Falta el extracto.' }, { status: 400 });
  }
  if (typeof banco !== 'string' || banco.trim().length < 2) {
    return NextResponse.json({ mensaje: 'Falta el nombre del banco.' }, { status: 400 });
  }

  const nombre = banco.trim().slice(0, MAXIMO);

  try {
    const [fila] = await db()
      .update(extractos)
      .set({ banco: nombre })
      // El filtro por usuario va aunque hoy sólo haya uno: el día que haya
      // login, un `id` de otro no puede poder renombrar nada.
      .where(and(eq(extractos.usuarioId, USUARIO), eq(extractos.id, id)))
      .returning({ id: extractos.id, banco: extractos.banco });

    if (!fila) {
      return NextResponse.json({ mensaje: 'Ese extracto no existe.' }, { status: 404 });
    }
    return NextResponse.json({ estado: 'guardado', ...fila });
  } catch (e) {
    console.error('[banco] fallo', e);
    return NextResponse.json(
      { mensaje: 'No se pudo guardar el banco. No ha cambiado nada.' },
      { status: 500 },
    );
  }
}
