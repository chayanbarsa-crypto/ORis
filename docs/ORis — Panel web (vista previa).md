---
proyecto: ORis
tipo: enlace
creado: 2026-08-17
---

# ORis — Panel web (vista previa)

**Enlace:** https://claude.ai/code/artifact/6bb6819d-a552-4d2d-b2c9-e089ef93beb1

Página autocontenida (un solo HTML, sin dependencias externas) que se abre desde
cualquier dispositivo: iPad, móvil, PC. Es **privada** por defecto; sólo se ve si
se comparte desde el menú de la propia página.

## Qué contiene

1. **Desbloqueo por constelación.** Campo de estrellas + Piscis dibujable con el
   dedo o el ratón. La **guía numerada en verde** (`#34D399`, 10,40:1 sobre el
   fondo `#040814`) marca el orden 1‑2‑3‑4 y se desvanece en cuanto empiezas a
   trazar.
2. **PIN de respaldo.** Al **tercer intento fallido** aparece el teclado numérico.
   El PIN es **1692**.
3. **Panel financiero.** Filtro por mes, cuatro KPIs (Ingresos, Gastos, Neto,
   Traspasos), aviso honesto de «N de M sin categorizar», desglose horizontal por
   categoría en un solo tono (`#2D96F0`) con la barra ámbar `#BF8228` para lo
   pendiente, y la tabla de movimientos con etiqueta de origen (regla / IA /
   manual).

## Qué NO contiene

Los datos son los del extracto **sintético** de dos columnas
(`extracto_dos_columnas.pdf`, 20 movimientos, 4,02 → 16,69 €). El extracto real
no está aquí, ni en el repositorio, ni en ningún sitio compartible: la vista
previa se puede compartir con un enlace y los movimientos reales no se comparten.

## Qué falta para un panel «de verdad»

Un despliegue real de `apps/web` (Vercel, Fly, un VPS) con `DATABASE_URL`
apuntando al Postgres donde ya está la ingesta. Eso necesita credenciales que
sólo tiene Jordy — la vista previa no las necesita porque no habla con nada.
