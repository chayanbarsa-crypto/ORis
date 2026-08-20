/**
 * Pruebas del lector de extractos en tabla (CSV / Excel).
 *
 *   npx tsx lib/oris/pruebas/tabular.test.ts
 *
 * El grueso está en los importes. En el extracto real de Jordy hay 189 cifras y
 * sólo dos llevan separador de miles — y son justo las que rompen cualquier
 * conversión ingenua: `Number("2.326,96")` da NaN, y cambiar la coma por punto
 * da «2.326.96», que también. Un céntimo mal leído descuadra el extracto entero.
 */

import {
  ErrorTabular,
  fechaCanonica,
  filasAMovimientos,
  importeCanonico,
  leerCSV,
  mapearColumnas,
  type Fila,
} from '../tabular';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

// --- importes --------------------------------------------------------------

const importes: Array<[unknown, string | null]> = [
  ['1.234,56', '1234.56'],
  ['2.326,96', '2326.96'],
  ['-2.319,09', '-2319.09'],
  ['1,234.56', '1234.56'],
  ['1234.56', '1234.56'],
  ['12,50', '12.50'],
  ['12.50', '12.50'],
  ['-42,10', '-42.10'],
  ['42,10-', '-42.10'],
  ['(1.234,56)', '-1234.56'],
  ['1.234,56 €', '1234.56'],
  ['0,00', '0.00'],
  ['-0,00', '0.00'],
  ['4,02', '4.02'],
  [1234.56, '1234.56'],
  [-42.1, '-42.10'],
  ['', null],
  ['pendiente', null],
  ['1.234', '1234.00'],
];

for (const [entrada, esperado] of importes) {
  const salida = importeCanonico(entrada as never);
  comprobar(salida === esperado, `importe ${JSON.stringify(entrada)} → ${esperado}`, salida);
}

// --- fechas ----------------------------------------------------------------

comprobar(fechaCanonica('03/04/2026') === '2026-04-03', 'dd/mm/aaaa se lee como día primero');
comprobar(fechaCanonica('3-4-26') === '2026-04-03', 'con año de dos cifras y guiones');
comprobar(fechaCanonica('2026-04-03') === '2026-04-03', 'ISO se respeta');
comprobar(fechaCanonica('') === null, 'vacío no es fecha');
comprobar(fechaCanonica('mayo') === null, 'texto no es fecha');

// --- cabeceras -------------------------------------------------------------

{
  // Los extractos en Excel traen basura antes de la tabla.
  const filas: Fila[] = [
    ['BANCO DE PRUEBA, S.A.'],
    ['Titular: JORDY'],
    [],
    ['Fecha', 'Fecha valor', 'Concepto', 'Importe', 'Saldo'],
    ['01/05/2026', '01/05/2026', 'NOMINA', '1.850,00', '1.854,02'],
  ];
  const mapa = mapearColumnas(filas);
  comprobar(mapa.filaCabecera === 3, 'encuentra la cabecera aunque no sea la primera fila');
  comprobar(mapa.importe === 3 && mapa.saldo === 4, 'sitúa importe y saldo');
}

{
  const filas: Fila[] = [['Fecha', 'Descripción', 'Debe', 'Haber', 'Saldo']];
  const mapa = mapearColumnas(filas);
  comprobar(mapa.debe === 2 && mapa.haber === 3, 'reconoce el formato de dos columnas');
  comprobar(mapa.importe === -1, 'y no inventa una columna de importe');
}

{
  let saltó = false;
  try {
    mapearColumnas([['Nombre', 'Teléfono'], ['Ana', '600']]);
  } catch (e) {
    saltó = e instanceof ErrorTabular;
  }
  comprobar(saltó, 'un fichero que no es un extracto se rechaza, no se interpreta');
}

// --- filas a movimientos ---------------------------------------------------

{
  const filas: Fila[] = [
    ['Fecha', 'Concepto', 'Importe', 'Saldo'],
    ['01/05/2026', 'NOMINA MAYO', '1.850,00', '1.854,02'],
    ['02/05/2026', 'MERCADONA', '-61,20', '1.792,82'],
    [],
    ['', 'Total', '', ''],
  ];
  const { movimientos } = filasAMovimientos(filas);
  comprobar(movimientos.length === 2, 'dos movimientos y el pie se descarta', movimientos.length);
  comprobar(movimientos[0].importe === '1850.00', 'el ingreso conserva su valor');
  comprobar(movimientos[1].importe === '-61.20', 'el cargo conserva el signo');
  comprobar(movimientos[0].saldo === '1854.02', 'y el saldo corrido');
}

