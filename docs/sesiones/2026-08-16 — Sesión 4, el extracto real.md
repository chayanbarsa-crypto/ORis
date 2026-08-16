---
proyecto: ORis
tipo: sesión
fecha: 2026-08-16
tags: [oris, sesion, bitacora, extraccion, fixtures, privacidad]
---

# 2026-08-16 · Sesión 4 — el extracto real

## Qué llegó

Un extracto real de **Trade Republic**, 7 páginas, periodo 01-may a 13-ago 2026,
92 movimientos. Es exactamente lo que le faltaba a la fase 3: hasta ahora el
único fixture era sintético, y un fixture sintético lo escribe quien escribe el
extractor — con la forma que el extractor ya espera.

## El extracto cuadra consigo mismo

Reconstruido de forma **determinista, sin llamar al modelo**, a partir de la capa
de texto del PDF:

```
92 movimientos
4,02 + 7,87 = 11,89          coincide con el balance final declarado
entradas 2.326,96            coincide exacto con el resumen del banco
salidas  2.319,09            coincide exacto con el resumen del banco
0 filas donde la columna y el saldo corrido se contradigan
```

Que el documento cuadre apunte a apunte es lo que lo hace útil como caso de
prueba: cualquier fallo de extracción se detecta contra su propia aritmética.

## Lo que destapó — y que el fixture sintético no podía destapar

**Trade Republic no usa una columna de importe con signo. Usa dos: «ENTRADA DE
DINERO» y «SALIDA DE DINERO», con todas las cifras impresas en positivo.**

El signo lo determina *la columna en la que está la cifra*, no el número. Mi
esquema asumía un único importe con signo, que es como lo había maquetado yo en
el fixture inventado. Un modelo que se fije en el número y no en la columna
transcribe todos los cargos como abonos.

Tres detalles más de la maquetación real:

- Las fechas van en español abreviado y **partidas en dos líneas**: `01 may` /
  `2026`.
- En el texto plano, dos columnas se funden en una sola línea:
  `CASQUERIA 148,60 € 121,66 €` — importe y saldo pegados, indistinguibles sin
  la maquetación. Es la razón por la que adjuntar el **PDF nativo** no es un
  lujo: sobre texto plano ese apunte es ambiguo.
- Hay columna de **saldo corrido**, que permite localizar el fallo, no sólo
  detectarlo.

## Qué se arregló

- **Prompt**: instrucción explícita sobre maquetaciones de dos columnas
  («entrada»/«salida», «haber»/«debe», «ingresos»/«pagos»), sobre usar el saldo
  corrido para autocomprobarse, y sobre traducir el formato de fecha del banco.
- **Esquema**: la descripción del importe avisa de que en dos columnas el signo
  lo pone la columna.
- **Segundo fixture**: `extracto_dos_columnas.pdf`, con la maquetación real
  —dos columnas sin signo, fechas partidas, saldo corrido— y datos inventados.

## Verificado

24 tests. Los cinco nuevos cubren el fallo específico de las dos columnas:

```
✅ transcrito bien, cuadra
✅ una salida leída como entrada rompe el cuadre — y el desvío es el DOBLE del
   importe (800,00 € para un cargo de 400,00 €), porque no falta: está invertido
✅ el saldo corrido delata el signo cambiado y señala la fila exacta (FARMACIA)
✅ el prompt explica las dos columnas
✅ el esquema avisa del signo por columna
```

Ese doble merece atención: si el desvío del cuadre es exactamente el doble de un
importe del extracto, no falta un apunte — hay uno con el signo cambiado.

## El PDF real NO está en el repositorio

Y es deliberado. Contiene nombre completo, domicilio, dos IBAN y 92 movimientos
reales. Aunque `ORis-` sea privado, **el historial de git es permanente**: una
vez dentro, sacarlo exige reescribir el historial, y basta un cambio de
visibilidad para exponerlo.

Lo que sí está es el fixture de dos columnas con la misma maquetación y datos
inventados — que es de donde viene el valor de prueba. La maquetación es lo que
había que capturar; los movimientos concretos no aportan nada al test.

El original se ha quedado en el espacio temporal de la sesión, que se destruye
con el contenedor.

## Lo que sigue sin estar verificado

Sigue sin ejecutarse una extracción real: no hay `ANTHROPIC_API_KEY` en esta
sesión. Todo lo anterior es análisis determinista del PDF y validación del
transcriptor — sé que **el validador caza el error de columnas**, no sé todavía
si **el modelo lo comete**.

Para cerrarlo, en tu máquina:

```bash
cd packages/core
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/python extraer.py ~/Extracto_de_cuenta.pdf
```

Debe dar 92 movimientos y cuadrar 4,02 → 11,89. Si sale código 1, el informe
dice exactamente qué apunte falla.

## Siguiente
1. Esa pasada con la clave, sobre el extracto real. Es la única prueba pendiente.
2. La ingesta a Postgres: de `extraer.py --json` a las tablas de la fase 2. Lo
   delicado es la transacción — o entra el extracto entero con sus movimientos,
   o no entra nada.
3. Categorización: primero `reglas_categorizacion`, y sólo lo que no case va al
   modelo. Con 67 «Transacción con tarjeta» de comercios repetidos
   (SUPERMERCADO ×2, COMERCIO ×2…), las reglas van a cubrir la mayoría.
