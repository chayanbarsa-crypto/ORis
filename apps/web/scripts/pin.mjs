/**
 * Genera los dos valores que hay que pegar en el entorno del despliegue.
 *
 *   node scripts/pin.mjs 1692
 *
 * Imprime `ORIS_PIN` y `ORIS_SECRETO`. El PIN se escribe aquí, en tu terminal,
 * y no queda en ninguna parte: lo que sale es una derivación de la que no se
 * puede volver atrás sin probar todas las combinaciones. Por eso este script
 * existe en vez de una constante en el código — una constante quedaría en el
 * historial de git para siempre.
 */

import { randomBytes, scryptSync } from 'node:crypto';

const pin = process.argv[2];

if (!/^\d{4,8}$/.test(pin ?? '')) {
  console.error('Uso: node scripts/pin.mjs <PIN de 4 a 8 dígitos>');
  process.exit(1);
}

const sal = randomBytes(16).toString('hex');
const clave = scryptSync(pin, sal, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

console.log(`ORIS_PIN=${sal}:${clave.toString('hex')}`);
console.log(`ORIS_SECRETO=${randomBytes(32).toString('hex')}`);
console.log('');
console.log('Pega las dos en Vercel → Settings → Environment Variables (Production).');
console.log('El PIN no aparece en ninguna de las dos: no hay forma de leerlo de vuelta.');