{
  // El caso que motiva media librería: dos columnas, cifras sin signo.
  const filas: Fila[] = [
    ['Fecha', 'Concepto', 'Cargos', 'Abonos'],
    ['01/05/2026', 'NOMINA', '', '1.850,00'],
    ['02/05/2026', 'MERCADONA', '61,20', ''],
  ];
  const { movimientos } = filasAMovimientos(filas);
  comprobar(movimientos[0].importe === '1850.00', 'lo de abonos entra en positivo');
  comprobar(
    movimientos[1].importe === '-61.20',
    'lo de cargos entra en negativo aunque venga sin signo',
    movimientos[1].importe,
  );
}

{
  // Una fila con datos que no se entienden no se descarta en silencio: se
  // reporta. Perderla descuadraría el extracto y nadie se enteraría.
  const filas: Fila[] = [
    ['Fecha', 'Concepto', 'Importe'],
    ['01/05/2026', 'NOMINA', '1.850,00'],
    ['no es fecha', 'ALGO', 'ni es importe'],
  ];
  let saltó = false;
  try {
    filasAMovimientos(filas);
  } catch (e) {
    saltó = e instanceof ErrorTabular;
  }
  comprobar(saltó, 'una fila ilegible con datos aborta la lectura');
}

{
  // La fila de totales de un Excel **sí trae números** en las columnas de
  // cargos y abonos. Mirar sólo si el importe está vacío no la reconoce, y
  // acababa abortando la lectura de un extracto perfectamente válido.
  const filas: Fila[] = [
    ['Fecha', 'Concepto', 'Cargos', 'Abonos'],
    ['01/05/2026', 'NOMINA', '', '1.850,00'],
    ['02/05/2026', 'MERCADONA', '61,20', ''],
    [],
    ['', 'Total', '61,20', '1.850,00'],
  ];
  const { movimientos } = filasAMovimientos(filas);
  comprobar(movimientos.length === 2, 'la fila de totales con cifras no cuenta como movimiento', movimientos.length);
}

{
  // Pero una fila con dinero, sin fecha y que no se llama «Total» no se
  // descarta: podría ser un movimiento con la fecha en un formato raro.
  const filas: Fila[] = [
    ['Fecha', 'Concepto', 'Importe'],
    ['01/05/2026', 'NOMINA', '1.850,00'],
    ['', 'PAGO SIN FECHA', '-40,00'],
  ];
  let saltó = false;
  try {
    filasAMovimientos(filas);
  } catch (e) {
    saltó = e instanceof ErrorTabular;
  }
  comprobar(saltó, 'dinero sin fecha y sin etiqueta de total se reporta, no se traga');
}

// --- CSV -------------------------------------------------------------------

{
  const csv = 'Fecha;Concepto;Importe\n01/05/2026;"TRANSFERENCIA A GARCIA, LAURA";-50,00\n';
  const filas = leerCSV(csv);
  comprobar(filas.length === 2, 'dos filas', filas.length);
  comprobar(
    filas[1][1] === 'TRANSFERENCIA A GARCIA, LAURA',
    'la coma dentro de las comillas no parte el campo',
    filas[1][1],
  );
  const { movimientos } = filasAMovimientos(filas);
  comprobar(movimientos[0].importe === '-50.00', 'y el importe se lee bien');
}

{
  const csv = 'Fecha,Concepto,Importe\n01/05/2026,NOMINA,1850.00\n';
  const filas = leerCSV(csv);
  comprobar(filas[0].length === 3, 'detecta la coma como separador cuando toca', filas[0]);
}

{
  const csv = '﻿Fecha;Concepto;Importe\n01/05/2026;NOMINA;10,00\n';
  const filas = leerCSV(csv);
  comprobar(String(filas[0][0]) === 'Fecha', 'el BOM de Excel no se cuela en la cabecera', filas[0][0]);
}

console.log(fallos === 0 ? '\n✅ tabular: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
