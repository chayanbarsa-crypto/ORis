/**
 * La previsión de tesorería: cuánto va a quedar en la cuenta, mes a mes.
 *
 * `series.proyectar` prolonga una recta y lo dice. Sirve para «si nada cambia,
 * ¿hacia dónde voy?». Para una pyme se queda corta por dos motivos que no son
 * matices:
 *
 * **1. Lo que sale no es una media, es una lista.** El alquiler del mes que
 * viene no se estima: se sabe. La cuota de autónomos, el préstamo, el renting,
 * la gestoría — todo eso ya está firmado. Una recta que promedia el gasto total
 * reparte a partes iguales lo que en realidad cae en fechas concretas, y
 * convierte un mes con vencimiento trimestral en un mes normal. Aquí las
 * salidas comprometidas se toman de `recurrencia.ts` una por una, y sólo lo que
 * no es compromiso se estima por su media.
 *
 * **2. Los ingresos tienen estación.** En el negocio de referencia —un salón de
 * estética con dos años de histórico— abril factura el doble que septiembre.
 * Prolongar la media de los últimos tres meses en agosto predice un otoño que
 * no va a pasar. Con dos ciclos completos se puede medir cuánto pesa cada mes
 * del año y corregir por ello.
 *
 * Y una tercera cosa, que es la que hace que la previsión se pueda enseñar sin
 * mentir: **no es un número, es una banda**. Prudente, esperado y bueno salen
 * de los cuartiles de lo que ya ha pasado, así que tienen un significado
 * comprobable: de cada cuatro meses vividos, uno fue peor que el prudente y uno
 * mejor que el bueno. La cifra que se toma para decidir es la prudente; las
 * otras dos están para saber cuánto margen hay.
 *
 * Lo que esta previsión sigue sin saber: que vas a subir precios, que se va una
 * empleada, que el casero sube el alquiler en enero. Nada de eso está en el
 * extracto. Contesta a «con lo firmado y lo que sueles facturar, ¿llego?», y a
 * nada más.
 */

import type { MovimientoVista } from './agregados';
import { mesDelAnio, sumarMeses, type Centimos } from './dinero';
import { serieMensual, tesoreria, type LecturaMes } from './pyme';
import { caeEn, comprometidoEn, vigentes, type Compromiso } from './recurrencia';

/** Cuánto pesa un mes del año frente al mes medio. 1 = un mes cualquiera. */
export interface FactorEstacional {
  /** 1–12. */
  mes: number;
  /** Facturación típica de ese mes dividida entre la del mes medio. */
  factor: number;
  /** Cuántos años lo respaldan. Menos de dos y no se usa. */
  observaciones: number;
}

/**
 * Tres cifras para una misma pregunta. Ver la cabecera.
 *
 * **`prudente` es siempre el que peor deja la caja**, no siempre el más
 * pequeño: en los ingresos es el cuartil bajo, y en los gastos el alto. Un
 * escenario prudente que se imagina facturando poco y gastando poco no es
 * prudente, es otro escenario medio con peor letra — y es el error que hace que
 * una previsión avise del mes malo justo cuando ya ha llegado.
 */
export interface Escenario {
  prudente: Centimos;
  esperado: Centimos;
  bueno: Centimos;
}

export interface MesPrevisto {
  mes: string;
  /** Lo que se espera facturar, en tres escenarios. */
  ingreso: Escenario;
  /** Lo ya firmado que vence este mes. Céntimos positivos y sin escenarios: no es una estimación. */
  comprometido: Centimos;
  /** El resto del gasto, estimado. Céntimos positivos. */
  variable: Escenario;
  /** comprometido + variable, en cada escenario. */
  gasto: Escenario;
  /** Saldo al cierre. `null` cuando no hay saldo de partida conocido. */
  saldo: Escenario | null;
  /** El factor aplicado, o `null` si no se corrigió por estación. */
  factor: number | null;
  /** Qué compromisos vencen este mes, para poder enseñarlos. */
  vencimientos: readonly Compromiso[];
}

export interface Prevision {
  /** Los meses proyectados, del más próximo en adelante. */
  meses: MesPrevisto[];
  /** El último mes con datos reales. La previsión empieza en el siguiente. */
  ancla: string;
  /** Saldo conocido del que parte. `null` si ningún extracto declara saldo. */
  saldoInicial: Centimos | null;
  /** Primer mes en que el escenario prudente deja la caja bajo cero. */
  mesEnRojo: string | null;
  /** Lo mismo en el escenario esperado: si sale, ya no es una hipótesis mala. */
  mesEnRojoEsperado: string | null;
  base: Base;
}

