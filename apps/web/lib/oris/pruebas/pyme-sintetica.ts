/**
 * Un negocio de mentira con la forma de uno de verdad.
 *
 * El panel de control se diseñó leyendo el extracto real de un salón de
 * estética: veintiséis meses, 1.840 apuntes, la cadena de saldos cuadrando de
 * principio a fin. Ese extracto **no está en el repositorio y no va a estarlo**:
 * lleva nombres de clientas en los conceptos de los Bizum, el domicilio del
 * local y el IBAN del titular, y el historial de git es para siempre. Es la
 * misma regla que ya rige en `packages/core`.
 *
 * Así que lo que queda versionado es esto: un generador que reproduce **la
 * forma** —no los datos— de aquel extracto. Lo que se copió, porque es lo que
 * pone a prueba los módulos:
 *
 *   - un alquiler que sube a mitad del histórico, para que el compromiso tenga
 *     que presupuestar lo que cuesta y no lo que costó;
 *   - una nómina que se paga diecinueve meses y **se para**, para que la
 *     detección de compromisos cesados tenga a quién detectar;
 *   - una cuota de la seguridad social a fin de mes, que es el compromiso
 *     perfecto: mismo importe, mismo día, sin fallar uno;
 *   - una plataforma de reservas que cobra **varias veces al mes**, que fue el
 *     caso que destapó el error de presupuestar un cargo en vez del mes;
 *   - impuestos que caen a trompicones, para que haya algo que el detector
 *     tenga que declarar irregular en vez de forzarlo a una cadencia;
 *   - cobros de clientas con estacionalidad marcada —abril fuerte, septiembre
 *     flojo— y algún ingreso en efectivo que agrupa la caja de varios días,
 *     que es lo que rompe la media y obliga a la mediana.
 *
 * Es determinista: el mismo `semilla` da el mismo extracto siempre. Una prueba
 * que cambia de datos en cada ejecución no es una prueba, es una lotería.
 */

import type { MovimientoVista } from '../agregados';
import { mesesDe, sumarMeses } from '../dinero';

/**
 * Generador congruencial. No hace falta que sea bueno —no protege nada—, hace
 * falta que sea el mismo en cada ejecución y en cada máquina. `Math.random` no
 * cumple ni lo uno ni lo otro.
 */
function aleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

/** Cuánto pesa cada mes del año en este negocio. Índice 0 = enero. */
const ESTACION = [1.15, 1.05, 1.2, 1.45, 0.8, 0.75, 0.7, 1.15, 0.55, 1.0, 0.78, 1.05];

interface Recibo {
  concepto: string;
  /** Euros, positivo; se emite como cargo. */
  importe: number;
  dia: number;
  /** Cada cuántos meses. */
  cada: number;
  /** Desde qué mes de la serie empieza (0 = el primero). */
  desde?: number;
  /** Hasta qué mes deja de cargarse, exclusivo. */
  hasta?: number;
  /** Importe a partir de `sube`, para simular una revisión de precio. */
  subeEn?: number;
  subeA?: number;
  /** Cuántos cargos por periodo. La plataforma de reservas cobra por reserva. */
  vecesPorMes?: number;
}

const RECIBOS: readonly Recibo[] = [
  { concepto: 'Transferencia realizada ALQUILER MES DE {MES} LOCAL', importe: 610, dia: 4, cada: 1, subeEn: 19, subeA: 632.5 },
  { concepto: 'Transferencia realizada NOMINA {MES}', importe: 780, dia: 12, cada: 1, hasta: 19 },
  { concepto: 'Adeudo de cuota de la seguridad social', importe: 268.4, dia: 30, cada: 1 },
  { concepto: 'Cargo por amortizacion de prestamo/credito', importe: 96.2, dia: 7, cada: 1 },
  { concepto: 'Adeudo de asesoria, gestoria o consultoria', importe: 72.6, dia: 28, cada: 1 },
  { concepto: 'Cargo renting de equipo de estetica', importe: 172.4, dia: 6, cada: 1 },
  { concepto: 'Adeudo de comunidad de propietarios', importe: 18.5, dia: 10, cada: 1 },
  { concepto: 'Adeudo de compania electrica', importe: 71.3, dia: 15, cada: 1, hasta: 21 },
  { concepto: 'Adeudo de seguro del local', importe: 148.9, dia: 20, cada: 3 },
  { concepto: 'Www.reservas.example Pago con tarjeta', importe: 27.4, dia: 9, cada: 1, vecesPorMes: 4 },
];

export interface OpcionesSintetico {
  /** Primer mes, «2024-08». */
  desde?: string;
  /** Cuántos meses generar. */
  meses?: number;
  /** Saldo de partida en euros. */
  saldoInicial?: number;
  semilla?: number;
  /** Sin saldos declarados, para probar el camino en que el banco no los trae. */
  sinSaldo?: boolean;
}

/**
 * Un extracto sintético, ordenado del apunte más antiguo al más reciente y con
 * la cadena de saldos cuadrada — igual que llega uno de verdad.
 */
