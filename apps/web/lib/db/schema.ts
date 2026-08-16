/**
 * Modelo de datos de ORis.
 *
 * Tres decisiones que conviene no revisar a la ligera:
 *
 * 1. **El dinero nunca es un `number`.** Todos los importes son `numeric(14,2)`
 *    y viajan a TypeScript como `string`. Un `float` de JavaScript no puede
 *    representar 0,10 € exactamente, y el motor de auditoría comprueba cuadres
 *    aritméticos: con coma flotante, «saldo inicial + movimientos = saldo final»
 *    fallaría por céntimos fantasma. Se convierte con decimales sólo al pintar.
 *
 * 2. **Los extractos se deduplican por hash del fichero.** Subir dos veces el
 *    mismo PDF es lo más fácil del mundo desde el móvil, y duplicar movimientos
 *    corrompe cualquier cuadre posterior sin dar la cara.
 *
 * 3. **La categorización guarda su procedencia.** Una categoría puesta a mano
 *    no la puede sobrescribir ni una regla ni el modelo: `origen = 'manual'`
 *    gana siempre. Sin este campo, un reprocesado borraría el trabajo del
 *    usuario en silencio.
 */

import { relations } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Quién asignó la categoría. `manual` es inviolable para los procesos automáticos. */
export const origenCategoria = pgEnum('origen_categoria', ['regla', 'ia', 'manual']);

/** Espejo de `severidad` en `oris_core.dominio`. El orden es el de PESO_SEVERIDAD. */
export const severidad = pgEnum('severidad', [
  'Crítica',
  'Alta',
  'Media',
  'Baja',
  'Informativa',
]);

/** Espejo de `estado` en `oris_core.dominio.Hallazgo`. */
export const estadoHallazgo = pgEnum('estado_hallazgo', [
  'Cumple',
  'No cumple',
  'Requiere revisión',
  'No evaluable',
]);

export const estadoExtracto = pgEnum('estado_extracto', [
  'pendiente',
  'procesando',
  'auditado',
  'error',
]);

// ---------------------------------------------------------------------------
// Extracto — un PDF subido
// ---------------------------------------------------------------------------

export const extractos = pgTable(
  'extractos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: text('usuario_id').notNull(),

    nombreFichero: text('nombre_fichero').notNull(),
    /** SHA-256 del PDF. Ancla de la deduplicación. */
    hash: text('hash').notNull(),
    tamanoKb: numeric('tamano_kb', { precision: 10, scale: 1 }),
    paginas: integer('paginas'),

    banco: text('banco'),
    iban: text('iban'),
    periodoInicio: date('periodo_inicio'),
    periodoFin: date('periodo_fin'),
    saldoInicial: numeric('saldo_inicial', { precision: 14, scale: 2 }),
    saldoFinal: numeric('saldo_final', { precision: 14, scale: 2 }),

    estado: estadoExtracto('estado').notNull().default('pendiente'),
    /** 0–100, tal como lo calcula `calcular_cumplimiento`. */
    cumplimiento: integer('cumplimiento'),
    /** "Reglas deterministas (sin IA)" o el modelo empleado. */
    motor: text('motor'),
    modelo: text('modelo'),
    /** Metadatos del PDF devueltos por `leer_pdf`. */
    metadatos: jsonb('metadatos'),

    subidoEn: timestamp('subido_en', { withTimezone: true }).notNull().defaultNow(),
    auditadoEn: timestamp('auditado_en', { withTimezone: true }),
  },
  (t) => ({
    // Un mismo PDF, una sola vez por usuario. Distintos usuarios pueden tener el mismo.
    unicoPorUsuario: uniqueIndex('extractos_usuario_hash_idx').on(t.usuarioId, t.hash),
    porPeriodo: index('extractos_periodo_idx').on(t.usuarioId, t.periodoInicio),
  }),
);

// ---------------------------------------------------------------------------
// Categoría — jerárquica, con reglas de auto-asignación
// ---------------------------------------------------------------------------

export const categorias = pgTable(
  'categorias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: text('usuario_id').notNull(),
    nombre: text('nombre').notNull(),
    /** Categoría padre, para jerarquías tipo Hogar → Suministros → Luz. */
    padreId: uuid('padre_id'),
    color: text('color'),
    /** Orden de presentación; menor primero. */
    orden: integer('orden').notNull().default(0),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unicaPorUsuario: uniqueIndex('categorias_usuario_nombre_idx').on(t.usuarioId, t.nombre),
  }),
);

