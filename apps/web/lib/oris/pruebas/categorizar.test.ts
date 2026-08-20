/**
 * El categorizador de TypeScript contra el de Python.
 *
 *   npx tsx lib/oris/pruebas/categorizar.test.ts
 *
 * Éste no comprueba que las categorías sean «buenas» —eso lo decide el diseño
 * de las reglas, y se prueba en `packages/core/tests/test_categorias.py`—, sino
 * que **los dos motores dicen lo mismo**.
 *
 * Hace falta porque son dos implementaciones del mismo algoritmo en dos
 * lenguajes. Las reglas se comparten como datos, pero normalizar «Transacción
 * con tarjeta AHORRAMAS S.L. 4521» hasta «AHORRAMAS» es código, y las
 * expresiones regulares de Python y de JavaScript no se comportan igual en
 * todo. Una discrepancia aquí significa que el mismo movimiento acaba en
 * categorías distintas según por dónde entre — el error más difícil de ver,
 * porque las dos respuestas parecen razonables.
 *
 * `esperado.json` lo genera Python:
 *
 *   cd packages/core && .venv/bin/python generar_esperado.py
 */

import casos from './conceptos.json';
import esperado from './esperado.json';
import { categorizar, normalizarConcepto } from '../categorizar';
import type { MovimientoExtraido } from '../validacion';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

const movimientos: MovimientoExtraido[] = casos.map((c) => ({
  fecha: '2026-05-10',
  fecha_valor: null,
  concepto: c.concepto,
  importe: c.importe,
  saldo: null,
}));

const resultado = categorizar(movimientos);

comprobar(
  resultado.categorias.length === esperado.length,
  `${esperado.length} casos, uno por movimiento`,
  resultado.categorias.length,
);

// --- la normalización ------------------------------------------------------

let raicesIguales = 0;
for (const [i, e] of esperado.entries()) {
  const raiz = normalizarConcepto(e.concepto);
  if (raiz === e.raiz) raicesIguales++;
  else comprobar(false, `raíz distinta en el caso ${i + 1}`, `js «${raiz}» ≠ py «${e.raiz}»`);
}
comprobar(raicesIguales === esperado.length, `las ${esperado.length} raíces coinciden con Python`);

// --- el veredicto ----------------------------------------------------------

let categoriasIguales = 0;
for (const [i, e] of esperado.entries()) {
  const mia = resultado.categorias[i]?.categoria ?? null;
  if (mia === e.categoria) categoriasIguales++;
  else
    comprobar(
      false,
      `categoría distinta en «${e.concepto}»`,
      `js «${mia}» ≠ py «${e.categoria}»`,
    );
}
comprobar(
  categoriasIguales === esperado.length,
  `las ${esperado.length} categorías coinciden con Python`,
);

// --- los casos que costaron sangre en su día -------------------------------

{
  // La normalización borra el ruido del banco, pero MARKUP no es ruido: es lo
  // único que distingue la comisión de cambio de la compra que la originó.
  const i = casos.findIndex((c) => c.concepto.includes('MARKUP'));
  comprobar(
    resultado.categorias[i]?.categoria === 'Comisiones',
    'la comisión de cambio no se confunde con una compra',
    resultado.categorias[i],
  );
}

{
  // «S.L.» sobrevive como «S L» al quitar la puntuación, y un \b(SL)\b no casa.
  comprobar(
    normalizarConcepto('Transacción con tarjeta AHORRAMAS S.L. 4521') === 'AHORRAMAS',
    'la forma jurídica desaparece aunque venga con puntos',
    normalizarConcepto('Transacción con tarjeta AHORRAMAS S.L. 4521'),
  );
}

{
  // INTERÉS estuvo en la lista de prefijos de tipo de operación y se normalizaba
  // a cadena vacía, dejando la regla de Rendimientos sin nada que casar.
  const i = casos.findIndex((c) => c.concepto.includes('INTERES CUENTA'));
  comprobar(
    resultado.categorias[i]?.categoria === 'Rendimientos',
    'el interés de la cuenta se reconoce como rendimiento',
    resultado.categorias[i],
  );
}

{
  // Un traspaso propio no es ni ingreso ni gasto, y tiene que ganar a todo.
  const entrante = casos.findIndex((c) => c.concepto.startsWith('TRASPASO DESDE'));
  comprobar(
    resultado.categorias[entrante]?.categoria === 'Traspaso entre cuentas propias',
    'un traspaso entrante no se cuenta como ingreso',
    resultado.categorias[entrante],
  );
}

{
  // Lo que ninguna regla cubre se queda en null y se declara. Inventarle una
  // categoría convertiría el desglose en una opinión disfrazada de dato.
  const i = casos.findIndex((c) => c.concepto.includes('ALGO QUE NADIE CONOCE'));
  comprobar(
    resultado.categorias[i]?.categoria === null,
    'lo desconocido se queda sin categorizar, no se adivina',
    resultado.categorias[i],
  );
  comprobar(resultado.sinCategorizar > 0, 'y se cuenta como pendiente');
}

console.log(
  fallos === 0
    ? `\n✅ categorización: idéntica a Python en los ${esperado.length} casos`
    : `\n❌ ${fallos} fallo(s)`,
);
process.exit(fallos === 0 ? 0 : 1);
