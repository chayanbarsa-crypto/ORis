/**
 * Pruebas de la serie temporal y su proyección.
 *
 *   npx tsx lib/oris/pruebas/series.test.ts
 *
 * Lo que aquí puede salir mal no da error: da una pendiente equivocada. Un mes
 * sin movimientos que se salte junta marzo con junio y dibuja tres meses de
 * caída como si fueran uno.
 */

import { CATEGORIA_TRASPASO, type MovimientoVista } from '../agregados';
import { mesesDeAguante, proyectar, serieMensual } from '../series';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

let n = 0;
function mov(fecha: string, importe: string, categoria: string | null = null): MovimientoVista {
  n += 1;
  return { id: `m${n}`, fecha, concepto: 'x', importe, categoria, origen: null };
}

// --- la serie --------------------------------------------------------------

{
  const serie = serieMensual([
    mov('2026-01-10', '1000.00'),
    mov('2026-01-20', '-400.00'),
    mov('2026-02-05', '1000.00'),
    mov('2026-02-15', '-1200.00'),
  ]);
  comprobar(serie.length === 2, 'dos meses', serie.length);
  comprobar(serie[0].ingresos === 100000, 'ingresos de enero en céntimos', serie[0].ingresos);
  comprobar(serie[0].gastos === 40000, 'gastos de enero en positivo', serie[0].gastos);
  comprobar(serie[0].neto === 60000, 'neto de enero');
  comprobar(serie[1].neto === -20000, 'neto de febrero');
  comprobar(serie[1].acumulado === 40000, 'el acumulado encadena los dos', serie[1].acumulado);
}

{
  // El caso que importa: un hueco no se salta.
  const serie = serieMensual([mov('2026-03-10', '-100.00'), mov('2026-06-10', '-100.00')]);
  comprobar(serie.length === 4, 'marzo, abril, mayo y junio', serie.map((p) => p.mes));
  comprobar(serie[1].mes === '2026-04' && serie[1].neto === 0, 'abril existe y vale cero');
  comprobar(serie[3].acumulado === -20000, 'y el acumulado llega correcto al final');
}

{
  const serie = serieMensual([
    mov('2026-01-10', '1000.00'),
    mov('2026-01-11', '-1000.00', CATEGORIA_TRASPASO),
    mov('2026-01-12', '1000.00', CATEGORIA_TRASPASO),
  ]);
  comprobar(serie[0].neto === 100000, 'los traspasos no cuentan ni como ingreso ni como gasto');
  comprobar(serie[0].movimientos === 1, 'ni se cuentan como movimientos del mes', serie[0].movimientos);
}

{
  comprobar(serieMensual([]).length === 0, 'sin movimientos no hay serie');
}

{
  // Céntimos enteros: en coma flotante, doce sumas encadenadas arrastran error.
  const serie = serieMensual([
    mov('2026-01-01', '0.10'),
    mov('2026-01-02', '0.20'),
  ]);
  comprobar(serie[0].acumulado === 30, '0,10 + 0,20 = 0,30 exacto', serie[0].acumulado);
}

// --- la proyección ---------------------------------------------------------

{
  const serie = serieMensual([
    mov('2026-01-10', '-100.00'),
    mov('2026-02-10', '-200.00'),
    mov('2026-03-10', '-300.00'),
  ]);
  const p = proyectar(serie, 3);
  comprobar(p?.ritmo === -20000, 'el ritmo es la media de los tres', p?.ritmo);
  comprobar(p?.puntos.length === 3, 'tres meses proyectados', p?.puntos.length);
  comprobar(p?.puntos[0].mes === '2026-04', 'el primero es abril', p?.puntos[0].mes);
  comprobar(p?.puntos[2].acumulado === -120000, 'y el acumulado sigue bajando', p?.puntos[2].acumulado);
}

{
  // Diciembre a enero: el año tiene que avanzar.
  const serie = serieMensual([mov('2026-12-10', '-100.00')]);
  const p = proyectar(serie, 2);
  comprobar(p?.puntos[0].mes === '2027-01', 'de diciembre se pasa a enero del año siguiente', p?.puntos[0].mes);
}

{
  comprobar(proyectar([], 3) === null, 'sin serie no hay proyección');
}

{
  // Se promedian los ÚLTIMOS meses, no todos: un año incluiría meses que ya no
  // se parecen a la vida actual.
  const serie = serieMensual([
    mov('2026-01-10', '5000.00'),
    mov('2026-02-10', '-100.00'),
    mov('2026-03-10', '-100.00'),
    mov('2026-04-10', '-100.00'),
  ]);
  const p = proyectar(serie, 1, 3);
  comprobar(p?.ritmo === -10000, 'el mes bueno de enero no diluye el ritmo actual', p?.ritmo);
  comprobar(p?.base === 3, 'y se dice sobre cuántos meses se calculó', p?.base);
}

// --- el aguante ------------------------------------------------------------

comprobar(mesesDeAguante(100000, -20000) === 5, 'mil euros a doscientos al mes son cinco meses');
comprobar(mesesDeAguante(null, -20000) === null, 'sin saldo conocido no hay respuesta');
comprobar(mesesDeAguante(100000, 20000) === null, 'si cada mes entra más de lo que sale, no hay cuenta atrás');
comprobar(mesesDeAguante(0, -20000) === null, 'sin saldo no hay nada que aguantar');
comprobar(mesesDeAguante(-5000, -20000) === null, 'en números rojos tampoco');

console.log(fallos === 0 ? '\n✅ series: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
