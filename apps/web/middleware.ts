/**
 * La puerta, y está en el sitio correcto.
 *
 * Antes de esto el desbloqueo era la pantalla de la constelación: bonito y
 * **cero seguridad**. La página se renderiza en el servidor, así que los
 * movimientos ya venían dentro del HTML antes de que nadie tocara nada — con
 * ver el código fuente se leían todos. Lo que decidía si se «entraba» era una
 * variable del navegador, y eso lo cambia cualquiera desde la consola.
 *
 * Aquí no: si no hay cookie firmada válida, la petición no llega a la página ni
 * a la API, así que no se llega a consultar la base de datos. Se corta antes de
 * que exista el dato.
 *
 * Corre en el runtime Edge, que no tiene `node:crypto` — por eso la firma se
 * verifica con Web Crypto (ver `lib/auth/sesion.ts`).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE, verificar } from '@/lib/auth/sesion';

/** Lo que se sirve sin sesión: la propia puerta y lo que necesita para pintarse. */
const ABIERTO = ['/entrar', '/api/pin'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (ABIERTO.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next();
  }

  const secreto = process.env.ORIS_SECRETO;

  // Sin secreto configurado no se puede verificar nada. Se cierra en vez de
  // abrirse: un despliegue al que le falta una variable no debe quedar sin
  // puerta y sin que nadie lo note.
  if (!secreto) {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ mensaje: 'Falta ORIS_SECRETO en el entorno.' }, { status: 503 })
      : NextResponse.redirect(new URL('/entrar?falta=1', req.url));
  }

  const sesion = await verificar(req.cookies.get(COOKIE)?.value, secreto);
  if (sesion) return NextResponse.next();

  // La API contesta 401 y no redirige: una redirección a una pantalla de PIN
  // llegaría al `fetch` como un HTML de 200 y el cliente intentaría leerlo como
  // JSON, dando un error que no se parece en nada a «no has entrado».
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ mensaje: 'Sesión caducada. Vuelve a entrar.' }, { status: 401 });
  }

  const destino = new URL('/entrar', req.url);
  if (pathname !== '/') destino.searchParams.set('volver', pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Todo menos lo que sirve Next para pintarse a sí mismo. Si `_next` entrara
   * aquí, la propia pantalla del PIN se quedaría sin CSS ni JavaScript.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