/** De qué está hecha la previsión. Se enseña: sin esto no se puede juzgar. */
export interface Base {
  /** Meses de histórico cargados. */
  historia: number;
  /** Meses completos usados para las medias. Ver `mesesCompletos`. */
  usados: number;
  /** Compromisos vigentes que alimentan las salidas. */
  compromisos: number;
  /** Si se ha corregido por estación, y por qué no cuando no. */
  estacional: boolean;
  /**
   * Qué parte del gasto histórico explican los compromisos, 0–1.
   *
   * Es la nota de fiabilidad de la previsión de salidas: con 0,8 el mes que
   * viene está casi escrito; con 0,2 la previsión es poco más que una media con
   * buena presentación.
   */
  gastoExplicado: number;
}

function media(valores: readonly number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Cuartil por interpolación lineal. `q` entre 0 y 1. */
function cuantil(valores: readonly number[], q: number): number {
  const o = [...valores].sort((a, b) => a - b);
  if (o.length === 1) return o[0];
  const pos = (o.length - 1) * q;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return Math.round(o[bajo] + (o[alto] - o[bajo]) * (pos - bajo));
}

/**
 * La banda de escenarios de una serie: su centro y cuánto se separa de él.
 *
 * **El centro es la media, y aquí sí.** El resto del proyecto usa medianas por
 * una razón buena —un mes raro no puede redefinir lo que es un mes normal—,
 * pero una previsión de tesorería no compara meses: los **suma**. Y para una
 * suma la mediana es el estimador equivocado en cuanto la distribución tiene
 * dos jorobas, que es exactamente lo que hace un impuesto trimestral: en el
 * negocio de referencia el gasto variable es 13 € en ocho meses y 1.800 € en
 * cuatro. Su mediana es 342 € y su media 694 €. Presupuestar la mediana seis
 * meses seguidos es presupuestar un semestre que no paga impuestos — dos mil
 * euros de menos, sin que nada en el gráfico lo delate.
 *
 * **La anchura es medio recorrido intercuartílico.** Se mide sobre lo que ya ha
 * pasado, así que la banda dice algo comprobable: la mitad de los meses vividos
 * cabe dentro. Y al construirse como centro ± anchura, los tres escenarios
 * salen siempre ordenados, cosa que los cuartiles a secas no garantizan cuando
 * un mes extremo se lleva la media fuera de la caja.
 */
function banda(valores: readonly number[]): { centro: number; anchura: number } {
  if (valores.length === 0) return { centro: 0, anchura: 0 };
  return {
    centro: media(valores),
    anchura: (cuantil(valores, 0.75) - cuantil(valores, 0.25)) / 2,
  };
}

/**
 * Los meses de la serie que se pueden promediar.
 *
 * **Se descartan el primero y el último.** Un extracto casi nunca empieza el
 * día 1 ni acaba el 31: el primer mes suele traer una semana y el último, si se
 * descargó a mitad de mes, otra. Leídos como meses enteros, los dos parecen
 * hundimientos —en el extracto de referencia, el primer mes trae nueve días y
 * factura 439 € frente a una media de 2.700— y arrastran hacia abajo tanto la
 * media como el factor de su mes del año.
 *
 * Sólo se recortan cuando sobra serie. Con cuatro meses, quitar dos dejaría la
 * previsión sin nada sobre lo que apoyarse, y una media de dos meses sesgada es
 * mejor que ninguna.
 */
export function mesesCompletos(serie: readonly LecturaMes[]): LecturaMes[] {
  return serie.length >= 6 ? serie.slice(1, -1) : [...serie];
}

/** Mínimo de meses del año con dos años observados para fiarse de la estación. */
const MINIMO_MESES_CON_CICLO = 8;

/** Anchura de la ventana que define «el nivel del negocio por esas fechas». */
const VENTANA_NIVEL = 12;

/**
 * Cuánto pesa cada mes del año.
 *
 * Devuelve la lista vacía cuando no hay con qué: hacen falta **dos
 * observaciones de la mayoría de los meses**, o sea dos ciclos. Con trece meses
 * sólo enero tendría dos, y corregir enero dejando los otros once a 1 no es
 * media corrección — es un escalón artificial en un solo mes del gráfico.
 *
 * Cada mes se compara con **el nivel del negocio por esas fechas** —la media de
 * los doce meses centrados en él— y no con la media de todo el histórico. Así
 * un negocio que ha crecido no confunde crecimiento con estación: sin esto, en
 * una serie al alza los meses del segundo año salen todos «fuertes» y los del
 * primero todos «flojos», que es una tendencia disfrazada de estacionalidad.
 *
 * Y el índice de cada mes es la **media** de sus años, no la mediana. Es la
 * única media de este módulo y tiene motivo: con dos ciclos, la mediana de dos
 * valores es uno de los dos. El índice quedaría clavado en una de las dos
 * observaciones, la otra se volvería «exactamente típica» y la banda de
 * escenarios se cerraría sobre sí misma — los tres escenarios darían la misma
 * cifra. Pasó, y no había nada en el gráfico que lo delatara.
 */
export function factoresEstacionales(serie: readonly LecturaMes[]): FactorEstacional[] {
  const completos = mesesCompletos(serie);
  if (completos.length < 12) return [];

  const ratios = new Map<number, number[]>();

  for (let i = 0; i < completos.length; i++) {
    // Doce meses centrados en el mes, y cuando no caben —en los extremos de la
    // serie— la ventana se desplaza en vez de encogerse. Una ventana corta en
    // los bordes cubriría medio año y compararía enero contra un invierno en
    // lugar de contra un año: el índice de los meses del borde saldría inflado
    // justo donde menos datos hay para desmentirlo.
    const ancho = Math.min(VENTANA_NIVEL, completos.length);
    const desde = Math.min(
      Math.max(0, i - Math.floor(ancho / 2) + 1),
      completos.length - ancho,
    );
    const ventana = completos.slice(desde, desde + ancho);
    const nivel = ventana.reduce((acc, l) => acc + l.facturacion, 0) / ventana.length;
    if (nivel <= 0) continue;

    const m = mesDelAnio(completos[i].mes);
    const previo = ratios.get(m);
    const ratio = completos[i].facturacion / nivel;
    if (previo) previo.push(ratio);
    else ratios.set(m, [ratio]);
  }

  const conCiclo = [...ratios.values()].filter((v) => v.length >= 2).length;
  if (conCiclo < MINIMO_MESES_CON_CICLO) return [];

  const crudos = [...ratios.entries()].map(([mes, valores]) => ({
    mes,
    // Un mes con un solo año observado se queda en 1: no se sabe si es que ese
    // mes es flojo o si aquel año lo fue.
    factor: valores.length >= 2 ? valores.reduce((a, b) => a + b, 0) / valores.length : 1,
    observaciones: valores.length,
  }));

  // Los índices se normalizan a media 1. Si no, un recorte de ventana que deje
  // fuera los meses buenos subiría todos los factores a la vez, y la corrección
  // dejaría de ser estacional para convertirse en un aumento general inventado.
  const media = crudos.reduce((acc, f) => acc + f.factor, 0) / crudos.length;
  if (media <= 0) return [];

  return crudos
    .map((f) => ({ ...f, factor: f.factor / media }))
    .sort((a, b) => a.mes - b.mes);
}

/** El factor de un mes concreto, o 1 si no hay estación medida. */
function factorDe(factores: readonly FactorEstacional[], mes: string): number {
  return factores.find((f) => f.mes === mesDelAnio(mes))?.factor ?? 1;
}

export interface OpcionesPrevision {
  /** Cuántos meses proyectar. */
  horizonte?: number;
  /** Cuántos meses de histórico alimentan las medias. */
  ventana?: number;
  /** Saldo de partida. Por defecto, el que declaren los extractos. */
  saldoInicial?: Centimos | null;
}

/**
 * La previsión completa.
 *
 * Devuelve `null` sin histórico: no hay nada que prolongar, y una previsión
 * partiendo de cero meses sería un gráfico inventado con aspecto de dato.
 */
export function prever(
  movimientos: readonly MovimientoVista[],
  compromisos: readonly Compromiso[],
  opciones: OpcionesPrevision = {},
): Prevision | null {
  const { horizonte = 6, ventana = 12 } = opciones;

  const serie = serieMensual(movimientos, compromisos);
  if (serie.length === 0) return null;

  const enPie = vigentes(compromisos);
  const factores = factoresEstacionales(serie);
  const completos = mesesCompletos(serie);
  const usados = completos.slice(-ventana);

  // Los ingresos se desestacionalizan antes de promediar. Sin esto, una ventana
  // de doce meses que acaba en septiembre pesa igual un septiembre flojo que un
  // abril fuerte, y la media resultante no describe ningún mes real.
  const desestacionalizados = usados.map((l) =>
    Math.round(l.facturacion / factorDe(factores, l.mes)),
  );
  const variables = usados.map((l) => l.variable);

  const ingresos = banda(desestacionalizados);
  const ingresoBase: Escenario = {
    prudente: Math.max(0, Math.round(ingresos.centro - ingresos.anchura)),
    esperado: Math.round(ingresos.centro),
    bueno: Math.round(ingresos.centro + ingresos.anchura),
  };

  // El gasto variable lleva la banda **al revés**: el escenario prudente es el
  // que más gasta. Un escenario prudente que se imagina facturando poco y
  // gastando poco no es prudente — es otro escenario medio, y avisa del mes
  // malo cuando ya ha llegado.
  //
  // Lo que no se hace es desestacionalizarlo: no se ha comprobado que tenga
  // estación, y aplicarle la de los ingresos sería suponer que se compra
  // material en proporción a lo que se factura ese mismo mes. A veces sí, y a
  // veces se compra el mes de antes.
  const gastos = banda(variables);
  const variableBase: Escenario = {
    prudente: Math.round(gastos.centro + gastos.anchura),
    esperado: Math.round(gastos.centro),
    bueno: Math.max(0, Math.round(gastos.centro - gastos.anchura)),
  };

  const ancla = serie[serie.length - 1].mes;
  const saldoInicial =
    opciones.saldoInicial !== undefined ? opciones.saldoInicial : tesoreria(movimientos).total;

  const meses: MesPrevisto[] = [];
  let acumulado = saldoInicial === null ? null : { ...tripleta(saldoInicial) };

  for (let i = 1; i <= horizonte; i++) {
    const mes = sumarMeses(ancla, i);
    const factor = factores.length > 0 ? factorDe(factores, mes) : null;
    const escala = factor ?? 1;

    const ingreso: Escenario = {
      prudente: Math.round(ingresoBase.prudente * escala),
      esperado: Math.round(ingresoBase.esperado * escala),
      bueno: Math.round(ingresoBase.bueno * escala),
    };

    const vencimientos = enPie.filter((c) => caeEn(c, mes));
    const comprometido = comprometidoEn(enPie, mes);
    const gasto: Escenario = {
      prudente: comprometido + variableBase.prudente,
      esperado: comprometido + variableBase.esperado,
      bueno: comprometido + variableBase.bueno,
    };

    if (acumulado) {
      acumulado = {
        prudente: acumulado.prudente + ingreso.prudente - gasto.prudente,
        esperado: acumulado.esperado + ingreso.esperado - gasto.esperado,
        bueno: acumulado.bueno + ingreso.bueno - gasto.bueno,
      };
    }

    meses.push({
      mes,
      ingreso,
      comprometido,
      variable: variableBase,
      gasto,
      saldo: acumulado ? { ...acumulado } : null,
      factor,
      vencimientos,
    });
  }

  const gastoHistorico = usados.reduce((acc, l) => acc + l.gasto, 0);
  const estructuraHistorica = usados.reduce((acc, l) => acc + l.estructura, 0);

  return {
    meses,
    ancla,
    saldoInicial,
    mesEnRojo: meses.find((m) => m.saldo !== null && m.saldo.prudente < 0)?.mes ?? null,
    mesEnRojoEsperado: meses.find((m) => m.saldo !== null && m.saldo.esperado < 0)?.mes ?? null,
    base: {
      historia: serie.length,
      usados: usados.length,
      compromisos: enPie.length,
      estacional: factores.length > 0,
      gastoExplicado: gastoHistorico > 0 ? estructuraHistorica / gastoHistorico : 0,
    },
  };
}

/** Los tres escenarios arrancando del mismo sitio. */
function tripleta(valor: Centimos): Escenario {
  return { prudente: valor, esperado: valor, bueno: valor };
}
