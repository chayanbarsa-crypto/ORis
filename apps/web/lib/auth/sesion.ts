/**
 * La sesión: una cadena firmada que dice quién eres y hasta cuándo.
 *
 * Sin base de datos de sesiones a propósito. Lo único que hay que recordar es
 * «este navegador pasó el PIN», y eso cabe en una cookie firmada: si alguien la
 * edita, la firma deja de cuadrar y no vale. Una tabla de sesiones añadiría una
 * consulta a cada petición para guardar un dato que ya viaja en la propia
 * cookie.
 *
 * Va con **Web Crypto** y no con `node:crypto` porque esto se ejecuta en el
 * `middleware`, que corre en el runtime Edge y no tiene los módulos de Node.
 * Web Crypto está en los dos sitios, así que el mismo código firma en el
 * servidor y verifica en el borde.
 *
 * La comparación de firmas la hace `crypto.subtle.verify`, que compara en
 * tiempo constante. Un `===` sobre cadenas sale antes cuanto antes falle un
 * carácter, y eso —medido muchas veces— filtra la firma byte a byte.
 */

const CODIFICADOR = new TextEncoder();

export interface Sesion {
  usuario: string;
  /** Marca de tiempo en segundos. */
  expira: number;
}

async function clave(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    CODIFICADOR.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function desdeBase64url(s: string): Uint8Array {
  const normal = s.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  return Uint8Array.from(atob(relleno), (c) => c.charCodeAt(0));
}

/**
 * «usuario.expira.firma».
 *
 * El punto separa, así que el usuario no puede contener ninguno.
 * `encodeURIComponent` **no escapa el punto** —está en su lista de caracteres
 * seguros—, de modo que un identificador como «ana.lopez» partiría el token en
 * cuatro trozos y la sesión dejaría de leerse. Hoy el usuario es «jordy» y no
 * se nota; en cuanto haya registro con correos, sí.
 */
export async function firmar(sesion: Sesion, secreto: string): Promise<string> {
  const cuerpo = `${escapar(sesion.usuario)}.${sesion.expira}`;
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), CODIFICADOR.encode(cuerpo));
  return `${cuerpo}.${base64url(firma)}`;
}

/**
 * La sesión si el token es válido y no ha caducado; `null` en cualquier otro
 * caso. No distingue entre «mal firmado» y «caducado»: quien recibe el `null`
 * tiene que hacer lo mismo en los dos casos, y contarlo por separado sólo le
 * diría a un atacante cuál de las dos cosas ha conseguido.
 */
export async function verificar(
  token: string | undefined,
  secreto: string,
  ahora = Math.floor(Date.now() / 1000),
): Promise<Sesion | null> {
  if (!token) return null;

  const corte = token.lastIndexOf('.');
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);

  let valida = false;
  try {
    valida = await crypto.subtle.verify(
      'HMAC',
      await clave(secreto),
      desdeBase64url(firma) as unknown as BufferSource,
      CODIFICADOR.encode(cuerpo),
    );
  } catch {
    return null;
  }
  if (!valida) return null;

  const [usuario, expira] = cuerpo.split('.');
  const cuando = Number(expira);
  if (!usuario || !Number.isFinite(cuando) || cuando <= ahora) return null;

  return { usuario: decodeURIComponent(usuario), expira: cuando };
}

/** Como `encodeURIComponent`, y además el punto, que es nuestro separador. */
function escapar(s: string): string {
  return encodeURIComponent(s).replace(/\./g, '%2E');
}

/** Nombre de la cookie. En un solo sitio, que la usan tres archivos. */
export const COOKIE = 'oris_sesion';

/** Cuánto dura una sesión. Una semana: es un panel personal, no un banco. */
export const DURACION_SEGUNDOS = 7 * 24 * 60 * 60;
