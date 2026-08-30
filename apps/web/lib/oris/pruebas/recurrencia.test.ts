/**
 * Pruebas de la detección de compromisos.
 *
 *   npx tsx lib/oris/pruebas/recurrencia.test.ts
 *
 * Lo que se vigila aquí es lo que la previsión da por cierto. Un compromiso mal
 * detectado no da error: da una previsión con buena pinta y con el alquiler
 * puesto donde no toca. Por eso las comprobaciones son de las tres cosas que
 * pueden salir mal sin avisar —agrupar mal, presupuestar de menos, y seguir
 * cobrando un recibo cancelado— y no de que la función devuelva algo.
 */

import {
  caeEn,
  cesados,
  comprometidoEn,
  costeMensual,
  detectarCompromisos,
  huellaCompromiso,
  proximoCargo,
  vigentes,
} from '../recurrencia';
import { formatear } from '../dinero';
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

function mov(fecha: string, concepto: string, importe: string): MovimientoVista {
  return { id: `${fecha}-${concepto}`, fecha, concepto, importe, categoria: null, origen: null };
}

/** Un cargo idéntico el mismo día de `n` meses seguidos. */
function mensual(desde: string, n: number, concepto: string, importe: string): MovimientoVista[] {
  const [a0, m0] = desde.split('-').map(Number);
  const [dia] = [desde.slice(8, 10)];
  return Array.from({ length: n }, (_, i) => {
    const total = a0 * 12 + (m0 - 1) + i;
    const anio = Math.floor(total / 12);
    const mes = String((total % 12) + 1).padStart(2, '0');
    return mov(`${anio}-${mes}-${dia}`, concepto, importe);
  });
}

// --- la huella --------------------------------------------------------------

comprobar(
  huellaCompromiso('Transferencia realizada ALQUILER MES DE AGOSTO 2026 LOCAL') ===
    huellaCompromiso('Transferencia realizada ALQUILER MES DE SEPTIEMBRE 2026 LOCAL'),
  'el nombre del mes no separa dos cargos del mismo alquiler',
  huellaCompromiso('Transferencia realizada ALQUILER MES DE AGOSTO 2026 LOCAL'),
);

comprobar(
  huellaCompromiso('Pago de impuestos Nrc. 1155334125461ayhaw9n3h') ===
    huellaCompromiso('Pago de impuestos Nrc. 3035387084134fsmp09n1j'),
  'dos referencias distintas del mismo impuesto caen en la misma huella',
);

comprobar(
  huellaCompromiso('Adeudo de cuota de la seguridad social') !==
    huellaCompromiso('Adeudo de comunidad de propietarios'),
  'dos «adeudos de» distintos no colapsan en un solo compromiso',
);

comprobar(huellaCompromiso('') === '', 'concepto vacío no revienta');
comprobar(
  huellaCompromiso('Cargo 4471 2026') === '',
  'un concepto que es todo referencia no deja huella que agrupar',
  huellaCompromiso('Cargo 4471 2026'),
);

// --- cadencia e importe -----------------------------------------------------

const alquiler = detectarCompromisos(
  mensual('2025-01-04', 12, 'Transferencia realizada ALQUILER MES DE ENERO', '-610.00'),
);
comprobar(alquiler.length === 1, 'doce cargos iguales son un solo compromiso', alquiler.length);
comprobar(alquiler[0]?.cadencia === 'mensual', 'doce cargos, uno al mes: mensual');
comprobar(alquiler[0]?.confianza === 1, 'sin huecos, confianza plena');
comprobar(alquiler[0]?.dia === 4, 'el día del mes se conserva', alquiler[0]?.dia);
comprobar(alquiler[0]?.oscilacion === 0, 'importe fijo, oscilación cero');
comprobar(alquiler[0]?.vivo === true, 'un recibo que llega hasta el último mes sigue vivo');

