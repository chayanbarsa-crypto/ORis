---
proyecto: ORis
tipo: especificación
estado: incompleta
fecha: 2026-08-16
tags: [oris, especificacion, panel, ux, system-prompt]
---

# ORis — Especificación de Panel Principal & System Prompt

> ⚠️ **Recibida incompleta.** De este documento sólo llegó el encabezado y la
> primera frase de la sección 1; se corta tras "el núcleo visual dinámico".
> Falta el resto de la sección 1 y, por el título, toda la parte de System
> Prompt. Pendiente de recibir el original completo.

## 1. Arquitectura de Interfaz y UX (Dashboard + Copiloto IA)

El panel principal integra la navegación analítica con un sistema conversacional
fluido, donde el avatar en forma de constelación actúa como el núcleo visual
dinámico.

---

## Qué implica lo poco que ha llegado

Aun truncada, la frase fija tres cosas y encajan con lo que ya existe:

- **Dashboard y copiloto conviven en la misma pantalla**, no en pestañas
  separadas. IRES ya tiene las dos piezas declaradas y vacías: `FinanceSidebar`
  y `ChatPanel`.
- **La constelación es el núcleo visual, no un adorno de fondo.** Deja de ser
  sólo la pantalla de desbloqueo y pasa a presidir el panel — que es
  exactamente para lo que sirve la máquina de 10 estados × 6 emociones de
  `lib/ires/state.ts`.
- **"Navegación analítica"** implica agregados sobre los movimientos: por
  categoría, por periodo, por cuenta. El modelo de datos de la fase 2 ya los
  soporta con sus índices.

## Preguntas que el documento completo debería responder

- ¿El System Prompt del copiloto ve los movimientos del usuario? Si sí, hay que
  decidir qué se le manda y qué no.
- ¿El copiloto sólo responde, o también **actúa** (recategorizar, marcar,
  archivar)? Cambia por completo la fase 4.
- ¿Qué manda en el panel: el chat o los datos? En móvil no caben los dos a la
  vez y hay que elegir cuál se colapsa.
