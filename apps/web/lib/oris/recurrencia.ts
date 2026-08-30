/**
 * Lo que se repite: alquiler, nómina, cuota de autónomos, préstamo, seguros.
 *
 * Es el módulo que separa un panel doméstico de uno de pyme. En una cuenta
 * personal el gasto es el gasto; en un negocio hay dos gastos distintos y no se
 * leen igual:
 *
 *   - **La estructura.** Se paga el mes que facturas cuatro mil y el mes que
 *     facturas mil. No depende de que abras la puerta. Es lo que hay que cubrir
 *     antes de empezar a ganar, y —esto es lo importante— **es previsible**:
 *     un alquiler que lleva veinticinco meses cargándose el día 4 se va a cargar
 *     el mes que viene el día 4.
 *   - **Lo variable.** Proveedores, reposición, una máquina. Sube y baja con la
 *     actividad y sólo se puede estimar por su media.
 *
 * Aquí no hay una lista de categorías que diga cuál es cuál. **La estructura se
 * detecta por su comportamiento**: un cargo es un compromiso si aparece con
 * cadencia estable, no porque su categoría se llame «Alquiler». Se decidió así
 * por tres motivos: funciona sin que nadie haya categorizado nada, no depende
 * de que el catálogo de categorías conozca el sector, y no se equivoca cuando
 * el titular usa una categoría para dos cosas distintas.
 *
 * Y una consecuencia que resultó ser lo más útil del módulo: **detecta también
 * lo que ha dejado de pasar**. Un compromiso que llevaba veinte meses y hace
 * cinco que no aparece no se proyecta —sería inventar una factura— y se enseña
 * aparte, porque «desde marzo no pagas nómina» es un hecho del negocio que
 * ningún total mensual cuenta.
 *
 * Sólo cargos. Un compromiso es algo a lo que te has obligado; el dinero que
 * entra de un cliente no lo es, por regular que parezca.
 */

import type { MovimientoVista } from './agregados';
import { CATEGORIA_TRASPASO } from './contratos';
import { raizConcepto } from './detalle';
import { aCentimos, mesDe, mesesEntre, sumarMeses, type Centimos } from './dinero';

/** Cada cuánto se repite. `irregular` = se repite, pero sin patrón fiable. */
export type Cadencia = 'mensual' | 'bimestral' | 'trimestral' | 'irregular';

/** Meses entre dos cargos de cada cadencia. `irregular` no tiene. */
const PASO: Record<Exclude<Cadencia, 'irregular'>, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
};

export interface Compromiso {
  /** Clave de agrupación y a la vez etiqueta legible: «Alquiler Mes De». */
  huella: string;
  cadencia: Cadencia;
  /**
   * Lo que costará la próxima vez que venza, en céntimos positivos.
   *
   * Dos decisiones dentro de esta cifra:
   *
   * **Es el total del periodo, no el de un cargo.** Booksy cobra su comisión
   * cuatro veces al mes; presupuestar 26 € en vez de 105 € dejaría fuera casi
   * ochenta euros mensuales sin que nada lo delatara. Se suma lo del mes y
   * luego se comparan meses con meses.
   *
   * **Es la mediana de los tres últimos periodos, no la de todo el histórico.**
   * Un alquiler que subió de 612 a 629,75 € lleva veinte meses a 612 y cinco a
   * 629,75: la mediana de todo diría 612 y presupuestaría de menos cada mes. Lo
   * que interesa de un compromiso no es lo que costó, es lo que cuesta.
   */
  importe: Centimos;
  /** Distancia entre el mayor y el menor de los tres últimos periodos. Cero = fijo. */
  oscilacion: Centimos;
  /** Día del mes en que suele cargarse, 1–31. Mediana de todos los cargos. */
  dia: number;
  /** Cuántos cargos lo componen. Puede haber varios en el mismo mes. */
  cargos: number;
  /** En cuántos meses distintos ha aparecido. Es lo que mide la cadencia. */
  meses: number;
  /** Meses en los que debería haber aparecido, según su cadencia. */
  esperados: number;
  /** `meses / esperados`, acotado a 1. Cuánto se puede confiar en la cadencia. */
  confianza: number;
  /** Mes del primer cargo, «2024-08». */
  desde: string;
  /** Mes del último cargo. */
  hasta: string;
  /**
   * Si sigue en pie. Falso cuando lleva más de un periodo sin aparecer: un
   * contrato cancelado no se presupuesta.
   */
  vivo: boolean;
  /** Los cargos que lo forman, por si hay que enseñarlos. Del más reciente. */
  movimientos: readonly MovimientoVista[];
}

const MES_TEXTO =
  /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/g;

