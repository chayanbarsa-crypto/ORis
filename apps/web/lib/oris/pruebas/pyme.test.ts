/**
 * Pruebas de la lectura pyme del mes y de la previsión.
 *
 *   npx tsx lib/oris/pruebas/pyme.test.ts
 *
 * Las dos cosas que este archivo vigila son las dos que convierten un panel en
 * un cuento:
 *
 * **Que las partes sumen el todo.** Estructura y variable tienen que dar el
 * gasto, y facturación menos gasto tiene que dar el margen. Si la partición
 * pierde un movimiento por el camino, ninguna cifra da error: el margen sale
 * mejor de lo que es.
 *
 * **Que la previsión no invente.** Sin saldo declarado no hay previsión de
 * saldo; sin dos ciclos no hay estación; sin compromisos, todo el gasto es
 * variable. En los tres casos lo correcto es contestar «no lo sé» y no un
 * número redondo.
 */

import { aCentimos, formatear } from '../dinero';
import {
  cobroTipicoGlobal,
  diasDeCaja,
  indicadores,
  leerMes,
  saldoAlCierre,
  serieMensual,
  tesoreria,
} from '../pyme';
import { factoresEstacionales, mesesCompletos, prever } from '../prevision';
import { detectarCompromisos, vigentes } from '../recurrencia';
import type { MovimientoVista } from '../agregados';
import { extractoSintetico } from './pyme-sintetica';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
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

// --- la lectura de un mes ---------------------------------------------------

const unMes: MovimientoVista[] = [
  mov({ fecha: '2026-05-02', concepto: 'Transferencia realizada ALQUILER MES DE MAYO', importe: '-610.00' }),
  mov({ fecha: '2026-05-11', concepto: 'Cosmetica del sur Pago con tarjeta', importe: '-84.20' }),
  mov({ fecha: '2026-05-04', concepto: 'Bizum Recibido: cejas', importe: '11.00' }),
  mov({ fecha: '2026-05-06', concepto: 'Bizum Recibido: unas', importe: '27.00' }),
  mov({ fecha: '2026-05-09', concepto: 'Ingreso en efectivo oficina', importe: '820.00' }),
  mov({ fecha: '2026-05-20', concepto: 'Traspaso a mi cuenta de ahorro', importe: '-300.00', categoria: 'Traspaso entre cuentas propias' }),
  mov({ fecha: '2026-04-30', concepto: 'Bizum Recibido: pedicura', importe: '24.00' }),
];

// El alquiler necesita histórico para ser un compromiso: se lo damos, de enero
// a abril. Mayo lo trae `unMes` — repetirlo aquí cargaría el alquiler dos veces
// en el mes que se está midiendo.
const historico: MovimientoVista[] = Array.from({ length: 4 }, (_, i) =>
  mov({
    fecha: `2026-0${i + 1}-02`,
    concepto: 'Transferencia realizada ALQUILER MES DE ENERO',
    importe: '-610.00',
  }),
);
const compromisos = detectarCompromisos([...historico, ...unMes]);
const mayo = leerMes([...historico, ...unMes], '2026-05', compromisos);

comprobar(mayo.facturacion === 85800, 'la facturación suma los ingresos, no los traspasos', formatear(mayo.facturacion));
comprobar(mayo.cobros === 3, 'tres cobros, y el traspaso no es uno', mayo.cobros);
comprobar(mayo.traspasos === 30000, 'el traspaso se informa aparte', formatear(mayo.traspasos));
comprobar(mayo.estructura === 61000, 'el alquiler es estructura', formatear(mayo.estructura));
comprobar(mayo.variable === 8420, 'la compra de material es variable', formatear(mayo.variable));
comprobar(
  mayo.estructura + mayo.variable === mayo.gasto,
  'estructura + variable = gasto, sin perder ningún movimiento por el camino',
);
comprobar(
  mayo.facturacion - mayo.gasto === mayo.margen,
  'facturación − gasto = margen',
  formatear(mayo.margen),
);
comprobar(
  mayo.cobroTipico === 2700,
  'el cobro típico es la mediana (27 €), no la media (286 €) que infla el ingreso en efectivo',
  formatear(mayo.cobroTipico ?? 0),
);

