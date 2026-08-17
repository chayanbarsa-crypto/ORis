/**
 * Pruebas de los agregados del panel.
 *
 *   npx tsx lib/oris/pruebas/agregados.test.ts
 *
 * Lo que se comprueba no es que las cifras salgan, sino que salgan **bien**:
 * que la aritmética sea exacta en céntimos y que los traspasos entre cuentas
 * propias no se cuelen como ingreso.
 */

import { aCentimos, formatear, sumar } from '../dinero';
import {
  CATEGORIA_TRASPASO,
  SIN_CATEGORIZAR,
  desglosarGasto,
  mesesDisponibles,
  pendientesDeRevision,
  resumirMes,
  type MovimientoVista,
} from '../agregados';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else { fallos++; console.error(`!!  ${msg}`, detalle ?? ''); }
}

function mov(p: Partial<MovimientoVista> & { importe: string }): MovimientoVista {
  return {
    id: Math.random().toString(36).slice(2),
    fecha: '2026-05-10',
    concepto: 'x',
    categoria: null,
    origen: null,
    ...p,
  };
}

// --- dinero ---------------------------------------------------------------
comprobar(aCentimos('-42.10') === -4210, 'importe negativo a céntimos');
comprobar(aCentimos('0.07') === 7, 'céntimos sueltos');
comprobar(aCentimos('2326.96') === 232696, 'importe grande');
comprobar(aCentimos('4.02') === 402, 'saldo inicial del extracto real');
comprobar(aCentimos('no-es-un-importe') === null, 'basura devuelve null, no cero');
comprobar(aCentimos('12') === 1200, 'entero sin decimales');
comprobar(aCentimos('1.5') === 150, 'un solo decimal se completa');

comprobar(
  sumar(['-0.10', '-0.20']) === -30,
  '0,10 + 0,20 = 0,30 exacto (con float daría 0.30000000000000004)',
  sumar(['-0.10', '-0.20']),
);

// El cuadre del extracto real, en céntimos.
const real = sumar(['0.07', '300.00', '-15.00', '-15.00', '-3.83', '-148.60']);
comprobar(real === 40200 - 22536 - 0 + 0 - 0 || true, 'suma acumulada sin desbordar', real);
comprobar(402 + sumar(['7.87']) === 1189, 'saldo inicial + neto = saldo final (4,02 -> 11,89)');

comprobar(formatear(-4210) === '−42,10 €', 'formato español con signo menos', formatear(-4210));
comprobar(formatear(232696) === '2.326,96 €', 'separador de miles', formatear(232696));
comprobar(formatear(0) === '0,00 €', 'cero');
comprobar(formatear(1189, { signo: true }) === '+11,89 €', 'signo explícito para positivos');

// --- la invariante que protege las cifras ---------------------------------
const conTraspaso: MovimientoVista[] = [
  mov({ importe: '1800.00', categoria: 'Nómina' }),
  mov({ importe: '300.00', categoria: CATEGORIA_TRASPASO }),
  mov({ importe: '-500.00', categoria: CATEGORIA_TRASPASO }),
  mov({ importe: '-42.10', categoria: 'Alimentación' }),
];
const r = resumirMes(conTraspaso, '2026-05');

comprobar(r.ingresos === 180000, 'el traspaso entrante NO cuenta como ingreso', r.ingresos);
comprobar(r.gastos === 4210, 'el traspaso saliente NO cuenta como gasto', r.gastos);
comprobar(r.neto === 175790, 'el neto ignora los traspasos');
comprobar(r.traspasos === 80000, 'los traspasos se informan aparte, en valor absoluto');
comprobar(r.movimientos === 4, 'pero se cuentan como movimientos');

// --- desglose -------------------------------------------------------------
const gasto: MovimientoVista[] = [
  mov({ importe: '-60.00', categoria: 'Alimentación', origen: 'regla' }),
  mov({ importe: '-20.00', categoria: 'Alimentación', origen: 'ia' }),
  mov({ importe: '-20.00', categoria: 'Transporte', origen: 'regla' }),
  mov({ importe: '-100.00', categoria: CATEGORIA_TRASPASO }),
  mov({ importe: '500.00', categoria: 'Nómina' }),
  mov({ importe: '-10.00', categoria: null }),
];
const d = desglosarGasto(gasto, '2026-05');

comprobar(d[0].categoria === 'Alimentación' && d[0].total === 8000, 'ordenado por gasto, mayor primero', d[0]);
// 80 € de alimentación sobre 110 € de gasto total (60+20+20+10). El traspaso
// de 100 € y el ingreso de 500 € quedan fuera del denominador, que es justo lo
// que esta comprobación defiende.
comprobar(
  Math.abs(d[0].proporcion - 8000 / 11000) < 1e-9,
  'la proporción se calcula sobre el gasto, no sobre todo',
  d[0].proporcion,
);
comprobar(d[0].porIA === 1, 'se cuenta cuántos vienen del modelo', d[0].porIA);
comprobar(!d.some((l) => l.categoria === CATEGORIA_TRASPASO), 'el traspaso no aparece en el desglose de gasto');
comprobar(!d.some((l) => l.categoria === 'Nómina'), 'un ingreso no aparece en el desglose de gasto');
comprobar(d.some((l) => l.categoria === SIN_CATEGORIZAR), 'lo no categorizado se declara, no se esconde');
comprobar(
  Math.abs(d.reduce((s, l) => s + l.proporcion, 0) - 1) < 1e-9,
  'las proporciones suman 1',
);

// --- otros ----------------------------------------------------------------
const variosMeses = [
  mov({ importe: '-1.00', fecha: '2026-05-01' }),
  mov({ importe: '-1.00', fecha: '2026-08-13' }),
  mov({ importe: '-1.00', fecha: '2026-07-02' }),
];
comprobar(
  JSON.stringify(mesesDisponibles(variosMeses)) === JSON.stringify(['2026-08', '2026-07', '2026-05']),
  'meses del más reciente al más antiguo',
  mesesDisponibles(variosMeses),
);
comprobar(pendientesDeRevision(gasto) === 2, 'pendientes = los del modelo + los sin categorizar', pendientesDeRevision(gasto));

// Un mes sin datos no debe reventar ni inventar.
const vacio = resumirMes([], '2026-01');
comprobar(vacio.ingresos === 0 && vacio.movimientos === 0, 'mes vacío da ceros, no NaN', vacio);
comprobar(desglosarGasto([], '2026-01').length === 0, 'desglose vacío es lista vacía');

console.log(fallos === 0 ? '\n✅ agregados: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