const trimestral = detectarCompromisos([
  mov('2025-01-20', 'Adeudo de seguro del local', '-148.90'),
  mov('2025-04-20', 'Adeudo de seguro del local', '-148.90'),
  mov('2025-07-20', 'Adeudo de seguro del local', '-148.90'),
  mov('2025-10-20', 'Adeudo de seguro del local', '-148.90'),
]);
comprobar(trimestral[0]?.cadencia === 'trimestral', 'un cargo cada tres meses es trimestral');
comprobar(
  costeMensual(trimestral[0]) === 4963,
  'un trimestral de 148,90 € pesa 49,63 € al mes',
  formatear(costeMensual(trimestral[0])),
);
comprobar(
  caeEn(trimestral[0], '2026-01') && !caeEn(trimestral[0], '2025-12'),
  'el trimestral cae en enero y no en diciembre',
);

// --- el error que costó 78 € al mes ----------------------------------------
//
// Una plataforma que cobra cuatro veces al mes: si se toma el importe de un
// cargo en vez del total del mes, la previsión presupuesta la cuarta parte.
const porReserva = [
  ...mensual('2025-01-09', 10, 'Www.reservas.example Pago con tarjeta', '-25.00'),
  ...mensual('2025-01-15', 10, 'Www.reservas.example Pago con tarjeta', '-25.00'),
  ...mensual('2025-01-21', 10, 'Www.reservas.example Pago con tarjeta', '-25.00'),
  ...mensual('2025-01-27', 10, 'Www.reservas.example Pago con tarjeta', '-25.00'),
];
const reservas = detectarCompromisos(porReserva);
comprobar(reservas.length === 1, 'cuarenta cargos de la misma plataforma son un compromiso');
comprobar(
  reservas[0]?.importe === 10000,
  'se presupuesta el mes entero (100 €), no un cargo (25 €)',
  formatear(reservas[0]?.importe ?? 0),
);
comprobar(reservas[0]?.cadencia === 'mensual', 'cuatro cargos al mes no lo vuelven irregular');
comprobar(reservas[0]?.cargos === 40 && reservas[0]?.meses === 10, 'cuenta cargos y meses aparte');

// --- lo que se para ---------------------------------------------------------

const conNomina = [
  ...mensual('2025-01-12', 10, 'Transferencia realizada NOMINA ENERO', '-900.00'),
  ...mensual('2025-01-04', 20, 'Transferencia realizada ALQUILER MES DE ENERO', '-610.00'),
];
const detectados = detectarCompromisos(conNomina);
const parados = cesados(detectados);
comprobar(parados.length === 1, 'la nómina que dejó de pagarse aparece como cesada', parados.length);
comprobar(parados[0]?.hasta === '2025-10', 'y se dice cuándo fue la última', parados[0]?.hasta);
comprobar(
  vigentes(detectados).every((c) => c.huella !== parados[0]?.huella),
  'un compromiso cesado no está entre los vigentes',
);
comprobar(
  !caeEn(parados[0], '2026-10'),
  'y no vence nunca más, aunque su cadencia diría que sí',
  caeEn(parados[0], '2026-10'),
);
comprobar(
  comprometidoEn(detectados, '2026-10') === 61000,
  'pasar la lista entera a comprometidoEn no cuela la nómina cesada',
  formatear(comprometidoEn(detectados, '2026-10')),
);

// --- la subida de precio ----------------------------------------------------

const conSubida = [
  ...mensual('2025-01-04', 9, 'Transferencia realizada ALQUILER MES DE ENERO', '-610.00'),
  ...mensual('2025-10-04', 4, 'Transferencia realizada ALQUILER MES DE OCTUBRE', '-632.50'),
];
const subido = detectarCompromisos(conSubida);
comprobar(
  subido[0]?.importe === 63250,
  'tras una subida se presupuesta el precio nuevo, no la mediana de todo',
  formatear(subido[0]?.importe ?? 0),
);

// --- lo que no es un compromiso --------------------------------------------

