/**
 * Entrar con el PIN.
 *
 * Lo que sale de aquí no es un «vale»: es una cookie firmada, `httpOnly`, que
 * el `middleware` verifica en cada petición. Que sea `httpOnly` importa más de
 * lo que parece — sin eso, cualquier script de la página podría leerla y
 * llevársela, y una cookie robada es la sesión entera.
 *
 * El límite de intentos vive en memoria del proceso. Conviene saber qué frena y
 * qué no: frena a quien prueba diez mil PIN desde el navegador, y **no** frena
 * un ataque repartido entre muchas instancias. Con cuatro cifras, ése es el
 * riesgo real; con seis, deja de serlo. Cuando haya registro, esto se mueve a
 * la base de datos y cuenta de verdad.
 */

import { NextResponse } from 'next/server';

import { COOKIE, DURACION_SEGUNDOS, firmar } from '@/lib/auth/sesion';
import { comprobar, formaValida } from '@/lib/auth/pin';
import { USUARIO } from '@/lib/oris/usuario';

export const runtime = 'nodejs';

const MAX_INTENTOS = 8;
/** Cuánto dura el castigo antes de volver a contar desde cero. */
const VENTANA_MS = 10 * 60 * 1000;

const intentos = new Map<string, { fallos: number; hasta: number }>();

export async function POST(req: Request) {
  const secreto = process.env.ORIS_SECRETO;
  const guardado = process.env.ORIS_PIN;

  if (!secreto || !guardado) {
    return NextResponse.json(
      {
        mensaje:
          'Falta configurar ORIS_PIN u ORIS_SECRETO en el entorno. Sin eso no hay puerta ' +
          'que abrir.',
      },
      { status: 503 },
    );
  }

  const quien = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocido';
  const ahora = Date.now();
  const registro = intentos.get(quien);

  if (registro && registro.fallos >= MAX_INTENTOS && registro.hasta > ahora) {
    const minutos = Math.ceil((registro.hasta - ahora) / 60000);
    return NextResponse.json(
      { mensaje: `Demasiados intentos. Vuelve a probar en ${minutos} minuto${minutos === 1 ? '' : 's'}.` },
      { status: 429 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ mensaje: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  const { pin } = (cuerpo ?? {}) as { pin?: unknown };
  if (!formaValida(pin)) {
    return NextResponse.json({ mensaje: 'El PIN son de cuatro a ocho dígitos.' }, { status: 400 });
  }

  if (!comprobar(pin, guardado)) {
    const fallos = (registro && registro.hasta > ahora ? registro.fallos : 0) + 1;
    intentos.set(quien, { fallos, hasta: ahora + VENTANA_MS });
    const quedan = MAX_INTENTOS - fallos;
    return NextResponse.json(
      {
        mensaje:
          quedan > 0
            ? `Ese no es. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`
            : 'Ese no es, y se acabaron los intentos por ahora.',
      },
      { status: 401 },
    );
  }

  intentos.delete(quien);

  const expira = Math.floor(ahora / 1000) + DURACION_SEGUNDOS;
  const token = await firmar({ usuario: USUARIO, expira }, secreto);

  const res = NextResponse.json({ estado: 'dentro' });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // En local no hay HTTPS y una cookie `secure` no se guardaría nunca, con lo
    // que entrar sería imposible mientras se desarrolla.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACION_SEGUNDOS,
  });
  return res;
}

/** Salir: se borra la cookie. */
export async function DELETE() {
  const res = NextResponse.json({ estado: 'fuera' });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
