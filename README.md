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
| 6 | Panel: resumen del mes, desglose e histórico | ✅ verificado |
| 7 | Panel de control de pyme: compromisos, línea de tiempo y previsión | ✅ verificado |

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

### Sobre la fase 4

`apps/web/lib/db/ingesta.ts` lleva la salida de `extraer.py --json` a las tablas.
Tres invariantes: **o entra todo o no entra nada** (una transacción), **lo que no
cuadra no se guarda**, y **un PDF una vez** (deduplicación por SHA-256). Tras
insertar, relee lo escrito y recalcula el cuadre en Postgres con `numeric`: si la
conversión perdiera un céntimo, salta dentro de la transacción.

```bash
cd apps/web
createdb oris && psql -d oris -f drizzle/0000_modelo_inicial.sql
DATABASE_URL=postgresql://... npx tsx drizzle/pruebas/ingesta.test.ts
```

15 comprobaciones contra Postgres real. Verificado además con un extracto real de
7 páginas y 92 movimientos: guardado en 32 ms, cuadre intacto, cero rupturas en
la cadena de saldos.

### Sobre la fase 5

`packages/core/oris_core/categorias.py` categoriza por reglas **antes** de tocar
el modelo. No es sólo ahorro: una regla es determinista y auditable —dice qué
patrón casó—, mientras que una categoría del modelo hay que revisarla.

Las reglas casan **patrones, no comercios exactos**: `FRUTERIA|CASQUERIA|
PANADERIA|SUPERMERCAD\w*` cubre el comercio de barrio que nunca estará en un
catálogo. Y el perfil del titular (nombre e IBAN) marca los **traspasos entre
cuentas propias**, que no son ingreso ni gasto — la equivocación que más
descuadra un presupuesto.

Sobre un extracto real de 92 movimientos: **54 % por reglas**, 42 al modelo.

> Invariante: `origen = 'manual'` no lo sobrescribe ni una regla ni el modelo.

### Sobre la fase 6

El panel vive en `apps/web/components/panel/`, y los cálculos —funciones puras,
sin React— en `apps/web/lib/oris/`.

```bash
cd apps/web
npx tsx lib/oris/pruebas/agregados.test.ts   # 30 comprobaciones
npm run dev
```

Tres cosas que lo distinguen de un dashboard cualquiera:

- **El dinero se suma en céntimos enteros**, nunca en euros con coma flotante.
- **Los traspasos entre cuentas propias no son ingreso ni gasto**: se informan
  aparte. En el extracto real eran 8 de los 15 ingresos.
- **El panel confiesa lo que no sabe**: cuántos movimientos están sin revisar y
  si cada categoría la puso una regla, el modelo o tú.

El desglose usa **un solo tono** porque compara magnitudes de una misma medida;
la identidad la lleva la etiqueta. La paleta de emociones de IRES no vale aquí
—`processing` y `empathy` están a ΔE 6,3, indistinguibles— y eso no es un fallo
suyo: esas emociones nunca coinciden en pantalla.

### Sobre la fase 7

El **panel de control** —`components/panel/PanelControl.tsx`, sección «Panel de
control»— lee los mismos movimientos como negocio y no como cuenta corriente.
La diferencia no son más gráficos: son otras preguntas.

```bash
cd apps/web
npx tsx lib/oris/pruebas/recurrencia.test.ts   # 36 comprobaciones
npx tsx lib/oris/pruebas/pyme.test.ts          # 55 comprobaciones
```

Lo que lo sostiene es un módulo: `lib/oris/recurrencia.ts` parte el gasto en
**estructura** —lo que se paga tanto si abres como si no— y **variable**, y lo
hace **por comportamiento, no por categoría**: un cargo es un compromiso si
aparece con cadencia estable. Funciona sin que nadie haya categorizado nada, no
necesita que el catálogo conozca el sector, y de propina detecta lo contrario:
un recibo que llevaba veinte meses y hace cinco que no aparece **no se
proyecta** —sería inventar una factura— y se enseña aparte, porque «desde marzo
no pagas nómina» es un hecho del negocio que ningún total mensual cuenta.

