/**
 * Pruebas del detalle de los KPI.
 *
 *   npx tsx lib/oris/pruebas/detalle.test.ts
 *
 * Lo que se vigila aquí es sobre todo `raizConcepto`: es una heurística sobre
 * texto de banco, y una heurística sin pruebas se degrada en silencio — nadie
 * ve que dos grupos se han fundido en uno, sólo ve un total que ya no reconoce.
 */

import { CATEGORIA_TRASPASO, type MovimientoVista } from '../agregados';
import {
  cobertura,
  compararConAnterior,
  ingresosPorOrigen,
  mayores,
  medidaGastos,
  medidaIngresos,
  medidaNeto,
  mesAnterior,
  raizConcepto,
  tasaDeAhorro,
  traspasosDelMes,
} from '../detalle';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

let n = 0;
function mov(
  fecha: string,
  importe: string,
  concepto = 'x',
  categoria: string | null = null,
): MovimientoVista {
  n += 1;
  return { id: `m${n}`, fecha, concepto, importe, categoria, origen: null };
}

// --- la raíz del concepto --------------------------------------------------

comprobar(raizConcepto('TRANSFERENCIA DE JUAN PEREZ GOMEZ') === 'Juan Perez Gomez',
  'quita el prefijo y deja el nombre', raizConcepto('TRANSFERENCIA DE JUAN PEREZ GOMEZ'));
comprobar(raizConcepto('BIZUM DE Marta') === 'Marta', 'bizum es ruido, el nombre no');
comprobar(raizConcepto('NOMINA MAYO') === 'Nomina Mayo',
  'NOMINA no se quita: sin ella una nómina sin empresa se queda sin raíz');
comprobar(raizConcepto('Transferencia recibida de Acme S.L. ref 0012938471')
  === 'Acme', 'en «ref» se corta: detrás no hay nombre',
  raizConcepto('Transferencia recibida de Acme S.L. ref 0012938471'));
comprobar(raizConcepto('TRANSFERENCIA DE 0012938471') === '',
  'si sólo queda una referencia, no hay raíz');
comprobar(raizConcepto('') === '', 'concepto vacío no revienta');
comprobar(raizConcepto('Devolución recibo eléctrico') === 'Devolucion Recibo Electrico',
  'las tildes no separan grupos', raizConcepto('Devolución recibo eléctrico'));
comprobar(raizConcepto('nomina abril') === raizConcepto('NÓMINA ABRIL'),
  'mayúsculas y tildes dan la misma raíz');
comprobar(
  raizConcepto('TRANSFERENCIA DE PEDRO DE LA FUENTE') !== raizConcepto('TRANSFERENCIA DE PEDRO FUENTES'),
  'el ruido sólo se quita por delante: dos personas distintas siguen siéndolo',
);

// --- ingresos por origen ---------------------------------------------------

{
  const lineas = ingresosPorOrigen([
    mov('2026-05-01', '1500.00', 'NOMINA ACME'),
    mov('2026-05-31', '1500.00', 'Nómina Acme'),
    mov('2026-05-10', '300.00', 'BIZUM DE Marta'),
    mov('2026-05-11', '-50.00', 'COMPRA SUPER'),
    mov('2026-05-12', '900.00', 'TRASPASO', CATEGORIA_TRASPASO),
    mov('2026-04-01', '1500.00', 'NOMINA ACME'),
  ], '2026-05');

  comprobar(lineas.length === 2, 'dos orígenes en mayo', lineas.map((l) => l.clave));
  comprobar(lineas[0].clave === 'Nomina Acme' && lineas[0].total === 300000,
    'las dos nóminas se agrupan', lineas[0]);
  comprobar(lineas[0].movimientos === 2, 'y cuentan como dos movimientos');
  comprobar(lineas[1].total === 30000, 'el bizum va aparte');
  comprobar(Math.round(lineas[1].proporcion * 100) === 9, 'la proporción es sobre el total del bloque',
    lineas[1].proporcion);
  comprobar(!lineas.some((l) => l.total === 90000), 'el traspaso no entra como ingreso');
}

{
  const lineas = ingresosPorOrigen([mov('2026-05-01', '100.00', '0012938471')], '2026-05');
  comprobar(lineas[0].clave === 'Otros', 'sin raíz legible, el grupo es «Otros»', lineas[0]?.clave);
}

// --- los mayores -----------------------------------------------------------

