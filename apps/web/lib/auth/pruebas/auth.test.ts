/**
 * Pruebas de la puerta.
 *
 *   npx tsx lib/auth/pruebas/auth.test.ts
 *
 * Aquí no se prueba que «funcione»: se prueba que **no** funcione lo que no
 * debe. Una cookie retocada, una firma de otro secreto, una sesión caducada.
 * Un fallo en cualquiera de esos tres no da error en ninguna pantalla: abre la
 * puerta y nadie se entera.
 */

import { comprobar, derivar, formaValida } from '../pin';
import { DURACION_SEGUNDOS, firmar, verificar } from '../sesion';

let fallos = 0;
function comprobarQue(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

const SECRETO = 'secreto-de-prueba-largo-y-aburrido';
const AHORA = 1_800_000_000;

async function main() {
  // --- la firma ------------------------------------------------------------

  {
    const token = await firmar({ usuario: 'jordy', expira: AHORA + 100 }, SECRETO);
    const s = await verificar(token, SECRETO, AHORA);
    comprobarQue(s?.usuario === 'jordy', 'una sesión recién firmada vale', s);
    comprobarQue(s?.expira === AHORA + 100, 'y conserva su caducidad');
  }

  {
    const token = await firmar({ usuario: 'jordy', expira: AHORA - 1 }, SECRETO);
    comprobarQue((await verificar(token, SECRETO, AHORA)) === null, 'una sesión caducada no vale');
  }

  {
    const token = await firmar({ usuario: 'jordy', expira: AHORA + 100 }, SECRETO);
    comprobarQue(
      (await verificar(token, 'otro-secreto-distinto', AHORA)) === null,
      'firmada con otro secreto, no vale',
    );
  }

  {
    // El ataque obvio: cambiarse el usuario o alargarse la caducidad a mano.
    const token = await firmar({ usuario: 'jordy', expira: AHORA + 100 }, SECRETO);
    const [usuario, expira, firma] = token.split('.');
    comprobarQue(
      (await verificar(`otro.${expira}.${firma}`, SECRETO, AHORA)) === null,
      'cambiarse el usuario invalida la firma',
    );
    comprobarQue(
      (await verificar(`${usuario}.${AHORA + 999999}.${firma}`, SECRETO, AHORA)) === null,
      'alargarse la caducidad, también',
    );
  }

  {
    for (const basura of ['', 'x', 'a.b', 'a.b.c', '...', 'jordy.999.', undefined]) {
      comprobarQue(
        (await verificar(basura as string | undefined, SECRETO, AHORA)) === null,
        `basura no pasa: ${JSON.stringify(basura)}`,
      );
    }
  }

  {
    // Un usuario con punto no puede partir el formato en dos.
    const token = await firmar({ usuario: 'jordy.admin', expira: AHORA + 100 }, SECRETO);
    const s = await verificar(token, SECRETO, AHORA);
    comprobarQue(s?.usuario === 'jordy.admin', 'un punto en el usuario no rompe el formato', s);
  }

  comprobarQue(DURACION_SEGUNDOS === 604800, 'la sesión dura una semana');

  // --- el PIN --------------------------------------------------------------

  {
    const guardado = derivar('1692');
    comprobarQue(guardado.includes(':'), 'lo guardado lleva sal y derivación', guardado.slice(0, 12));
    comprobarQue(!guardado.includes('1692'), 'y el PIN no aparece por ninguna parte');
    comprobarQue(comprobar('1692', guardado), 'el PIN correcto entra');
    comprobarQue(!comprobar('1693', guardado), 'uno distinto no');
    comprobarQue(!comprobar('', guardado), 'el vacío tampoco');
    comprobarQue(comprobar(' 1692 ', guardado), 'los espacios de más no estorban');
  }

  {
    comprobarQue(derivar('1692') !== derivar('1692'), 'dos derivaciones del mismo PIN son distintas: la sal cambia');
  }

  {
    comprobarQue(!comprobar('1692', undefined), 'sin nada configurado no entra nadie');
    comprobarQue(!comprobar('1692', 'sin-formato'), 'ni con un valor mal formado');
    comprobarQue(!comprobar('1692', 'aa:bb'), 'ni con una derivación de longitud imposible');
  }

  // --- la forma ------------------------------------------------------------

  comprobarQue(formaValida('1692'), 'cuatro dígitos valen');
  comprobarQue(formaValida('12345678'), 'ocho también');
  comprobarQue(!formaValida('123'), 'tres no');
  comprobarQue(!formaValida('123456789'), 'nueve tampoco');
  comprobarQue(!formaValida('12a4'), 'ni con letras');
  comprobarQue(!formaValida(1692), 'ni un número: tiene que venir como texto');

  console.log(fallos === 0 ? '\n✅ auth: todo en verde' : `\n❌ ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
