---
proyecto: ORis
tipo: resumen
estado: vigente
fecha: 2026-08-16
tags: [oris, resumen, indice, moc]
---

# ORis — resumen del proyecto

> Nota índice. Para el detalle, seguir los enlaces.
> Repositorio: https://github.com/chayanbarsa-crypto/ORis-

---

## Qué es ORis

Inteligencia financiera con interfaz espacial que **audita extractos bancarios,
los categoriza y los guarda**, accesible desde cualquier dispositivo.

Nace de fusionar dos proyectos que no compartían ni una línea de código:

| Origen | Estado previo | Qué aporta |
|---|---|---|
| [[IRES]] · Next.js 15 · TypeScript | Fase 1, sin backend | La cara: interfaz, identidad, máquina de estados |
| Auditoría Documental IDP · Python | Producto acabado | El motor: PDF, reglas, IA, informes |

La fusión fue de **arquitectura, no de ficheros**. Análisis de partida en
[[ORis — Fusión IRES + Auditoría IDP]]; decisión vigente en [[ORis — Arquitectura]].

---

## Estructura

```
apps/web/          IRES íntegro — Next.js 15, React 19, Tailwind, framer-motion
  lib/db/          modelo de datos en Drizzle
  drizzle/         migraciones SQL y pruebas de invariantes
packages/core/     oris_core — auditoría de PDF en Python puro
docs/              esta bóveda
```

---

## Estado por fases

| Fase | Trabajo | Estado |
|---|---|---|
| 0 | Monorepo, IRES en `apps/web` | ✅ |
| 1 | Núcleo de auditoría extraído a `packages/core` | ✅ verificado |
| 2 | Persistencia: extractos, movimientos, categorías | ✅ verificado |
| 3 | Extracción de movimientos del PDF con el motor IA | ⬜ **siguiente** |
| 4 | Motor de categorización | ⬜ |
| 5 | Panel principal + copiloto conversacional | ⬜ |
| 6 | Estados de la constelación cableados al motor | ⬜ |
| 7 | Responsive / táctil / PWA y despliegue | ⬜ |

---

## Lo verificado, no lo supuesto

### Fase 1 — la extracción del núcleo
`app.py` parecía un monolito de 2.256 líneas. **No lo era: cero llamadas a `st.`
antes de la línea 1.206.** La lógica ya estaba separada de la interfaz, sólo que
conviviendo en el mismo fichero. La extracción a seis módulos necesitó **tres
imports** y ni una línea de lógica nueva.

*Un fichero largo no es lo mismo que un fichero acoplado.*

Los dos PDFs de ejemplo quedan como red de seguridad permanente:

```
✅ conforme.pdf     → 0 incumplimientos, 100 % cumplimiento
✅ con_errores.pdf  → exactamente 7, uno por defecto deliberado
✅ reparto por regla exacto
✅ ningún hallazgo sin evidencia citada
```

### Fase 2 — el modelo de datos
Migración aplicada contra un **Postgres 16 real**, no dada por buena:

```
✅ duplicado rechazado por el índice único
✅ el mismo hash convive entre usuarios distintos
✅ 0,10 + 0,20 = 0,30 exacto
✅ saldo inicial + movimientos = saldo final
✅ el borrado en cascada no deja huérfanos
✅ borrar una categoría descategoriza, no destruye el apunte
```

### Y además
`npm install` + `tsc --noEmit` sin errores tras trasladar IRES y añadir Drizzle.

---

## Decisiones que sostienen el resto

**El dinero nunca es un `number`.** `numeric(14,2)` en todas partes. Un `float`
de JavaScript no representa 0,10 € exactamente y el auditor comprueba cuadres
aritméticos: con coma flotante, «saldo inicial + movimientos = saldo final»
fallaría por céntimos fantasma.

**Los extractos se deduplican por hash del fichero.** Subir dos veces el mismo
PDF desde el móvil es trivial, y duplicar movimientos corrompe cualquier cuadre
posterior *sin dar la cara*.

**La categorización guarda su procedencia** (`regla` / `ia` / `manual`) y lo
manual gana siempre. Sin ese campo, un reprocesado borraría el trabajo del
usuario en silencio. Por lo mismo, borrar una categoría es `SET NULL` y no
`CASCADE`: descategoriza el apunte, no lo destruye.

**No se simula backend.** Regla heredada de IRES: lo que no existe está
deshabilitado y lo dice. Sin `DATABASE_URL`, la conexión lanza al usarse — no al
importar — y el resto de la aplicación sigue arrancando.

**De las 6 reglas del auditor, para extractos sólo aplican tres**: cuadre de
importes, orden cronológico e IBAN. Firmas y protección de datos son de facturas
y contratos. Lo que se reaprovecha entero es el **motor IA con JSON Schema
estricto y adjunto del PDF nativo**, que es justo lo que hace falta cuando cada
banco maqueta el extracto a su manera.

---

## Riesgos abiertos

**El desbloqueo por constelación no es seguridad.** Lo dice el propio
`accessConfig.ts`: el patrón acaba en el bundle de JavaScript. Con extractos
bancarios reales de por medio hace falta autenticación de servidor. La
constelación se queda como capa estética *encima* del login real.

**El trazo de la constelación es de ratón.** En móvil y tablet hacen falta
*pointer events* y bloquear el desplazamiento de la página durante el trazo. Es
trabajo real, no un ajuste de CSS.

**Dónde corre el motor Python.** Vercel limita a 10 s en plan gratuito (corto
para una llamada a la API sobre un extracto de varias páginas) y Render duerme a
los 15 minutos (50 s de arranque en frío la primera vez que abras ORis en el
móvil). Recomendación: portar a TypeScript el flujo interactivo y dejar
`packages/core` para lotes pesados.

---

## Lo único que bloquea

**Una cuenta de Postgres.** Recomendado **Supabase** sobre Neon — no por la base
de datos, que es equivalente, sino porque trae la autenticación de servidor que
le falta a ORis. Se copia la cadena del *pooler* (puerto 6543) a `DATABASE_URL`.

---

## Bitácora
- [[2026-08-16 — Sesión 1, fusión]]
- [[2026-08-16 — Sesión 2, persistencia]]

## Especificación recibida
- [[ORis — Especificación de Panel Principal (parcial)]] ⚠️ incompleta