/**
 * La clave por la que se agrupan los cargos de un mismo compromiso.
 *
 * Se apoya en `raizConcepto`, que ya sabe tirar prefijos del banco y
 * referencias, y le añade lo único que aquí estorba: **el nombre del mes**.
 * «Alquiler mes de agosto» y «Alquiler mes de septiembre» son el mismo
 * alquiler, y sin quitar el mes serían veinticinco compromisos de un cargo
 * cada uno — es decir, ninguno.
 *
 * Cuatro palabras y no dos: con dos, «Adeudo de cuota de la seguridad social» y
 * «Adeudo de cuota de la comunidad» colapsan en el mismo grupo y sus importes
 * se mezclan.
 */
export function huellaCompromiso(concepto: string): string {
  const sinMeses = concepto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(MES_TEXTO, ' ');
  return raizConcepto(sinMeses, 4);
}

/** Mediana de una lista no vacía. Con par de elementos, el menor de los dos centrales. */
function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor((ordenados.length - 1) / 2)];
}

export interface OpcionesDeteccion {
  /** Mínimo de cargos para plantearse que algo es un compromiso. */
  minimoCargos?: number;
  /** Confianza mínima para no declararlo irregular, 0–1. */
  minimaConfianza?: number;
  /**
   * El mes contra el que se decide si un compromiso sigue vivo. Por defecto,
   * el del movimiento más reciente — nunca el reloj: si los datos acaban en
   * mayo y hoy es agosto, medir contra hoy mataría todos los compromisos vivos
   * de golpe. Es la misma decisión que toma `rango.anclaje`.
   */
  ancla?: string;
}

/**
 * Los compromisos que hay en estos movimientos, de mayor a menor coste mensual.
 *
 * El orden es por lo que pesan al mes —un trimestral de 342 € pesa 114— porque
 * la pregunta que contesta esta lista es «qué me cuesta tener abierto», y para
 * eso un cargo grande cada tres meses no es más grave que uno mediano todos los
 * meses.
 */
export function detectarCompromisos(
  movimientos: readonly MovimientoVista[],
  opciones: OpcionesDeteccion = {},
): Compromiso[] {
  const { minimoCargos = 3, minimaConfianza = 0.6 } = opciones;

  const grupos = new Map<string, MovimientoVista[]>();

  // El ancla sale de TODOS los movimientos, no sólo de los cargos: si el último
  // mes cargado sólo trajo cobros, anclar en el último cargo adelantaría el
  // ancla un mes y daría por muerto un compromiso que sencillamente aún no ha
  // vencido.
  let ultimoMes = opciones.ancla ?? '';
  if (!opciones.ancla) {
    for (const m of movimientos) {
      const mes = mesDe(m.fecha);
      if (mes > ultimoMes) ultimoMes = mes;
    }
  }

  for (const m of movimientos) {
    const c = aCentimos(m.importe);
    if (c === null || c >= 0) continue;
    // Un traspaso a tu otra cuenta puede ser mensual y regularísimo, y no es un
    // gasto: contarlo como estructura inflaría el coste de tener abierto.
    if (m.categoria === CATEGORIA_TRASPASO) continue;

    const huella = huellaCompromiso(m.concepto);
    if (!huella) continue;

    const previo = grupos.get(huella);
    if (previo) previo.push(m);
    else grupos.set(huella, [m]);
  }

  const compromisos: Compromiso[] = [];

  for (const [huella, cargos] of grupos) {
    if (cargos.length < minimoCargos) continue;

    const ordenados = [...cargos].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Un mismo compromiso puede traer varios cargos el mismo mes: una comisión
    // por reserva, una factura partida, un recargo. Se suma lo del mes **antes**
    // de mirar nada más, y a partir de aquí la unidad es el mes:
    //
    //   - la cadencia se mide entre meses, no entre cargos — si no, dos cargos
    //     en agosto darían un salto de cero y la mediana se iría a cero;
    //   - el importe presupuestado es el del mes entero, no el de un cargo.
    const porMes = new Map<string, Centimos>();
    for (const m of ordenados) {
      const mes = mesDe(m.fecha);
      porMes.set(mes, (porMes.get(mes) ?? 0) + Math.abs(aCentimos(m.importe) ?? 0));
    }

    const meses = [...porMes.keys()];
    if (meses.length < 2) continue;

    const saltos: number[] = [];
    for (let i = 1; i < meses.length; i++) saltos.push(mesesEntre(meses[i - 1], meses[i]));

    const paso = mediana(saltos);
    const cadencia = (Object.keys(PASO) as Exclude<Cadencia, 'irregular'>[]).find(
      (c) => PASO[c] === paso,
    );

    const desde = meses[0];
    const hasta = meses[meses.length - 1];
    const esperados = cadencia ? Math.floor(mesesEntre(desde, hasta) / paso) + 1 : meses.length;
    const confianza = esperados > 0 ? Math.min(1, meses.length / esperados) : 0;

    const recientes = meses.slice(-3).map((m) => porMes.get(m) ?? 0);

    compromisos.push({
      huella,
      cadencia: cadencia && confianza >= minimaConfianza ? cadencia : 'irregular',
      importe: mediana(recientes),
      oscilacion: Math.max(...recientes) - Math.min(...recientes),
      dia: mediana(ordenados.map((m) => Number(m.fecha.slice(8, 10)))),
      cargos: ordenados.length,
      meses: meses.length,
      esperados,
      confianza,
      desde,
      hasta,
      // Un periodo de gracia y no más: con dos, un alquiler cancelado en enero
      // seguiría presupuestándose en marzo. Con cero, un cargo que se retrasa
      // un día y cae en el mes siguiente mataría el compromiso.
      vivo: cadencia ? mesesEntre(hasta, ultimoMes) <= paso : false,
      movimientos: [...ordenados].reverse(),
    });
  }

  return compromisos.sort((a, b) => costeMensual(b) - costeMensual(a));
}