const sinCompromisos = leerMes([...historico, ...unMes], '2026-05', []);
comprobar(
  sinCompromisos.estructura === 0 && sinCompromisos.variable === 69420,
  'sin compromisos detectados todo el gasto es variable: no detectar no es saber que no hay',
);
comprobar(
  sinCompromisos.gasto === mayo.gasto,
  'y el gasto total no cambia según se hayan detectado compromisos o no',
);

// --- los indicadores --------------------------------------------------------

const ind = indicadores(mayo, 2000);
comprobar(ind.equilibrio === 31, 'con estructura de 610 € y cobro típico de 20 €, hacen falta 31', ind.equilibrio);
comprobar(
  ind.equivalentes === 43,
  'los 858 € facturados equivalen a 43 cobros típicos, no a los 3 apuntes de ingreso',
  ind.equivalentes,
);
comprobar(ind.distanciaAlEquilibrio === 12, 'y sobre los 31 del umbral, sobraron 12');
// La comprobación que motivó el cambio: los dos indicadores salen de las mismas
// dos cifras, así que no pueden discrepar sobre si el mes llegó o no.
comprobar(
  ind.cobertura !== null &&
    ind.distanciaAlEquilibrio !== null &&
    ind.cobertura >= 1 === ind.distanciaAlEquilibrio >= 0,
  'la cobertura y la distancia al equilibrio nunca se contradicen',
  { cobertura: ind.cobertura, distancia: ind.distanciaAlEquilibrio },
);
comprobar(
  Math.abs((ind.cobertura ?? 0) - 858 / 610) < 1e-9,
  'la cobertura es facturación entre estructura',
  ind.cobertura,
);

const vacio = indicadores(leerMes([], '2026-05', []));
comprobar(
  vacio.cobertura === null &&
    vacio.equilibrio === null &&
    vacio.equivalentes === null &&
    vacio.margenRelativo === null,
  'sin datos, los ratios son null y no cero: no es lo mismo cero que no saberlo',
);

// --- el saldo ---------------------------------------------------------------

const conSaldos: MovimientoVista[] = [
  mov({ fecha: '2026-05-31', importe: '-10.00', saldo: '100.00', posicion: 1, banco: 'BBVA' }),
  mov({ fecha: '2026-05-31', importe: '-10.00', saldo: '90.00', posicion: 2, banco: 'BBVA' }),
  mov({ fecha: '2026-05-30', importe: '-10.00', saldo: '110.00', posicion: 0, banco: 'BBVA' }),
];
comprobar(
  saldoAlCierre(conSaldos, '2026-05') === 9000,
  'con dos apuntes del mismo día manda la posición, no el orden del array',
  formatear(saldoAlCierre(conSaldos, '2026-05') ?? 0),
);

const dosBancos = tesoreria([
  ...conSaldos,
  mov({ fecha: '2026-05-20', importe: '-5.00', saldo: '400.00', posicion: 0, banco: 'Otro banco' }),
]);
comprobar(dosBancos.total === 49000, 'la tesorería suma una caja por banco', formatear(dosBancos.total ?? 0));
comprobar(dosBancos.porBanco.length === 2, 'y las enumera para no mezclarlas', dosBancos.porBanco);

const sinSaldos = tesoreria([mov({ importe: '-10.00' })]);
comprobar(
  sinSaldos.total === null && sinSaldos.sinSaldo === 1,
  'si el banco no declara saldo, la tesorería es null y se cuenta cuántos faltan',
);
comprobar(diasDeCaja(null, []) === null, 'sin saldo no hay días de caja que contar');
comprobar(
  diasDeCaja(300000, [leerMes([], '2026-05', [])]) === null,
  'sin gasto tampoco: dividir por cero no es «infinitos días»',
);

