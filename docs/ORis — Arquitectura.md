---
proyecto: ORis
tipo: decisión de arquitectura
estado: vigente
fecha: 2026-08-16
tags: [oris, arquitectura, adr]
---

# ORis — Arquitectura

> Sustituye a la primera propuesta de [[ORis — Fusión IRES + Auditoría IDP]].
> Dos requisitos posteriores la cambiaron: **acceso multidispositivo** y
> **guardar y categorizar extractos**.

## Los dos requisitos que mandan

1. **Multidispositivo** — móvil, tablet, ordenador. Descarta Streamlit como
   interfaz sin discusión: no sostiene el canvas ni el desbloqueo por
   constelación, y su layout no es responsive de verdad.
2. **Categorizar y guardar** — aparece algo que **ninguno de los dos proyectos
   tenía**: persistencia. IRES no tiene backend. La auditoría dice
   explícitamente *"sin persistencia en disco"*. Si quieres categorizar en la
   tablet y consultarlo en el móvil, los datos viven en un servidor.

## Decisión

**Monorepo. `apps/web` es IRES tal cual y sigue siendo la única cara. El motor
de auditoría vive en `packages/core` como Python puro. La persistencia es
nueva y se diseña desde cero.**

```
oris/
  apps/web/          Next.js 15 · React 19 · Tailwind · framer-motion
  packages/core/     oris_core — auditoría de PDF en Python puro
  docs/              esta bóveda
```

### Qué se conserva de cada uno

**De IRES, la estructura entera.** Constelación de desbloqueo, campo estelar,
tema centralizado, `FinanceSidebar`, `ChatPanel`, y sobre todo la máquina de
10 estados × 6 emociones. Esa máquina deja de ser decorativa: pasa a reflejar
lo que hace el motor de verdad.

**De la auditoría, el motor — con un matiz importante.** De las 6 reglas, para
extractos bancarios sólo aplican tres:

| Regla | ¿Sirve para extractos? |
|---|---|
| Validación de Importes | ✅ saldo inicial + movimientos = saldo final |
| Cumplimiento de Fechas | ✅ orden cronológico de los apuntes |
| Identificadores Fiscales | ✅ IBAN de la cuenta |
| Estructura de Datos | 〜 parcial: continuidad de paginación |
| Verificación de Firmas | ❌ es de facturas y contratos |
| Protección de Datos | ❌ ídem |

Lo que **sí** se reaprovecha entero, y es lo valioso, es el **motor IA con JSON
Schema estricto y adjunto del PDF nativo**: cada banco maqueta el extracto a su
manera, y esa es exactamente la herramienta para extraer movimientos de
estructuras que no conoces de antemano.

**Se queda fuera:** la captura de leads, el aviso SMTP y los textos RGPD del
responsable. Son de la demo comercial pública; ORis es herramienta personal.

## Verificación de la extracción (fase 1)

`app.py` resultó estar **ya desacoplado de Streamlit**: cero llamadas a `st.`
en las 1.205 líneas de lógica. La extracción fue un corte que sólo necesitó tres
imports que faltaban (`extraer_campos`, `SEVERIDADES`, `timezone`) y ni una
línea de lógica nueva.

Los dos PDFs de ejemplo lo demuestran, y quedan como test permanente en
`packages/core/tests/`:

```
✅ ejemplo_conforme.pdf      → 0 incumplimientos, 100 % cumplimiento
✅ ejemplo_con_errores.pdf   → exactamente 7, uno por defecto deliberado
✅ reparto por regla exacto  → importes 1, fechas 1, estructura 1,
                                identificadores 2, firmas 1, LOPD 1
✅ ningún hallazgo sin evidencia citada
```

## Lo que falta decidir

### Persistencia — resuelta (fase 2)
**Postgres con Drizzle.** El esquema vive en `apps/web/lib/db/schema.ts` y la
migración en `apps/web/drizzle/`. Sirve igual Neon que Supabase: sólo cambia la
`DATABASE_URL`.

`Extracto` → `Movimiento` → `Categoría`, más `Hallazgo` (espejo de
`oris_core.dominio.Hallazgo`, para que la auditoría quede guardada junto a los
datos que audita) y `ReglaCategorizacion`.

Las decisiones y sus porqués están en
[[2026-08-16 — Sesión 2, persistencia]]. Resumen: el dinero es `numeric(14,2)` y
nunca un `number`; los extractos se deduplican por hash; la categorización
guarda su procedencia y lo manual gana siempre.

**Lo único que falta es la cuenta.** Recomendación: **Supabase**, porque además
del Postgres trae autenticación de servidor — justo lo que le falta al
desbloqueo por constelación, que no es seguridad. Con Neon habría que añadir
auth aparte.

### Dónde corre el motor Python
Tres opciones, con un aviso importante:

1. **Funciones Python en Vercel** (`/api/*.py`): un solo despliegue, un dominio,
   sin CORS. ⚠️ Límite de 10 s de ejecución en el plan gratuito — una llamada a
   la API sobre un extracto de varias páginas se puede pasar. Exigiría trabajo
   en segundo plano con sondeo.
2. **Servicio aparte (Render / Fly / HF Spaces)**: sin límite de tiempo, pero el
   plan gratuito de Render **duerme a los 15 minutos** → 50 s de arranque en
   frío la primera vez que abras ORis en el móvil. Malo para una herramienta de
   uso esporádico desde el teléfono.
3. **Portar a TypeScript sólo la parte de extractos** y dejar `packages/core`
   como implementación de referencia y para lotes pesados.

Mi recomendación es empezar por la **3 para el flujo interactivo** (el SDK de
Anthropic en TS adjunta PDFs igual de bien) y conservar `packages/core` para
procesamiento en lote, donde el tiempo de arranque da igual.

### Autenticación
El desbloqueo por constelación **no es seguridad** — lo dice el propio
`accessConfig.ts`. Con extractos bancarios reales de por medio, hace falta auth
de servidor. La constelación puede quedarse como capa estética *encima* del
login real, que es donde aporta.

### Responsive y táctil
La constelación se traza arrastrando. En escritorio son eventos de ratón; en
móvil y tablet hacen falta *pointer events* y evitar el desplazamiento de la
página durante el trazo. Es trabajo real de la fase 5, no un ajuste de CSS.
