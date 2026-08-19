# Contratos compartidos

Los dos ficheros JSON de esta carpeta son la **única** definición de dos cosas
que Python y TypeScript necesitan por igual:

| Fichero | Qué define | Quién lo lee |
|---|---|---|
| `esquema-movimientos.json` | El JSON Schema estricto que el modelo debe cumplir al extraer un extracto | `oris_core.extractos` · `lib/oris/contratos.ts` |
| `reglas-base.json` | Las reglas deterministas de categorización | `oris_core.categorias` · `lib/oris/contratos.ts` |

## Por qué son datos y no código

El extractor está escrito en Python y la web en TypeScript. Si el esquema y las
reglas se declararan en los dos lenguajes, en unas semanas discreparían y nadie
sabría cuál manda. Una regla que existe en un sitio y no en el otro no falla:
simplemente clasifica distinto según por dónde entre el movimiento, que es la
clase de error que se descubre tarde y mal.

Como datos, sólo hay una versión. Los dos lenguajes la leen y ninguno la posee.

## Por qué viven dentro de `apps/web`

Vercel construye con `apps/web` como raíz, así que lo que quede fuera de esa
carpeta no llega al despliegue. Python sí puede subir por el árbol del
repositorio para leerlos, y lo hace. La alternativa —copiar los ficheros a los
dos sitios en un paso de build— reintroduce exactamente el problema que esta
carpeta existe para evitar.

Si algún día `apps/web` deja de ser la raíz del despliegue, esto se mueve a
`packages/contratos` sin tocar nada más que las dos rutas de carga.

## `esquema-movimientos.json`

JSON Schema estricto: `additionalProperties: false` en todos los objetos y
todos los campos en `required`. Un esquema laxo deja al modelo inventarse
claves, y una clave inventada en un extracto bancario es un importe que no
cuadra con nada.

Los importes son **cadenas** con punto decimal y dos decimales
(`^-?\d+\.\d{2}$`), nunca números. Un `number` en JSON es coma flotante, y
`0.1 + 0.2` no es `0.3`: el cuadre de saldos fallaría por céntimos que no
existen.

## `reglas-base.json`

Cada regla tiene:

- `categoria` — el nombre que se asigna.
- `patron` — expresión regular, en mayúsculas y sin acentos (el concepto se
  normaliza antes de comparar).
- `prioridad` — mayor gana. El orden importa: `Comisiones` (90) debe evaluarse
  antes que cualquier comercio, porque «PAYMONADE EXCHANGE RATE ECB RATE MARKUP»
  es la comisión de cambio de una compra, no otra compra.
- `signo` — `cargo`, `abono` o `cualquiera`. Evita que una devolución de un
  supermercado cuente como gasto en alimentación.
- `sobre` — `raiz` o `crudo`. **Este campo no es decorativo.** La normalización
  borra IBAN, ISIN y referencias por considerarlos ruido; una regla que necesite
  esos fragmentos debe declarar `crudo` o no encontrará nunca nada. Dos reglas
  nacieron muertas por este motivo antes de que el campo existiera.

La prioridad 100 (`Traspaso entre cuentas propias`) va primero a propósito: un
traspaso no es ni ingreso ni gasto, y contarlo como cualquiera de los dos
duplica el dinero en los totales del panel.

## Al cambiarlos

Los tests de `packages/core/tests/` se ejecutan contra estos ficheros. Si tocas
una regla y algún test cae, el test tiene razón hasta que se demuestre lo
contrario: las reglas se diseñaron leyendo movimientos reales.
