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

import { desc } from 'drizzle-orm';

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
    return {
      movimientos: [],
      motivo:
        'La base de datos está configurada pero la consulta falló: ' +
        `${(e as Error).message}. ¿Se aplicó drizzle/0000_modelo_inicial.sql?`,
    };
  }
}
