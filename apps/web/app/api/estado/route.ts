/**
 * Qué ve el servidor.
 *
 * Existe porque «no hay ANTHROPIC_API_KEY» y «la he puesto en Vercel» pueden ser
 * las dos ciertas a la vez, y desde fuera no hay forma de saber cuál de las
 * cinco cosas que pueden fallar está fallando: la variable no se guardó, se
 * guardó en otro entorno, el despliegue es anterior a ella, el nombre lleva un
 * espacio, o el valor pegado no es lo que se creía. Adivinar eso a base de
 * probar cuesta media tarde.
 *
 * **Nunca devuelve un valor.** Sólo si existe, cuánto mide y si empieza por
 * donde debería. El nombre de una variable no es un secreto; su contenido sí, y
 * de aquí no sale ni un carácter.
 *
 * Va detrás del PIN como todo lo demás: el `middleware` no deja pasar esta ruta
 * sin sesión.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Qué se espera que exista, y con qué pinta. */
const ESPERADAS = [
  { nombre: 'ANTHROPIC_API_KEY', empiezaPor: 'sk-ant-', paraQue: 'el copiloto y la lectura de PDF' },
  { nombre: 'ORIS_PIN', empiezaPor: null, paraQue: 'la puerta' },
  { nombre: 'ORIS_SECRETO', empiezaPor: null, paraQue: 'firmar tu sesión' },
  { nombre: 'DATABASE_URL', empiezaPor: null, paraQue: 'la base de datos (opcional si está POSTGRES_URL)' },
  { nombre: 'POSTGRES_URL', empiezaPor: null, paraQue: 'la base de datos (la pone Supabase)' },
] as const;

export async function GET() {
  const variables = ESPERADAS.map((e) => {
    const valor = process.env[e.nombre];
    const existe = typeof valor === 'string' && valor.trim() !== '';
    return {
      nombre: e.nombre,
      para: e.paraQue,
      existe,
      // Un valor con espacios delante o detrás pasa desapercibido y rompe igual.
      espacios_de_sobra: typeof valor === 'string' && valor !== valor.trim(),
      longitud: existe ? valor!.trim().length : 0,
      empieza_bien: e.empiezaPor === null ? null : Boolean(valor?.trim().startsWith(e.empiezaPor)),
    };
  });

  // Nombres parecidos, para cazar la errata. Sólo nombres, nunca valores: si
  // alguien escribió ANTROPIC_API_KEY o dejó un espacio en el nombre, aquí se ve.
  const parecidas = Object.keys(process.env)
    .filter((k) => /ANTHRO|ANTRO|ORIS|POSTGRES_URL|DATABASE/i.test(k))
    .sort();

  return NextResponse.json({
    despliegue: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      entorno: process.env.VERCEL_ENV ?? 'local',
    },
    variables,
    nombres_parecidos_que_existen: parecidas,
    nota: 'Aquí no aparece ningún valor, sólo si existe y qué forma tiene.',
  });
}
