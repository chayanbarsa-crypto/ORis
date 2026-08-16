/**
 * Conexión a Postgres.
 *
 * Sirve igual para Neon o Supabase: los dos son Postgres y sólo cambia la URL.
 * Sin `DATABASE_URL` definida no se conecta y no se inventa nada — se lanza al
 * usarla, no al importar, para que el resto de la aplicación siga arrancando.
 * Es la misma regla que trae IRES: lo que no existe está deshabilitado y lo dice.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const url = process.env.DATABASE_URL;

export const hayBaseDeDatos = Boolean(url);

let cliente: ReturnType<typeof postgres> | null = null;

function conectar() {
  if (!url) {
    throw new Error(
      'DATABASE_URL no está definida. Copia .env.example a .env.local y ' +
        'pega ahí la cadena de conexión de Neon o Supabase.',
    );
  }
  // `prepare: false` es obligatorio detrás de un pool en modo transacción
  // (el pooler de Supabase y el de Neon lo están): las sentencias preparadas
  // no sobreviven al salto entre conexiones del pool.
  cliente ??= postgres(url, { prepare: false });
  return cliente;
}

export function db() {
  return drizzle(conectar(), { schema });
}

export { schema };