Sobre esa partición se apoyan las tres cifras que un autónomo mira primero:
**cobertura** (si el mes pagó la persiana), **punto de equilibrio en servicios**
(cuántos clientes hacen falta para empezar a ganar) y **días de caja**.

Y la previsión, que es lo que separa este panel de una recta:

- **Lo que sale no es una media, es una lista.** El alquiler del mes que viene
  no se estima: se sabe. Una recta que promedia el gasto total reparte a partes
  iguales lo que cae en fechas concretas, y convierte un mes con vencimiento
  trimestral en un mes normal.
- **Los ingresos tienen estación.** Con dos ciclos completos se mide cuánto pesa
  cada mes del año. Sin ellos no se corrige y se dice — corregir un solo mes y
  dejar los otros once a 1 es un escalón inventado, no media corrección.
- **No es un número, es una banda.** Prudente, esperado y bueno; y `prudente` es
  siempre el que **peor deja la caja**, o sea ingreso bajo *y* gasto alto. Un
  escenario prudente que se imagina facturando poco y gastando poco avisa del
  mes malo cuando ya ha llegado.

Tres errores que costaron cifras y que están fijados en las pruebas:

| Qué pasaba | Qué se veía |
|---|---|
| Presupuestar un cargo en vez del mes | 26 € en lugar de 118 € para una plataforma que cobra por reserva: 78 € al mes de menos, sin que nada lo delatara |
| Estimar el gasto por su mediana | Con impuestos trimestrales la distribución tiene dos jorobas: mediana 342 €, media 694 €. Seis meses así son dos mil euros de menos |
| Índice estacional como mediana del propio mes | Con dos ciclos la mediana de dos valores es uno de los dos: la banda de escenarios se cerraba sobre sí misma y los tres daban la misma cifra |

> El panel se diseñó leyendo un extracto real de un salón de estética:
> veintiséis meses, 1.840 apuntes, cadena de saldos cuadrando entera. **Ese
> extracto no está en el repositorio** —lleva nombres de clientas en los
> conceptos de los Bizum, el domicilio del local y el IBAN del titular—. Lo que
> sí está es `lib/oris/pruebas/pyme-sintetica.ts`: un generador determinista que
> reproduce su **forma**, no sus datos.

## Arranque del front

```bash
cd apps/web
npm install
npm run dev
```

Requiere Node.js 18.18 o superior. Abre `http://localhost:3000`.

Los puntos que hay que unir aparecen **numerados en verde sobre la
constelación**. La secuencia real está en `apps/web/lib/constellation/pisces.ts`
(`UNLOCK_SEQUENCE`); la guía lee ese array, así que cambiar el patrón cambia los
números solos.

**Tras 3 patrones fallidos aparece el teclado del PIN.** El PIN no está en el
código —quedaría en el historial de git para siempre— sino en `.env.local`:

```bash
echo 'NEXT_PUBLIC_UNLOCK_PIN=1692' > apps/web/.env.local
```

Sin esa variable no hay respaldo: al tercer intento se sigue con el patrón, y la
pantalla lo dice en vez de ofrecer un teclado que nunca abriría.

> ⚠️ El desbloqueo por constelación **no es seguridad** — el patrón acaba en el
> bundle de JavaScript. Es una cerradura de conveniencia. En cuanto ORis maneje
> extractos bancarios reales hará falta autenticación de servidor.

## Documentación

Punto de entrada: [`docs/ORis — Resumen del proyecto.md`](docs/).

Las decisiones de diseño viven en `docs/`, escritas como bóveda de Obsidian
(frontmatter YAML y enlaces `[[wiki]]`). Ver
[`docs/ORis — Cómo sincronizar con Obsidian en iPad.md`](docs/) para el montaje
con Working Copy.
