/**
 * Paleta del panel. Punto único de verdad del color de los gráficos.
 *
 * Separada de `lib/ires/theme.ts` a propósito, y conviene saber por qué: el
 * tema de IRES **no vale para gráficos**. Sus colores señalan la emoción de la
 * constelación —una cada vez— y al validarlo como paleta categórica falla:
 *
 *     processing #7C78F5 ↔ empathy #8B5CF6   ΔE 6,3 (visión normal)
 *                                             ΔE 3,5 (deuteranopía)
 *
 * Dos barras contiguas con esos colores son el mismo color para cualquiera. No
 * es un defecto de IRES: esas emociones nunca coinciden en pantalla. Es que
 * señalar un estado y comparar categorías son trabajos distintos.
 *
 * De ahí la decisión de fondo: **el desglose usa un solo tono**. Las barras
 * comparan magnitudes de una misma medida —euros gastados— y la identidad la
 * lleva la etiqueta al lado, no el color. Una paleta categórica aquí
 * codificaría con color algo que el texto ya dice, y a cambio traería el
 * problema de daltonismo.
 *
 * Los dos colores que quedan están verificados con el validador:
 *
 *     banda de luminosidad   PASS   ambos dentro de L 0,48–0,67
 *     suelo de croma         PASS
 *     separación CVD         PASS   ΔE 27,0 protan · 23,4 tritan
 *     visión normal          PASS   ΔE 28,8
 *     contraste sobre fondo  PASS   ambos ≥ 3:1
 */

/**
 * Tono único de las barras del desglose. Azul analítico, familia de IRES.
 *
 * Es una variable CSS y no un hexadecimal porque **el tema claro necesita otro
 * azul**: el de arriba (#2D96F0) se queda en 2,96:1 sobre fondo claro, por
 * debajo del mínimo de 3:1, y una barra que no se distingue del papel no es una
 * barra. Los dos tonos viven en `globals.css` y los dos pasan el validador
 * contra su propio fondo.
 */
export const BARRA = 'var(--serie)';

/**
 * Ámbar de aviso para «Sin categorizar».
 *
 * No es una categoría más: es un estado —«esto todavía no lo sabe nadie»—, y
 * por eso lleva color propio. Nunca va solo: siempre acompañado de su etiqueta,
 * porque el color por sí mismo no debe ser el único portador del significado.
 */
export const PENDIENTE = 'var(--pendiente)';

/** Superficie del panel. */
export const SUPERFICIE = 'var(--superficie)';

/** Separación entre barras contiguas, en píxeles. Deja ver el fondo entre marcas. */
export const HUECO_BARRAS = 2;

/**
 * Los dos escalones con que se parte el gasto: estructura y variable.
 *
 * Aquí no se rompe la regla del tono único — se aplica. Estructura y variable
 * **no son dos categorías**: son dos trozos de una misma magnitud, el gasto del
 * mes, y lo que hay que poder leer es cuánto pesa cada uno dentro del total.
 * Eso es una escala secuencial, no una paleta categórica, y una escala
 * secuencial es un tono a dos claridades.
 *
 * Se consiguen con opacidad sobre `--serie` y no con dos hexadecimales porque
 * el fondo cambia con el tema: dos tonos fijos que funcionan sobre el cielo
 * nocturno se lavan sobre papel, y al revés. Con opacidad, el escalón se
 * mantiene contra el fondo que haya.
 *
 * La opacidad no lleva sola el significado: los dos trozos van separados por
 * `HUECO_BARRAS`, con leyenda y con su cifra al lado. Quien no distinga los dos
 * azules sigue leyendo el gráfico por la etiqueta y por el hueco.
 */
export const ESTRUCTURA_OPACIDAD = 1;
export const VARIABLE_OPACIDAD = 0.45;

/**
 * La banda de escenarios de la previsión.
 *
 * Ámbar, el mismo tono que la proyección de `LineaTiempo`, y por el mismo
 * motivo: **lo que no ha pasado no se pinta con el color de lo que sí**. Muy
 * translúcida porque es una región, no una marca — a la opacidad de una línea
 * competiría con el saldo real que la atraviesa.
 */
export const BANDA_OPACIDAD = 0.14;
