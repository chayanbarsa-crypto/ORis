---
proyecto: ORis
tipo: sesión
fase: 3-4
fecha: 2026-08-16
tags: [oris, sesion, bitacora, pdf, ingesta, postgres, drizzle]
---

# 2026-08-16 · Sesión 5 — análisis estático del PDF e ingesta

Ejecución del checklist de análisis estático sobre el extracto real, ante la
ausencia de `ANTHROPIC_API_KEY`. Los cuatro puntos, más una corrección de
contrato.

## Corrección: `ESQUEMA_SALIDA` no es el contrato de los extractos

El checklist pedía construir el mock «bajo el contrato `ESQUEMA_SALIDA`». Ese es
el esquema del **auditor de facturas** (`oris_core/ia.py`): devuelve *hallazgos
de auditoría*. El de extractos es **`ESQUEMA_MOVIMIENTOS`**
(`oris_core/extractos.py`), que devuelve *movimientos*. Un mock construido bajo
el primero no encajaría en la ingesta — son dos contratos distintos que conviven
en el mismo paquete porque ORis fusiona dos proyectos.

## 1 · Cabeceras, IBAN y metadatos

```
PDF 2.0 · «Estado de cuenta» · Flying Saucer 10.0.6 con OpenPDF 3.0.0
7 páginas, paginación «Página N de 7» presente
periodo 01 may 2026 → 13 ago 2026
BIC TRBKESM2XXX
9 cabeceras de tabla: FECHA · TIPO · DESCRIPCIÓN · ENTRADA DE · SALIDA DE ·
                      BALANCE · RESUMEN DE ESTADO DE CUENTA ·
                      TRANSACCIONES DE CUENTA · PRODUCTO
```

**Tres IBAN, no uno.** El de la cuenta y dos más que aparecen como ordenantes de
transferencias. Los tres pasan mod-97. Implicación de diseño: extraer «el IBAN»
con una expresión regular sobre todo el documento devuelve el que salga primero,
que no tiene por qué ser el de la cuenta. El esquema pide el de la cuenta y el
prompt lo sitúa por su cabecera, no por su forma.

**La cabecera del banco se repite entera en las 7 páginas** —dirección, NIF,
consejo de administración, fecha de creación— antes de continuar la tabla. Un
troceado que busque «TRANSACCIONES DE CUENTA» sólo encuentra la página 1 y
pierde 81 de los 92 movimientos. Me pasó al primer intento.

## 2 · Patrón de importes

```
formato del banco:   1.234,56 €   punto = miles, coma = decimal
formato del esquema: 1234.56      punto = decimal, sin miles

189 importes en el documento
189/189 convertidos sin pérdida    0 fallos de ida y vuelta
  2 llevan separador de miles
```

Esos dos son los peligrosos. `float("2.326,96")` revienta; y el atajo habitual
—cambiar la coma por punto— da `"2.326.96"`, que también revienta. Hay que
**quitar primero el separador de miles**. Tras normalizar, `Decimal("2326.96")`
es exacto y entra en `numeric(14,2)` sin tocar nada.

## 3 · Mock bajo `ESQUEMA_MOVIMIENTOS`

Reconstruido **de forma determinista desde la capa de texto**, sin modelo. El
truco: en dos columnas el texto plano no dice cuál es entrada y cuál salida,
pero la **diferencia entre saldos consecutivos sí da el signo**. En las 92 filas,
la columna y el delta coinciden siempre — cero discrepancias.

```
92 movimientos
4,02 + 7,87 = 11,89        coincide con el balance final declarado
entradas 2.326,96          coincide exacto con el resumen del banco
salidas  2.319,09          coincide exacto con el resumen del banco
conforma ESQUEMA_MOVIMIENTOS: 0 errores (validado con jsonschema)
pasa el validador de ORis: cuadra
```

Este mock es el **patrón oro** contra el que comparar la primera extracción real
del modelo: si difiere, la diferencia está en el modelo, no en el documento.

⚠️ Contiene datos reales, así que **no está en el repositorio** — se entrega
aparte.

## 4 · Ingesta en Postgres

`apps/web/lib/db/ingesta.ts`. Tres invariantes:

1. **O entra todo, o no entra nada.** Extracto y movimientos en una sola
   transacción. Un extracto a medias es peor que ninguno: la cuenta parece estar
   y los cuadres posteriores fallan sin decir por qué.
2. **Lo que no cuadra no se guarda.** Se comprueba antes de deduplicar siquiera.
3. **Un PDF, una vez.** Deduplicación por SHA-256 del fichero.

Y una comprobación que cierra el círculo: tras insertar, **se relee lo escrito y
se recalcula el cuadre en Postgres, con `numeric`**. El extractor dijo que
cuadraba; esto verifica que lo *guardado* también. Si la conversión de texto a
`numeric(14,2)` perdiera un céntimo, salta dentro de la transacción y no queda
rastro.

### Verificado contra Postgres 16 real

15 comprobaciones en verde (`drizzle/pruebas/ingesta.test.ts`), incluidas las
tres que valen por sí solas:

```
OK  el cuadre se recalcula en Postgres y da
OK  0,10 + 0,20 sigue siendo 0,30 exacto tras el viaje a numeric
OK  un cuadre falso lanza en vez de guardarse
OK  la transacción se deshizo: no quedó extracto huérfano
```

### Y con los 92 movimientos reales

```
ingesta: guardado 92 (32 ms)
4.02 + 7.87 = 11.89                    cuadra: true
entradas 2326.96  = resumen del banco  true
salidas  2319.09  = resumen del banco  true
rupturas de la cadena de saldo: 0
```

La tubería entera —PDF → extracción → contrato → validación → Postgres →
recálculo en SQL— sobre un extracto real de 7 páginas.

## Un fallo silencioso que conviene recordar

La primera versión del test usaba una subconsulta correlacionada dentro de un
`sql` anidado en el `SELECT` de Drizzle. **Drizzle no la correlaciona con la
tabla del `FROM` exterior: la suma sale `0` y no da ningún error.** El test
marcaba fallo mientras los datos en la base eran correctos.

Se ve sólo comparando contra la consulta escrita a mano. En Drizzle, para
agregar sobre una tabla relacionada, `join` + `group by` — no subconsulta en el
`SELECT`.

## Lo que sigue pendiente

Sigue sin ejecutarse **la llamada real al modelo**. Todo lo anterior es análisis
determinista y verificación de la tubería. Sé que el validador caza los errores
y que la ingesta guarda bien 92 movimientos; no sé todavía **qué transcribe
Opus-5 de este PDF**.

El patrón oro está listo para esa comparación.

## Siguiente
1. `extraer.py` con la clave sobre el extracto real, y diff contra el patrón oro.
2. Categorización. Con 67 «Transacción con tarjeta» de comercios que se repiten,
   `reglas_categorizacion` debería cubrir la mayoría antes de tocar el modelo.
