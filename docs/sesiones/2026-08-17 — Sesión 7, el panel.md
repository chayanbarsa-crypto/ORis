---
proyecto: ORis
tipo: sesión
fase: 6
fecha: 2026-08-17
tags: [oris, sesion, bitacora, panel, dataviz, accesibilidad]
---

# 2026-08-17 · Sesión 7 — el panel

Hasta ahora `FinanceSidebar` y `ChatPanel` eran los huecos vacíos que dejó la
Fase 1 de IRES. Esta sesión llena el primero.

## La decisión de color, y por qué la paleta de IRES no servía

El desglose por categoría es un gráfico, así que toca elegir colores. Lo primero
fue validar la paleta de emociones de IRES como paleta categórica. **Falla:**

```
processing #7C78F5 ↔ empathy #8B5CF6    ΔE 6,3 (visión normal)
                                         ΔE 3,5 (deuteranopía)
```

Dos barras contiguas con esos colores son el mismo color para cualquiera, no
sólo para quien tenga daltonismo.

**No es un defecto de IRES.** Esas emociones nunca coinciden en pantalla: la
constelación muestra una cada vez. Señalar un estado y comparar categorías lado
a lado son trabajos distintos, y una paleta buena para lo primero puede ser
inservible para lo segundo.

De ahí la decisión: **el desglose usa un solo tono**. Las barras comparan
magnitudes de una misma medida —euros— y la identidad la lleva la etiqueta al
lado. Una paleta categórica aquí codificaría con color algo que el texto ya
dice, y traería el problema de daltonismo a cambio de nada.

Los dos colores que quedan están verificados con el validador:

```
#2D96F0 barras · #BF8228 «sin categorizar»

banda de luminosidad   PASS   ambos dentro de L 0,48–0,67
suelo de croma         PASS
separación CVD         PASS   ΔE 27,0 protan · 23,4 tritan
visión normal          PASS   ΔE 28,8
contraste sobre fondo  PASS   ambos ≥ 3:1
```

«Sin categorizar» no es una categoría sino un estado, y por eso lleva color
propio — pero **nunca va solo**: siempre acompañado de su etiqueta «· pendiente».
El color no debe ser jamás el único portador del significado.

## La aritmética, otra vez en enteros

`lib/oris/dinero.ts` trabaja en **céntimos enteros**, igual que la base de datos
y el extractor. El panel suma decenas de movimientos por categoría; con `number`
en euros, `0.1 + 0.2` da `0.30000000000000004` y noventa sumas así producen un
total que no coincide con el del extracto. El usuario vería un descuadre que no
existe.

Postgres devuelve `numeric(14,2)` como cadena precisamente para no perderlo por
el camino.

## La invariante que gobierna las cifras

**Los traspasos entre cuentas propias no son ingreso ni gasto.** Se informan
aparte, en su propia tarjeta, con el pie «ni ingreso ni gasto».

En el extracto real, 8 de los 15 ingresos eran transferencias del titular a sí
mismo. Sumarlos infla el mes en cientos de euros y convierte el panel en un
generador de cifras bonitas y falsas.

## Lo que el panel confiesa

Dos cosas que un panel más limpio escondería:

- **Cuántos movimientos hay sin revisar**: «3 de 11 están sin categorizar o los
  categorizó el modelo. Las cifras de arriba son correctas de todos modos — el
  reparto por categoría es lo que puede moverse.»
- **De dónde sale cada categoría**: cada fila lleva `regla`, `IA` o `tuyo`. Una
  categoría del modelo y una de una regla no valen igual, y esconder la
  diferencia haría el panel más bonito y menos fiable.

Y sin datos no hay gráficos de relleno: hay un estado vacío que dice qué falta.
Un panel con cifras de ejemplo cuando no hay conexión es peor que uno vacío,
porque parece que funciona.

## Verificado

**30 comprobaciones** sobre los agregados (`lib/oris/pruebas/agregados.test.ts`):

```
✅ 0,10 + 0,20 = 0,30 exacto en céntimos
✅ el traspaso entrante NO cuenta como ingreso
✅ el traspaso saliente NO cuenta como gasto
✅ la proporción se calcula sobre el gasto, no sobre todo
✅ lo no categorizado se declara, no se esconde
✅ un mes vacío da ceros, no NaN
```

Una de esas comprobaciones falló al principio **y el código tenía razón**: yo
había calculado 80/100 olvidando el gasto sin categorizar en el denominador. Era
80/110.

## Y se miró, no sólo se compiló

Construido y abierto en un navegador real, a 1440×900 y a 390×844.

Ahí apareció un defecto que ni el typecheck ni los tests podían ver: **en móvil,
«+1.413,70 €» partía en dos líneas** y el símbolo de euro quedaba solo debajo de
la cifra. Arreglado escalando el tamaño en pantallas pequeñas. Comprobado
midiendo la altura de las cuatro cifras: una línea cada una.

Cero desbordamiento horizontal en ambos tamaños.

## Lo que sigue siendo un hueco

`ChatPanel` no se ha tocado. No hay backend de IA, y fingir uno haría imposible
distinguir después lo conectado de lo inventado — la regla que trae IRES desde
la Fase 1. En la navegación aparece como «Copiloto», deshabilitado y diciendo
por qué.

Las categorías del panel llegan por `categoria_id`, que es una referencia. Hasta
que exista el editor de categorías, el panel muestra `null` antes que enseñar un
UUID haciéndose pasar por el nombre de una categoría.

## Siguiente
1. El join que resuelve el nombre de la categoría, y el editor para crearlas.
2. El categorizador por IA para los 42 movimientos que las reglas no cubren.
3. La pasada real con `ANTHROPIC_API_KEY`, que sigue pendiente.
