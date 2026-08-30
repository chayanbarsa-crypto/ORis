/**
 * El PIN.
 *
 * **El PIN no se guarda en ninguna parte**: se guarda una derivación `scrypt`
 * con su sal, en una variable de entorno. Ni el repositorio ni la base de datos
 * llegan a ver el número, así que ni un volcado ni un `git log` lo revelan.
 *
 * `scrypt` y no SHA-256 a secas porque un PIN de cuatro cifras son diez mil
 * posibilidades: con un hash rápido, quien consiga la variable las prueba todas
 * en un segundo. Con este coste, cada intento cuesta decenas de milisegundos y
 * probarlas todas pasa de un segundo a varios minutos. Cuatro cifras siguen
 * siendo cuatro cifras: lo que de verdad protege es el límite de intentos, y la
 * mejora real es un PIN de seis.
 *
 * Esto es Node y sólo Node: el `middleware` no puede usarlo. Allí no hace
 * falta — el borde verifica la cookie firmada, no el PIN.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Coste de `scrypt`.
 *
 * 2^14 con r=8 pide 16 MB por intento. Con 2^15 son 32 MB y Node rechaza la
 * llamada con «memory limit exceeded», porque su tope por defecto son
 * exactamente 32 MB — el error no aparece al escribirlo, aparece la primera vez
 * que alguien intenta entrar. El tope se sube explícitamente para que el margen
 * sea una decisión y no una casualidad.
 */
const COSTE = 16_384;
const MAX_MEMORIA = 64 * 1024 * 1024;
const LONGITUD = 32;

/** «sal:derivación», ambos en hexadecimal. Es lo que se guarda en el entorno. */
export function derivar(pin: string, sal = randomBytes(16).toString('hex')): string {
  const clave = scryptSync(pin.trim(), sal, LONGITUD, { N: COSTE, r: 8, p: 1, maxmem: MAX_MEMORIA });
  return `${sal}:${clave.toString('hex')}`;
}

/**
 * ¿Es este el PIN? Comparación en tiempo constante: con `===`, el tiempo de
 * respuesta delata cuántos bytes iniciales acertó quien prueba.
 */
export function comprobar(pin: string, guardado: string | undefined): boolean {
  if (!guardado) return false;
  const [sal, esperado] = guardado.split(':');
  if (!sal || !esperado) return false;

  try {
    const calculado = scryptSync(pin.trim(), sal, LONGITUD, { N: COSTE, r: 8, p: 1, maxmem: MAX_MEMORIA });
    const referencia = Buffer.from(esperado, 'hex');
    if (referencia.length !== calculado.length) return false;
    return timingSafeEqual(calculado, referencia);
  } catch {
    return false;
  }
}

/** Un PIN aceptable: sólo dígitos, de 4 a 8. */
export function formaValida(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin.trim());
}