export function extractoSintetico(opciones: OpcionesSintetico = {}): MovimientoVista[] {
  const { desde = '2024-08', meses = 26, saldoInicial = 2400, semilla = 20260830 } = opciones;
  const azar = aleatorio(semilla);

  const listaMeses = mesesDe(desde, sumarMeses(desde, meses - 1));
  const apuntes: { fecha: string; concepto: string; centimos: number }[] = [];

  listaMeses.forEach((mes, indice) => {
    const [, mm] = mes.split('-').map(Number);
    const peso = ESTACION[mm - 1];

    for (const r of RECIBOS) {
      if (indice < (r.desde ?? 0)) continue;
      if (r.hasta !== undefined && indice >= r.hasta) continue;
      if ((indice - (r.desde ?? 0)) % r.cada !== 0) continue;

      const importe = r.subeEn !== undefined && indice >= r.subeEn ? (r.subeA ?? r.importe) : r.importe;
      const veces = r.vecesPorMes ?? 1;
      for (let k = 0; k < veces; k++) {
        // Los cargos repetidos del mismo mes se reparten por el calendario y
        // varían de importe: es lo que hace una comisión por reserva, y es lo
        // que obliga a sumar el mes antes de comparar meses.
        const dia = Math.min(28, r.dia + k * 6);
        const variacion = veces > 1 ? 0.55 + azar() * 0.9 : 1;
        apuntes.push({
          fecha: `${mes}-${String(dia).padStart(2, '0')}`,
          concepto: r.concepto.replace('{MES}', nombreDelMes(mm).toUpperCase()),
          centimos: -Math.round(importe * variacion * 100),
        });
      }
    }

    // Impuestos: trimestrales de verdad, más algún pago suelto a cuenta. La
    // mezcla es lo que impide que tengan cadencia estable, y es a propósito.
    if (mm === 1 || mm === 4 || mm === 7 || mm === 10) {
      apuntes.push({
        fecha: `${mes}-20`,
        concepto: `Pago de impuestos Nrc. ${Math.floor(azar() * 1e12)}xk${indice}`,
        centimos: -Math.round((280 + azar() * 260) * 100),
      });
    }
    if (azar() < 0.12) {
      apuntes.push({
        fecha: `${mes}-05`,
        concepto: `Pago de impuestos Nrc. ${Math.floor(azar() * 1e12)}zp${indice}`,
        centimos: -Math.round((70 + azar() * 60) * 100),
      });
    }

    // Reposición de material: unos meses sí y otros no, con importes dispares y
    // **cada vez de un proveedor distinto**. No es adorno: con tres nombres
    // fijos, la reposición acababa cayendo casi todos los meses y el detector la
    // declaraba compromiso. El gasto variable se quedaba en cero, la previsión
    // decía explicar el 100 % del gasto, y nada en la pantalla lo desmentía.
    const compras = Math.floor(azar() * 3);
    for (let k = 0; k < compras; k++) {
      apuntes.push({
        fecha: `${mes}-${String(6 + Math.floor(azar() * 20)).padStart(2, '0')}`,
        concepto: `${PROVEEDORES[Math.floor(azar() * PROVEEDORES.length)]} Pago con tarjeta`,
        centimos: -Math.round((40 + azar() * 260) * 100),
      });
    }

    // Cobros de clientas. El número de servicios sigue la estación; el precio,
    // no: lo que cambia con el mes es cuánta gente viene, no lo que cuesta una
    // manicura.
    const servicios = Math.round((52 + azar() * 14) * peso);
    let cobrado = 0;
    for (let k = 0; k < servicios; k++) {
      const precio = [9, 11, 15, 18, 20, 22, 24, 27, 33, 38, 45][Math.floor(azar() * 11)];
      cobrado += precio * 100;
      apuntes.push({
        fecha: `${mes}-${String(1 + Math.floor(azar() * 28)).padStart(2, '0')}`,
        concepto: `Bizum Recibido: ${['cejas', 'unas', 'manicura', 'pedicura', 'depilacion', 'sin concepto'][Math.floor(azar() * 6)]}`,
        centimos: precio * 100,
      });
    }

    // Un ingreso en efectivo de vez en cuando: agrupa la caja de varios días en
    // un solo apunte, y es el que rompe la media de los cobros.
    //
    // Va **en proporción a lo cobrado por Bizum ese mes**, no por un importe
    // suelto. Es la caja del negocio: en un mes flojo hay menos que ingresar. Un
    // efectivo plano dejaba la mitad de la facturación sin estación —y encima
    // con una varianza enorme—, así que el septiembre flojo del generador salía
    // casi igual que un mes normal. Es decir: una estacionalidad de mentira
    // dentro de los datos con los que se comprueba que la estacionalidad se
    // detecta bien.
    if (azar() < 0.85) {
      apuntes.push({
        fecha: `${mes}-${String(3 + Math.floor(azar() * 24)).padStart(2, '0')}`,
        concepto: 'Ingreso en efectivo oficina',
        centimos: Math.round(cobrado * (0.85 + azar() * 0.3)),
      });
    }
  });

  apuntes.sort((a, b) => a.fecha.localeCompare(b.fecha));

  let saldo = Math.round(saldoInicial * 100);
  return apuntes.map((a, i) => {
    saldo += a.centimos;
    return {
      id: `sint-${i}`,
      fecha: a.fecha,
      concepto: a.concepto,
      importe: (a.centimos / 100).toFixed(2),
      saldo: opciones.sinSaldo ? null : (saldo / 100).toFixed(2),
      posicion: i,
      categoria: null,
      origen: null,
      banco: 'Banco de pruebas',
      extractoId: 'sint',
    };
  });
}

/** Proveedores de reposición. Muchos y sueltos: ninguno llega a compromiso. */
const PROVEEDORES = [
  'Cosmetica del sur', 'Distribuciones bel', 'Material estetica norte',
  'Suministros aloe', 'Uñas y color', 'Depilex mayorista',
  'Bazar profesional', 'Textil spa levante',
];

const NOMBRES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function nombreDelMes(mes: number): string {
  return NOMBRES[mes - 1];
}
