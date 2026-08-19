/**
 * Carga de movimientos desde Postgres, en el servidor.
 *
 * Devuelve siempre un resultado utilizable: si no hay base de datos o falla la
 * consulta, la lista viene vacía y **el motivo viene explicado**. La interfaz
 * lo enseña tal cual.
 *
 * Es la regla de IRES aplicada al panel: lo que no existe está deshabilitado y
 * lo dice. Un panel con datos de ejemplo cuando falta la conexión es peor que
 * uno vacío — parece que funciona, y el fallo se descubre mucho más tarde.
 */

import { desc, sql } from 'drizzle-orm';

import { db, hayBaseDeDatos } from '@/lib/db';
import { movimientos as tablaMovimientos } from '@/lib/db/schema';
import type { MovimientoVista } from './agregados';

export interface CargaMovimientos {
  movimientos: MovimientoVista[];
  /** Null si todo fue bien. Si no, qué pasó, en lenguaje llano. */
  motivo: string | null;
}

export async function cargarMovimientos(limite = 500): Promise<CargaMovimientos> {
  if (!hayBaseDeDatos) {
    return {
      movimientos: [],
      motivo:
        'No hay DATABASE_URL configurada, así que ORis no tiene de dónde leer. ' +
        'Copia apps/web/.env.example a .env.local y pega ahí la cadena de conexión.',
    };
  }

  try {
    const filas = await db()
      .select({
        id: tablaMovimientos.id,
        fecha: tablaMovimientos.fecha,
        concepto: tablaMovimientos.concepto,
        importe: tablaMovimientos.importe,
        categoria: tablaMovimientos.categoriaId,
        origen: tablaMovimientos.origen,
      })
      .from(tablaMovimientos)
      .orderBy(desc(tablaMovimientos.fecha), desc(tablaMovimientos.posicion))
      .limit(limite);

    return {
      movimientos: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        concepto: f.concepto,
        importe: f.importe,
        // `categoriaId` es una referencia; el nombre se resolverá con un join
        // cuando exista el editor de categorías. Hasta entonces no se enseña un
        // UUID haciéndose pasar por el nombre de una categoría.
        categoria: null,
        origen: f.origen,
      })),
      motivo: null,
    };
  } catch (e) {
    return { movimientos: [], motivo: `${await donde()} ${explicar(e)}` };
  }
}

/**
 * ¿Falló la conexión o falló la consulta?
 *
 * Son problemas opuestos —uno se arregla en la cadena de conexión, el otro en
 * la base de datos— y desde fuera se ven idénticos: la página vacía. Un
 * `select 1` los separa. Sólo se ejecuta cuando ya ha fallado algo, así que no
 * cuesta un viaje de más en el camino bueno.
 */
async function donde(): Promise<string> {
  try {
    await db().execute(sql`select 1`);
    return 'Conecté con Postgres, pero la consulta falló:';
  } catch {
    return 'No llegué a conectar con Postgres:';
  }
}

/**
 * Traduce un fallo de Postgres a algo accionable.
 *
 * Drizzle envuelve el error y su mensaje es la consulta entera —que llena la
 * pantalla y no dice nada—; la causa real, el código SQLSTATE con su texto,
 * viaja en `cause`. Sin desenvolverlo, «no existe la tabla» y «la contraseña
 * no vale» se leen igual en pantalla, y son problemas opuestos.
 */
function explicar(e: unknown): string {
  const causa = (e as { cause?: unknown })?.cause;
  const err = (causa ?? e) as { message?: string; code?: string };
  const codigo = err.code ?? '';
  const detalle = err.message ?? String(e);

  const pistas: Record<string, string> = {
    // undefined_table
    '42P01':
      'La conexión funciona, pero en esta base de datos no existe la tabla. ' +
      'El SQL de drizzle/0000_modelo_inicial.sql se aplicó en otro proyecto de ' +
      'Supabase, o no llegó a ejecutarse entero.',
    // invalid_password
    '28P01':
      'La contraseña de la cadena de conexión no es correcta. Si lleva símbolos, ' +
      'hay que codificarlos.',
    // invalid_authorization_specification
    '28000': 'El usuario de la cadena de conexión no vale para esta base de datos.',
    // invalid_catalog_name
    '3D000': 'La base de datos que nombra la cadena de conexión no existe.',
    // insufficient_privilege
    '42501': 'El usuario conecta pero no tiene permiso para leer la tabla.',
  };

  const pista = pistas[codigo];
  return pista ? `${pista} (Postgres ${codigo}: ${detalle})` : detalle;
}
