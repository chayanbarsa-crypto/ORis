---
proyecto: ORis
tipo: sesión
fecha: 2026-08-16
tags: [oris, sesion, bitacora, persistencia, postgres]
---

# 2026-08-16 · Sesión 2 — el modelo de datos

## Qué se hizo
Modelo de datos completo en Drizzle (`apps/web/lib/db/schema.ts`), migración SQL
generada y **aplicada contra un Postgres 16 real**, no dada por buena.

Cinco tablas: `extractos` → `movimientos` → `categorias`, más `hallazgos`
(espejo de `oris_core.dominio.Hallazgo`) y `reglas_categorizacion`.

## Las tres decisiones que no conviene revisar a la ligera

### 1. El dinero nunca es un `number`
Todos los importes son `numeric(14,2)`. Un `float` de JavaScript no representa
0,10 € exactamente, y el auditor comprueba cuadres aritméticos: con coma
flotante, «saldo inicial + movimientos = saldo final» fallaría por céntimos
fantasma. Verificado: `0,10 + 0,20 = 0,30` clavado.

### 2. Los extractos se deduplican por hash del fichero
Subir dos veces el mismo PDF desde el móvil es lo más fácil del mundo, y
duplicar movimientos corrompe cualquier cuadre posterior **sin dar la cara**.
Índice único sobre `(usuario_id, hash)` — el mismo hash sí puede repetirse
entre usuarios distintos.

### 3. La categorización guarda su procedencia
`origen ∈ {regla, ia, manual}`. Una categoría puesta a mano no la puede
sobrescribir ni una regla ni el modelo. Sin este campo, un reprocesado borraría
el trabajo del usuario en silencio.

## Invariantes verificadas contra Postgres real

```
OK  duplicado rechazado por el índice único
OK  el mismo hash convive entre usuarios distintos
OK  0,10 + 0,20 = 0,30 exacto
OK  saldo inicial + movimientos = saldo final
OK  el borrado en cascada no deja huérfanos
OK  borrar una categoría descategoriza, no destruye el apunte
```

Quedan como script permanente en `apps/web/drizzle/pruebas/invariantes.sql`.

Esa última merece un comentario: borrar una categoría **no** puede llevarse por
delante los movimientos que la usaban. `ON DELETE SET NULL`, no `CASCADE`. Es la
clase de error que no se nota hasta que has perdido un año de apuntes.

## Siguiente
1. Elegir proveedor de Postgres y pegar `DATABASE_URL` — es lo único que falta
   para que esto corra de verdad. Ver [[ORis — Arquitectura]].
2. Extraer movimientos del PDF con el motor IA (JSON Schema estricto).
3. Motor de categorización: primero `reglas_categorizacion`, y sólo lo que no
   case va al modelo.