// --- el negocio sintético completo -----------------------------------------

const negocio = extractoSintetico();
const susCompromisos = detectarCompromisos(negocio);
const serie = serieMensual(negocio, susCompromisos);

comprobar(serie.length === 26, 'veintiséis meses de serie, uno por mes', serie.length);
comprobar(
  serie.every((l, i) => i === 0 || l.mes > serie[i - 1].mes),
  'la serie va del mes más antiguo al más reciente, sin huecos ni repeticiones',
);
comprobar(
  serie.every((l) => l.estructura + l.variable === l.gasto),
  'la partición cuadra en los veintiséis meses',
);

const totalMovimientos = negocio.filter((m) => aCentimos(m.importe) !== null).length;
comprobar(
  serie.reduce((acc, l) => acc + l.movimientos, 0) === totalMovimientos,
  'ningún movimiento se pierde entre los meses',
);

const sumaImportes = negocio.reduce((acc, m) => acc + (aCentimos(m.importe) ?? 0), 0);
comprobar(
  serie.reduce((acc, l) => acc + l.margen, 0) === sumaImportes,
  'la suma de los márgenes es la suma de los importes: el panel cuadra con el extracto',
  formatear(serie.reduce((acc, l) => acc + l.margen, 0) - sumaImportes),
);

const caja = tesoreria(negocio);
comprobar(
  caja.total === saldoAlCierre(negocio),
  'la tesorería de un solo banco es el saldo del último apunte',
  formatear(caja.total ?? 0),
);
comprobar(
  cobroTipicoGlobal(negocio) !== null && (cobroTipicoGlobal(negocio) as number) < 5000,
  'el cobro típico del negocio está en el orden de un servicio, no de un ingreso en efectivo',
  formatear(cobroTipicoGlobal(negocio) ?? 0),
);

// --- estacionalidad ---------------------------------------------------------

comprobar(
  mesesCompletos(serie).length === 24,
  'se descartan el primer y el último mes, que casi nunca están completos',
  mesesCompletos(serie).length,
);
comprobar(mesesCompletos(serie.slice(0, 4)).length === 4, 'con cuatro meses no se recorta nada');

const factores = factoresEstacionales(serie);
comprobar(factores.length === 12, 'con dos ciclos hay un factor por mes del año', factores.length);
comprobar(
  Math.abs(factores.reduce((a, f) => a + f.factor, 0) / 12 - 1) < 0.001,
  'los factores están normalizados a media 1',
  factores.reduce((a, f) => a + f.factor, 0) / 12,
);
const abril = factores.find((f) => f.mes === 4)?.factor ?? 0;
const septiembre = factores.find((f) => f.mes === 9)?.factor ?? 0;
comprobar(
  abril > 1.2 && septiembre < 0.8,
  'reconoce el abril fuerte y el septiembre flojo que se metieron en el generador',
  { abril, septiembre },
);
comprobar(
  factoresEstacionales(serie.slice(0, 14)).length === 0,
  'con año y pico no se inventa estación: haría falta un segundo ciclo',
);

// --- la previsión -----------------------------------------------------------

const p = prever(negocio, susCompromisos, { horizonte: 6 });
comprobar(p !== null, 'hay previsión');
comprobar(p?.meses.length === 6, 'seis meses proyectados', p?.meses.length);
comprobar(p?.ancla === serie[serie.length - 1].mes, 'ancla en el último mes con datos', p?.ancla);
comprobar(
  p?.meses[0].mes === '2026-10' && p?.meses[5].mes === '2027-03',
  'la previsión empieza en el mes siguiente al último cargado',
  [p?.meses[0].mes, p?.meses[5].mes],
);
comprobar(p?.saldoInicial === caja.total, 'parte del saldo real, no de cero');
comprobar(p?.base.estacional === true, 'con dos ciclos, corrige por estación');