/**
 * Regla de auto-asignación: si el concepto casa con `patron`, cae en la categoría.
 * `prioridad` desempata cuando varias casan — gana la más alta.
 */
export const reglasCategorizacion = pgTable(
  'reglas_categorizacion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: text('usuario_id').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    /** Expresión regular, insensible a mayúsculas, contra el concepto. */
    patron: text('patron').notNull(),
    prioridad: integer('prioridad').notNull().default(0),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    porUsuario: index('reglas_cat_usuario_idx').on(t.usuarioId, t.prioridad),
  }),
);

// ---------------------------------------------------------------------------
// Movimiento — un apunte del extracto
// ---------------------------------------------------------------------------

export const movimientos = pgTable(
  'movimientos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extractoId: uuid('extracto_id')
      .notNull()
      .references(() => extractos.id, { onDelete: 'cascade' }),
    usuarioId: text('usuario_id').notNull(),

    fecha: date('fecha').notNull(),
    /** Fecha valor, cuando el banco la distingue de la de operación. */
    fechaValor: date('fecha_valor'),
    concepto: text('concepto').notNull(),
    /** Negativo = cargo, positivo = abono. Nunca un float: ver cabecera. */
    importe: numeric('importe', { precision: 14, scale: 2 }).notNull(),
    /** Saldo tras el apunte, si el extracto lo trae. Permite cuadrar. */
    saldo: numeric('saldo', { precision: 14, scale: 2 }),

    categoriaId: uuid('categoria_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    origen: origenCategoria('origen'),
    /** Confianza 0–100 cuando la categoría la puso el modelo. */
    confianza: integer('confianza'),

    /** Orden del apunte dentro del extracto: los bancos no siempre dan hora. */
    posicion: integer('posicion').notNull().default(0),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    porExtracto: index('movimientos_extracto_idx').on(t.extractoId, t.posicion),
    porFecha: index('movimientos_usuario_fecha_idx').on(t.usuarioId, t.fecha),
    porCategoria: index('movimientos_categoria_idx').on(t.usuarioId, t.categoriaId),
  }),
);

// ---------------------------------------------------------------------------
// Hallazgo — la salida del auditor, persistida
// ---------------------------------------------------------------------------

/** Espejo exacto de `oris_core.dominio.Hallazgo`, con su extracto de origen. */
export const hallazgos = pgTable(
  'hallazgos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extractoId: uuid('extracto_id')
      .notNull()
      .references(() => extractos.id, { onDelete: 'cascade' }),

    regla: text('regla').notNull(),
    pagina: integer('pagina').notNull(),
    severidad: severidad('severidad').notNull(),
    estado: estadoHallazgo('estado').notNull(),
    descripcion: text('descripcion').notNull(),
    /**
     * Invariante heredada del motor: todo hallazgo cita el texto que lo motiva.
     * Vacía sólo en los "Cumple" y en los "No evaluable".
     */
    evidencia: text('evidencia').notNull().default(''),
    sugerencia: text('sugerencia').notNull().default(''),
  },
  (t) => ({
    porExtracto: index('hallazgos_extracto_idx').on(t.extractoId, t.severidad),
  }),
);

// ---------------------------------------------------------------------------
// Relaciones
// ---------------------------------------------------------------------------

export const extractosRel = relations(extractos, ({ many }) => ({
  movimientos: many(movimientos),
  hallazgos: many(hallazgos),
}));

export const movimientosRel = relations(movimientos, ({ one }) => ({
  extracto: one(extractos, {
    fields: [movimientos.extractoId],
    references: [extractos.id],
  }),
  categoria: one(categorias, {
    fields: [movimientos.categoriaId],
    references: [categorias.id],
  }),
}));

export const categoriasRel = relations(categorias, ({ one, many }) => ({
  padre: one(categorias, {
    fields: [categorias.padreId],
    references: [categorias.id],
    relationName: 'jerarquia',
  }),
  hijas: many(categorias, { relationName: 'jerarquia' }),
  movimientos: many(movimientos),
  reglas: many(reglasCategorizacion),
}));

export const hallazgosRel = relations(hallazgos, ({ one }) => ({
  extracto: one(extractos, {
    fields: [hallazgos.extractoId],
    references: [extractos.id],
  }),
}));

export const reglasCategorizacionRel = relations(reglasCategorizacion, ({ one }) => ({
  categoria: one(categorias, {
    fields: [reglasCategorizacion.categoriaId],
    references: [categorias.id],
  }),
}));

export type Extracto = typeof extractos.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type Categoria = typeof categorias.$inferSelect;
export type HallazgoDB = typeof hallazgos.$inferSelect;
