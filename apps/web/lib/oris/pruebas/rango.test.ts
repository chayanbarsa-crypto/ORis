/**
 * Pruebas de los rangos del histórico.
 *
 *   npx tsx lib/oris/pruebas/rango.test.ts
 *
 * El caso que justifica todo el módulo está abajo del todo: datos que acaban
 * en mayo, mirados en agosto. Contando desde hoy, «últimos 3 meses» no
 * devolvería nada y el panel diría que no hay dinero. Contando desde el último
 * movimiento, devuelve marzo, abril y mayo.
 */

import type { MovimientoVista } from '../agregados';
import {
  anclaje,
  aplicar,
  bancosDe,
  nombreCorto,
  origen,
  periodoDe,
  rangosDisponibles,
  restarMeses,
  sinBanco,
} from '../rango';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

let n = 0;
function mov(fecha: string, banco: string | null = null): MovimientoVista {
  n += 1;
  return { id: `m${n}`, fecha, concepto: 'x', importe: '-10.00', categoria: null, origen: null, banco };
}

// --- aritmética de meses ---------------------------------------------------

comprobar(restarMeses('2026-05', 0) === '2026-05', 'restar cero deja el mismo mes');
comprobar(restarMeses('2026-05', 5) === '2025-12', 'cinco meses atrás cruza el año', restarMeses('2026-05', 5));
comprobar(restarMeses('2026-01', 1) === '2025-12', 'de enero se pasa a diciembre');
comprobar(restarMeses('2026-01', 12) === '2025-01', 'doce meses atrás es el mismo mes del año anterior');
comprobar(restarMeses('2026-03', 14) === '2025-01', 'y catorce cruzan bien', restarMeses('2026-03', 14));

// --- extremos --------------------------------------------------------------

{
  const movs = [mov('2026-05-10'), mov('2025-11-02'), mov('2026-02-20')];
  comprobar(anclaje(movs) === '2026-05', 'el ancla es el mes más reciente');
  comprobar(origen(movs) === '2025-11', 'y el origen, el más antiguo');
  comprobar(periodoDe(movs) === 'nov 2025 – may 2026', 'el periodo se dice en palabras', periodoDe(movs));
  comprobar(anclaje([]) === null, 'sin movimientos no hay ancla');
}

comprobar(periodoDe([mov('2026-05-01')]) === 'may 2026',
  'con un solo mes no se escribe dos veces');
comprobar(nombreCorto('2026-09') === 'sep 2026', 'septiembre se abrevia sep');

// --- qué rangos se ofrecen -------------------------------------------------

{
  // Cuatro meses cargados: «12 meses» y «año» no recortan nada, así que sobran.
  const movs = [mov('2026-02-01'), mov('2026-05-01')];
  const claves = rangosDisponibles(movs).map((r) => r.clave);
  comprobar(claves.includes('3m'), 'tres meses sí recorta y se ofrece', claves);
  comprobar(!claves.includes('12m'), 'doce meses no recorta nada: no se ofrece', claves);
  comprobar(!claves.includes('anio'), 'y el año tampoco, si los datos empiezan dentro de él');
  comprobar(claves[claves.length - 1] === 'todo', 'todo el histórico va siempre, y el último');
}

{
  const movs = [mov('2024-01-01'), mov('2026-05-01')];
  const claves = rangosDisponibles(movs).map((r) => r.clave);
  comprobar(
    claves.join(',') === '3m,6m,12m,anio,todo',
    'con dos años de datos se ofrecen todos, de menor a mayor',
    claves,
  );
  const anio = rangosDisponibles(movs).find((r) => r.clave === 'anio');
  comprobar(anio?.etiqueta === 'Año 2026', 'el año se nombra por el del ancla, no por el de hoy', anio?.etiqueta);
  comprobar(anio?.desde === '2026-01', 'y empieza en su enero');
}

comprobar(rangosDisponibles([]).length === 0, 'sin datos no hay rangos que ofrecer');

// --- filtrado --------------------------------------------------------------

{
  const movs = [mov('2025-08-31'), mov('2025-12-31'), mov('2026-01-01'), mov('2026-05-31')];
  const seis = rangosDisponibles(movs).find((r) => r.clave === '6m')!;
  comprobar(seis.desde === '2025-12', 'seis meses hasta mayo empiezan en diciembre', seis.desde);
  comprobar(aplicar(movs, seis).length === 3, 'y entran los tres de dentro, no el de agosto',
    aplicar(movs, seis).map((m) => m.fecha));

  const tres = rangosDisponibles(movs).find((r) => r.clave === '3m')!;
  comprobar(aplicar(movs, tres).length === 1, 'tres meses dejan fuera diciembre y enero',
    aplicar(movs, tres).map((m) => m.fecha));
  comprobar(aplicar(movs, null).length === 4, 'sin rango no se filtra nada');
  comprobar(
    aplicar(movs, { clave: 'todo', etiqueta: 'Todo', desde: null }).length === 4,
    '«todo» tampoco recorta',
  );
}

{
  // El caso de la cabecera: los datos acaban en mayo y hoy es agosto.
  const movs = [mov('2026-03-05'), mov('2026-04-05'), mov('2026-05-05')];
  const tres = rangosDisponibles(movs);
  comprobar(tres.length === 1 && tres[0].clave === 'todo',
    'tres meses de datos: nada que recortar, sólo «todo»', tres.map((r) => r.clave));
  comprobar(anclaje(movs) === '2026-05',
    'y el ancla sigue siendo mayo aunque el reloj diga agosto');
}

// --- bancos ----------------------------------------------------------------

{
  const movs = [mov('2026-05-01', 'BBVA'), mov('2026-05-02', 'Openbank'), mov('2026-05-03', 'BBVA'), mov('2026-05-04', null)];
  comprobar(bancosDe(movs).join(',') === 'BBVA,Openbank', 'los bancos salen una vez y ordenados', bancosDe(movs));
  comprobar(sinBanco(movs) === 1, 'y se cuenta lo que viene sin identificar');
  comprobar(sinBanco([mov('2026-05-01', 'BBVA')]) === 0, 'si todo está identificado, cero');
}

console.log(fallos === 0 ? '\n✅ rango: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