{
  const movs = [
    mov('2026-05-01', '-1200.00', 'ALQUILER'),
    mov('2026-05-02', '-30.00', 'CAFE'),
    mov('2026-05-03', '-400.00', 'SEGURO'),
    mov('2026-05-04', '2000.00', 'NOMINA'),
    mov('2026-05-05', '-5000.00', 'TRASPASO', CATEGORIA_TRASPASO),
    mov('2026-04-01', '-9000.00', 'MES ANTERIOR'),
  ];
  const g = mayores(movs, '2026-05', 'gasto', 2);
  comprobar(g.length === 2 && g[0].concepto === 'ALQUILER' && g[1].concepto === 'SEGURO',
    'los dos mayores gastos, de mayor a menor', g.map((m) => m.concepto));
  comprobar(!g.some((m) => m.concepto === 'TRASPASO'), 'un traspaso grande no es el mayor gasto');
  const i = mayores(movs, '2026-05', 'ingreso');
  comprobar(i.length === 1 && i[0].concepto === 'NOMINA', 'y del otro signo, los ingresos');
}

// --- traspasos -------------------------------------------------------------

{
  const t = traspasosDelMes([
    mov('2026-05-01', '-500.00', 'A MI AHORRO', CATEGORIA_TRASPASO),
    mov('2026-05-02', '500.00', 'DESDE AHORRO', CATEGORIA_TRASPASO),
    mov('2026-05-03', '-100.00', 'GASTO NORMAL'),
  ], '2026-05');
  comprobar(t.salidas === 50000 && t.entradas === 50000, 'entradas y salidas por separado', t);
  comprobar(t.lista.length === 2, 'sólo los traspasos entran en la lista');
  comprobar(t.lista[0].fecha === '2026-05-02', 'la lista va del más reciente al más antiguo');
}

// --- comparación con el mes anterior ---------------------------------------

comprobar(mesAnterior('2026-01') === '2025-12', 'de enero se retrocede a diciembre del año pasado');
comprobar(mesAnterior('2026-05') === '2026-04', 'y dentro del año, al mes de antes');

{
  const movs = [
    mov('2026-04-01', '1000.00', 'NOMINA'),
    mov('2026-04-02', '-400.00', 'GASTOS'),
    mov('2026-05-01', '1500.00', 'NOMINA'),
    mov('2026-05-02', '-600.00', 'GASTOS'),
  ];
  const v = compararConAnterior(movs, '2026-05', medidaIngresos);
  comprobar(v?.anterior === 100000 && v?.actual === 150000, 'compara los dos meses', v);
  comprobar(v?.diferencia === 50000, 'la diferencia es actual − anterior');
  comprobar(v?.relativa === 0.5, 'y en relativo, sobre el anterior', v?.relativa);
  comprobar(compararConAnterior(movs, '2026-04', medidaIngresos) === null,
    'sin mes anterior cargado no se compara: un hueco no es una caída');
}

{
  // Un mes anterior con cero en esa medida sí existe: se compara en absoluto,
  // pero el porcentaje no se inventa.
  const movs = [mov('2026-04-01', '-50.00', 'SOLO GASTO'), mov('2026-05-01', '900.00', 'NOMINA')];
  const v = compararConAnterior(movs, '2026-05', medidaIngresos);
  comprobar(v !== null && v.anterior === 0, 'el mes existía aunque no hubiera ingresos');
  comprobar(v?.relativa === null, 'y no se da un porcentaje sobre cero', v?.relativa);
}

// --- las medidas -----------------------------------------------------------

{
  const movs = [
    mov('2026-05-01', '1000.00'),
    mov('2026-05-02', '-250.00'),
    mov('2026-05-03', '-800.00', 'TRASPASO', CATEGORIA_TRASPASO),
  ];
  comprobar(medidaIngresos(movs) === 100000, 'ingresos sin traspasos');
  comprobar(medidaGastos(movs) === 25000, 'gastos en positivo y sin traspasos');
  comprobar(medidaNeto(movs) === 75000, 'neto = ingresos − gastos');
}

// --- cobertura -------------------------------------------------------------

{
  const c = cobertura([
    mov('2026-05-04', '-10.00'),
    mov('2026-05-27', '-10.00'),
    mov('2026-05-11', '-10.00'),
    mov('2026-06-01', '-10.00'),
  ], '2026-05');
  comprobar(c?.desde === 4 && c?.hasta === 27, 'del primer al último día con movimiento', c);
  comprobar(c?.dias === 24, 'los días se cuentan con los extremos incluidos', c?.dias);
}

comprobar(cobertura([mov('2026-05-09', '-10.00')], '2026-05')?.dias === 1,
  'un solo movimiento cubre un día, no cero');
comprobar(cobertura([], '2026-05') === null, 'sin movimientos no hay tramo cubierto');

comprobar(tasaDeAhorro(100000, 25000) === 0.25, 'la tasa de ahorro es neto sobre ingresos');
comprobar(tasaDeAhorro(0, -5000) === null, 'sin ingresos no hay tasa que dar');

console.log(fallos === 0 ? '\n✅ detalle: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