comprobar(
  p!.meses.every((m) => m.ingreso.prudente <= m.ingreso.esperado && m.ingreso.esperado <= m.ingreso.bueno),
  'los tres escenarios de ingreso salen siempre ordenados',
);
comprobar(
  p!.meses.every((m) => m.variable.bueno <= m.variable.esperado && m.variable.esperado <= m.variable.prudente),
  'y los del gasto van al revés: el prudente es el que más gasta',
);
comprobar(
  p!.meses.every((m) => m.ingreso.prudente < m.ingreso.bueno),
  'la banda no está colapsada: el escenario malo y el bueno se distinguen',
  [p!.meses[0].ingreso.prudente, p!.meses[0].ingreso.bueno],
);
comprobar(
  p!.meses.every((m) => (m.saldo?.prudente ?? 0) <= (m.saldo?.bueno ?? 0)),
  'el saldo prudente nunca queda por encima del bueno',
);
comprobar(
  p!.meses.every((m) => m.gasto.esperado === m.comprometido + m.variable.esperado),
  'el gasto previsto es lo comprometido más lo variable, sin sumas fantasma',
);
comprobar(
  p!.meses.every((m) => m.comprometido === m.vencimientos.reduce((a, c) => a + c.importe, 0)),
  'lo comprometido de un mes es exactamente lo que vence ese mes',
);
comprobar(
  p!.base.gastoExplicado > 0.4 && p!.base.gastoExplicado <= 1,
  'los compromisos explican una parte razonable del gasto histórico',
  p!.base.gastoExplicado,
);

const arranque = p!.meses[0];
comprobar(
  arranque.saldo!.esperado ===
    (p!.saldoInicial ?? 0) + arranque.ingreso.esperado - arranque.gasto.esperado,
  'el primer saldo previsto es el real más lo que entra menos lo que sale',
);

// La previsión sin saldo declarado: hay flujos, no hay caja.
const aCiegas = extractoSintetico({ sinSaldo: true });
const sinCaja = prever(aCiegas, detectarCompromisos(aCiegas), { horizonte: 3 });
comprobar(sinCaja?.saldoInicial === null, 'sin saldo declarado no hay saldo de partida');
comprobar(
  sinCaja?.meses.every((m) => m.saldo === null) === true,
  'y no se dibuja una caja partiendo de cero, que sería afirmar que está vacía',
);
comprobar(
  sinCaja?.mesEnRojo === null,
  'ni se avisa de un mes en rojo que no se puede saber',
  sinCaja?.mesEnRojo,
);
comprobar(
  (sinCaja?.meses[0].ingreso.esperado ?? 0) > 0,
  'lo que sí se puede prever —lo que entra y sale— se sigue previendo',
);

comprobar(prever([], [], {}) === null, 'sin movimientos no hay previsión, y se devuelve null');

// Un negocio que se hunde tiene que enseñar la fecha.
const enCaida = extractoSintetico({ saldoInicial: 900 });
const caida = prever(enCaida, detectarCompromisos(enCaida), { horizonte: 12 });
const primerNegativo = caida!.meses.find((m) => (m.saldo?.prudente ?? 0) < 0);
comprobar(
  caida?.mesEnRojo === (primerNegativo?.mes ?? null),
  'el mes en rojo es el primero cuyo saldo prudente baja de cero',
  { mesEnRojo: caida?.mesEnRojo, primerNegativo: primerNegativo?.mes },
);

// --- la estructura, en cifras ----------------------------------------------

const enPie = vigentes(susCompromisos);
comprobar(
  p!.meses.every((m) => m.comprometido > 0),
  'todos los meses previstos traen algún vencimiento: hay compromisos mensuales',
);
comprobar(
  enPie.some((c) => c.cadencia === 'trimestral'),
  'el seguro trimestral del generador se detecta como trimestral',
  enPie.map((c) => `${c.huella}: ${c.cadencia}`),
);

console.log(fallos === 0 ? '\n✅ pyme: todo en verde' : `\n❌ pyme: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
