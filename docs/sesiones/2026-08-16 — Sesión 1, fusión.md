---
proyecto: ORis
tipo: sesión
fecha: 2026-08-16
tags: [oris, sesion, bitacora]
---

# 2026-08-16 · Sesión 1 — la fusión

## Qué se decidió
- ORis nace como repositorio propio y privado, no dentro de ninguno de los dos originales.
- Estructura de IRES intacta + el agente auditor encima. Ver [[ORis — Arquitectura]].
- El objetivo se concreta: **auditar extractos bancarios, categorizarlos y guardarlos**,
  desde cualquier dispositivo. Eso introduce persistencia, que no existía en ninguno de los dos.
- Fuera de alcance: captura de leads, aviso SMTP y textos RGPD del responsable.

## Qué se hizo
- Monorepo creado. IRES copiado íntegro a `apps/web`.
- Núcleo de auditoría extraído a `packages/core/oris_core`, repartido en
  `_deps` · `dominio` · `pdf` · `reglas` · `ia` · `informes`.
- Cuatro tests de fidelidad de la extracción, en verde.

## El hallazgo de la sesión
`app.py` parecía un monolito de 2.256 líneas. No lo era: **no hay una sola
llamada a `st.` antes de la línea 1.206**. La lógica ya estaba separada de la
interfaz, sólo que conviviendo en el mismo fichero. Por eso la fase que parecía
más arriesgada costó tres imports.

Merece la pena recordarlo: *un fichero largo no es lo mismo que un fichero
acoplado.*

## Siguiente
1. Elegir persistencia (Postgres gestionado — ver la sección abierta en [[ORis — Arquitectura]]).
2. Modelar `Extracto` → `Movimiento` → `Categoría`.
3. Decidir dónde corre el motor Python (los tres caminos, con sus pegas, están documentados).