/** Lo que cuesta al mes, repartiendo los trimestrales. Para ordenar y sumar. */
export function costeMensual(c: Compromiso): Centimos {
  if (c.cadencia === 'irregular') return 0;
  return Math.round(c.importe / PASO[c.cadencia]);
}

/** Los que se van a volver a cobrar: cadencia estable y todavía en pie. */
export function vigentes(compromisos: readonly Compromiso[]): Compromiso[] {
  return compromisos.filter((c) => c.cadencia !== 'irregular' && c.vivo);
}

/**
 * Los que se pararon: tenían cadencia y hace más de un periodo que no aparecen.
 *
 * Se enseñan porque son noticias. «Desde marzo no hay nómina» o «el seguro dejó
 * de cargarse en junio» son cambios del negocio que ningún total mensual dice:
 * el gasto simplemente bajó, y bajar parece bueno hasta que resulta que era un
 * recibo devuelto.
 */
export function cesados(compromisos: readonly Compromiso[]): Compromiso[] {
  return compromisos.filter((c) => c.cadencia !== 'irregular' && !c.vivo);
}

/**
 * ¿Toca este compromiso en este mes? Se cuenta desde su último cargo real.
 *
 * **Un compromiso cesado nunca cae.** Podría bastar con que quien llame filtre
 * antes por `vigentes`, y así lo hace la previsión — pero un `caeEn` que dice
 * que sí a un recibo cancelado es una trampa esperando a que alguien pase la
 * lista entera. Y el fallo no daría error: presupuestaría una nómina que hace
 * cinco meses que no se paga, y la previsión saldría creíble y baja.
 */
export function caeEn(c: Compromiso, mes: string): boolean {
  if (c.cadencia === 'irregular' || !c.vivo) return false;
  const distancia = mesesEntre(c.hasta, mes);
  return distancia > 0 && distancia % PASO[c.cadencia] === 0;
}

/** La fecha aproximada del próximo cargo: «2026-09-04». */
export function proximoCargo(c: Compromiso, desde: string): string | null {
  if (c.cadencia === 'irregular') return null;
  const paso = PASO[c.cadencia];
  const pendiente = mesesEntre(c.hasta, desde);
  // Si en el mes de referencia ya se cobró, el siguiente es un periodo después.
  const saltos = pendiente <= 0 ? paso : Math.ceil(pendiente / paso) * paso;
  const mes = sumarMeses(c.hasta, saltos === 0 ? paso : saltos);
  // El día se recorta al último del mes: un recibo que suele caer el 31 no
  // vence el «31 de septiembre», y una fecha imposible se pinta en blanco.
  const [anio, m] = mes.split('-').map(Number);
  const dia = Math.min(c.dia, new Date(Date.UTC(anio, m, 0)).getUTCDate());
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

/** Suma de lo comprometido que vence en un mes concreto. Céntimos positivos. */
export function comprometidoEn(compromisos: readonly Compromiso[], mes: string): Centimos {
  let total = 0;
  for (const c of compromisos) if (caeEn(c, mes)) total += c.importe;
  return total;
}

/**
 * Las huellas que pertenecen a un compromiso vigente.
 *
 * Sirve para partir el gasto real de un mes en estructura y variable sin volver
 * a agrupar: quien ya tiene el conjunto sólo pregunta por la huella de cada
 * cargo. Los cesados entran también — el mes en que se pagó la nómina, la
 * nómina era estructura, y sacarla porque hoy ya no se paga reescribiría el
 * pasado.
 */
export function huellasEstructurales(compromisos: readonly Compromiso[]): Set<string> {
  return new Set(compromisos.filter((c) => c.cadencia !== 'irregular').map((c) => c.huella));
}
