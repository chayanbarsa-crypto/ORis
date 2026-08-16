# ORis

Inteligencia financiera con interfaz espacial y auditoría documental.
Fusión de dos proyectos previos:

| Origen | Qué aporta |
|---|---|
| [IRES](https://github.com/chayanbarsa-crypto/IRES) | Interfaz, identidad y máquina de estados |
| [Auditoría Documental IDP](https://github.com/chayanbarsa-crypto/auditoria-documental-idp) | Motor de auditoría de PDF, reglas deterministas y motor IA |

Objetivo de ORis: **auditar extractos bancarios, categorizarlos y guardarlos**,
accesible desde cualquier dispositivo — móvil, tablet u ordenador.

---

## Estructura

```
apps/
  web/              IRES: Next.js 15 + React 19 + Tailwind (la cara)
packages/
  core/             oris_core: núcleo de auditoría en Python puro (el motor)
docs/               bóveda de Obsidian con las decisiones de diseño
```

## Estado

| Fase | Trabajo | Estado |
|---|---|---|
| 0 | Monorepo, IRES en `apps/web` | ✅ |
| 1 | Extraer el núcleo de auditoría a `packages/core` | ✅ verificado |
| 2 | Persistencia (extractos, movimientos, categorías) | ⬜ |
| 3 | Agente de categorización de movimientos | ⬜ |
| 4 | Conectar la máquina de estados a los eventos del motor | ⬜ |
| 5 | Responsive / PWA y despliegue | ⬜ |

### Sobre la fase 1

El núcleo salió de `app.py` **por corte, no por reescritura**: aquel fichero, pese
a sus 2.256 líneas, no tenía una sola llamada a `st.` en las 1.205 líneas de
lógica. La extracción necesitó exactamente tres imports que faltaban y ni una
línea de lógica nueva.

Los dos PDFs de ejemplo son la red de seguridad de esa afirmación:

```bash
cd packages/core
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest tests -q
```

- `ejemplo_conforme.pdf` → 0 incumplimientos, 100 % de cumplimiento
- `ejemplo_con_errores.pdf` → exactamente 7, uno por cada defecto deliberado
- y ningún hallazgo sin evidencia citada

## Arranque del front

```bash
cd apps/web
npm install
npm run dev
```

Requiere Node.js 18.18 o superior. Abre `http://localhost:3000`.

El patrón de desbloqueo es el pez septentrional de Piscis:
`Alrescha → Omicron → Eta → Tau → Phi`. Se cambia en
`apps/web/lib/constellation/pisces.ts`.

> ⚠️ El desbloqueo por constelación **no es seguridad** — el patrón acaba en el
> bundle de JavaScript. Es una cerradura de conveniencia. En cuanto ORis maneje
> extractos bancarios reales hará falta autenticación de servidor.

## Documentación

Las decisiones de diseño viven en `docs/`, escritas como bóveda de Obsidian
(frontmatter YAML y enlaces `[[wiki]]`). Ver
[`docs/ORis — Cómo sincronizar con Obsidian en iPad.md`](docs/) para el montaje
con Working Copy.
