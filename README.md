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
    lib/db/         modelo de datos en Drizzle
    drizzle/        migraciones SQL y pruebas de invariantes
packages/
  core/             oris_core: núcleo de auditoría en Python puro (el motor)
docs/               bóveda de Obsidian con las decisiones de diseño
```

## Estado

| Fase | Trabajo | Estado |
|---|---|---|
| 0 | Monorepo, IRES en `apps/web` | ✅ |
| 1 | Extraer el núcleo de auditoría a `packages/core` | ✅ verificado |
| 2 | Persistencia (extractos, movimientos, categorías) | ✅ verificado |
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

### Sobre la fase 2

Cinco tablas: `extractos` → `movimientos` → `categorias`, más `hallazgos` y
`reglas_categorizacion`. La migración se aplicó contra un Postgres 16 real y
seis invariantes quedan como script permanente:

```bash
cd apps/web
createdb oris
psql -d oris -f drizzle/0000_modelo_inicial.sql
psql -v ON_ERROR_STOP=1 -d oris -f drizzle/pruebas/invariantes.sql
```

- deduplicación por hash del fichero, y el mismo hash convive entre usuarios
- `0,10 + 0,20 = 0,30` exacto — el dinero es `numeric`, nunca un `number`
- `saldo inicial + movimientos = saldo final` cuadra
- el borrado de un extracto no deja movimientos ni hallazgos huérfanos
- borrar una categoría **descategoriza**, no destruye el apunte

Falta únicamente la `DATABASE_URL` de un Postgres gestionado. Ver `.env.example`.

### Sobre la fase 3

`packages/core/oris_core/extractos.py` extrae los movimientos de un extracto
bancario con JSON Schema estricto y PDF nativo adjunto, y **valida el resultado
antes de darlo por bueno**:

```bash
cd packages/core
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/python extraer.py mi-extracto.pdf          # resumen legible
.venv/bin/python extraer.py mi-extracto.pdf --json   # transcripción completa
```

La invariante es `saldo inicial + Σ movimientos = saldo final`. Si no cuadra, la
extracción se declara incompleta y el CLI sale con código 1 — mejor no guardar
nada que guardar movimientos a medias.

Hay dos fixtures, ambos sintéticos pero con maquetaciones distintas:

| Fixture | Maquetación |
|---|---|
| `extracto_ejemplo.pdf` | Una columna de importe con signo |
| `extracto_dos_columnas.pdf` | Dos columnas entrada/salida sin signo, fechas partidas, saldo corrido |

El segundo reproduce la maquetación de un extracto real. **En dos columnas el
signo lo determina la columna, no el número** — y si el modelo se equivoca, el
desvío del cuadre es el doble del importe, no el importe.

> ⚠️ Los fixtures verifican la **validación**, no la extracción: sé que el
> validador caza el error de columnas, no si el modelo lo comete. Falta una
> pasada con `ANTHROPIC_API_KEY` sobre un extracto real.
>
> Los extractos reales **no se versionan**: llevan nombre, domicilio, IBAN e
> historial completo, y el historial de git es permanente.

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

Punto de entrada: [`docs/ORis — Resumen del proyecto.md`](docs/).

Las decisiones de diseño viven en `docs/`, escritas como bóveda de Obsidian
(frontmatter YAML y enlaces `[[wiki]]`). Ver
[`docs/ORis — Cómo sincronizar con Obsidian en iPad.md`](docs/) para el montaje
con Working Copy.