const sueltos = detectarCompromisos([
  mov('2025-01-11', 'Cosmetica del sur Pago con tarjeta', '-40.00'),
  mov('2025-02-11', 'Cosmetica del sur Pago con tarjeta', '-40.00'),
]);
comprobar(sueltos.length === 0, 'dos cargos no bastan para declarar un compromiso');

const irregular = detectarCompromisos([
  mov('2025-01-20', 'Pago de impuestos Nrc. 11a', '-342.00'),
  mov('2025-02-20', 'Pago de impuestos Nrc. 22b', '-79.00'),
  mov('2025-07-20', 'Pago de impuestos Nrc. 33c', '-342.00'),
  mov('2025-12-20', 'Pago de impuestos Nrc. 44d', '-121.00'),
]);
comprobar(
  irregular[0]?.cadencia === 'irregular',
  'unos impuestos a trompicones se declaran irregulares en vez de forzarles una cadencia',
  irregular[0]?.cadencia,
);
comprobar(
  costeMensual(irregular[0]) === 0,
  'y no aportan coste mensual: lo recogerá el gasto variable',
);
comprobar(proximoCargo(irregular[0], '2026-01') === null, 'un irregular no tiene próximo cargo');

const soloIngresos = detectarCompromisos([
  ...mensual('2025-01-01', 6, 'Transferencia recibida ALQUILER PISO', '600.00'),
]);
comprobar(soloIngresos.length === 0, 'un ingreso regular no es un compromiso: sólo se miran cargos');

const traspasos = detectarCompromisos(
  mensual('2025-01-01', 6, 'Traspaso a mi cuenta de ahorro', '-300.00').map((m) => ({
    ...m,
    categoria: 'Traspaso entre cuentas propias',
  })),
);
comprobar(traspasos.length === 0, 'un traspaso a otra cuenta propia no es coste de estructura');

// --- fechas -----------------------------------------------------------------

const finDeMes = detectarCompromisos(
  mensual('2025-01-31', 6, 'Adeudo de cuota de la seguridad social', '-268.40'),
);
comprobar(
  proximoCargo(finDeMes[0], '2025-06') === '2025-07-31',
  'el siguiente cargo de un mensual cae un mes después del último',
  proximoCargo(finDeMes[0], '2025-06'),
);

const dia31 = detectarCompromisos([
  mov('2025-01-31', 'Adeudo de cuota mensual', '-100.00'),
  mov('2025-03-31', 'Adeudo de cuota mensual', '-100.00'),
  mov('2025-05-31', 'Adeudo de cuota mensual', '-100.00'),
  mov('2025-07-31', 'Adeudo de cuota mensual', '-100.00'),
]);
comprobar(
  proximoCargo(dia31[0], '2025-08') === '2025-09-30',
  'un recibo del 31 no vence el «31 de septiembre»',
  proximoCargo(dia31[0], '2025-08'),
);

// --- contra el extracto sintético completo ---------------------------------

const sintetico = extractoSintetico();
const delNegocio = detectarCompromisos(sintetico);
const enPie = vigentes(delNegocio);

comprobar(enPie.length >= 6, 'el negocio sintético tiene al menos seis compromisos vivos', enPie.length);
comprobar(
  cesados(delNegocio).length >= 1,
  'y al menos uno que se paró (la nómina, la luz)',
  cesados(delNegocio).map((c) => c.huella),
);
comprobar(
  enPie.every((c) => c.importe > 0),
  'todos los compromisos se presupuestan en positivo, aunque sean cargos',
);
comprobar(
  enPie.reduce((acc, c) => acc + costeMensual(c), 0) > 100000,
  'la estructura mensual del negocio pasa de mil euros',
  formatear(enPie.reduce((acc, c) => acc + costeMensual(c), 0)),
);

console.log(fallos === 0 ? '\n✅ recurrencia: todo en verde' : `\n❌ recurrencia: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
