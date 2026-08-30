/**
 * Las herramientas del copiloto.
 *
 * La decisión que gobierna este archivo: **el modelo no calcula dinero**. Cada
 * herramienta llama a las mismas funciones puras que pinta el panel
 * —`resumirMes`, `desglosarGasto`, `serieMensual`, `mayores`— y devuelve el
 * resultado ya calculado y ya formateado. El modelo elige qué preguntar y
 * redacta la respuesta; las cifras las pone el código.
 *
 * Sin esa separación, el copiloto sumaría noventa importes en su cabeza y daría
 * un total que no coincide con el de la pantalla de al lado. Un panel y un chat
 * que dicen números distintos sobre el mismo mes no es un fallo estético: hace
 * inservibles a los dos, porque ya no se sabe cuál mentía.
 *
 * Nada de SQL generado por el modelo, y nada de RAG sobre los movimientos. Los
 * datos se leen una vez por petición y todas las herramientas trabajan sobre esa
 * misma foto en memoria: una consulta, un instante, y dos preguntas seguidas no
 * pueden contestar sobre estados distintos de la base de datos.
 *
 * Los importes viajan dos veces —`centimos` para operar y `texto` para citar—
 * porque pedirle al modelo que formatee «-4210» como «−42,10 €» es pedirle una
 * operación aritmética que no tiene por qué salir bien.
 */

import type Anthropic from '@anthropic-ai/sdk';

import {
  SIN_CATEGORIZAR,
  desglosarGasto,
  mesesDisponibles,
  pendientesDeRevision,
  resumirMes,
  type MovimientoVista,
} from './agregados';
import { formatear, mesDe, nombreMes, type Centimos } from './dinero';
import { cobertura, ingresosPorOrigen, mayores, traspasosDelMes } from './detalle';
import { anclaje, bancosDe, origen, sinBanco } from './rango';
import { proyectar, serieMensual } from './series';

/** Un importe, listo para operar y listo para citar. */
interface Dinero {
  centimos: Centimos;
  texto: string;
}

function dinero(centimos: Centimos, signo = false): Dinero {
  return { centimos, texto: formatear(centimos, { signo }) };
}

/**
 * Cuántos movimientos devuelve como mucho una búsqueda.
 *
 * No es una limitación técnica: es que doscientas líneas de extracto dentro de
 * una respuesta empujan fuera del contexto lo que se preguntó. Cuando se
 * recorta se dice, para que el modelo no afirme «son estos» sobre una lista
 * incompleta.
 */
const TOPE_BUSQUEDA = 40;

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: 'estado_datos',
    description:
      'Qué información hay cargada: meses disponibles, bancos, cuántos movimientos, ' +
      'y cuántos están sin categorizar. Úsala antes de nada cuando no sepas si hay ' +
      'datos suficientes para contestar, o cuando pregunten «qué tienes».',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'resumen_mes',
    description:
      'Ingresos, gastos, neto y traspasos de un mes. Los traspasos entre cuentas propias ' +
      'no cuentan como ingreso ni como gasto.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Formato «2026-05».' } },
      required: ['mes'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'gasto_por_categoria',
    description:
      'Reparto del gasto por categoría, de mayor a menor. Con `mes` en null, todo el histórico.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: ['string', 'null'], description: '«2026-05», o null para todo.' } },
      required: ['mes'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'ingresos_por_origen',
    description:
      'De dónde viene el dinero que entra en un mes, agrupado por el nombre que aparece en ' +
      'el concepto del banco. Es una agrupación aproximada: sirve para leer, no para contabilizar.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Formato «2026-05».' } },
      required: ['mes'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'movimientos_mayores',
    description: 'Los movimientos más grandes de un mes, de un signo u otro.',
    input_schema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'Formato «2026-05».' },
        tipo: { type: 'string', enum: ['ingreso', 'gasto'] },
        cuantos: { type: 'integer', description: 'Entre 1 y 20.' },
      },
      required: ['mes', 'tipo', 'cuantos'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'traspasos_mes',
    description:
      'Los traspasos entre cuentas propias de un mes, separados por sentido. Sirve para ' +
      'explicar por qué no cuentan como ingreso ni como gasto.',
    input_schema: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'Formato «2026-05».' } },
      required: ['mes'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'serie_y_prevision',
    description:
      'La evolución mes a mes (ingresos, gastos, neto y acumulado) y la proyección al ritmo ' +
      'de los últimos meses. La proyección es una recta: no sabe de pagas extra ni de meses caros.',
    input_schema: {
      type: 'object',
      properties: {
        meses_proyectados: { type: 'integer', description: 'Entre 0 y 12. Cero no proyecta.' },
      },
      required: ['meses_proyectados'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'buscar_movimientos',
    description:
      'Busca movimientos por texto del concepto, rango de fechas o de importe. Cualquier ' +
      'filtro puede ir en null. Devuelve como mucho ' + TOPE_BUSQUEDA + ' y avisa si recorta.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: ['string', 'null'], description: 'Parte del concepto. Sin distinguir mayúsculas ni tildes.' },
        desde: { type: ['string', 'null'], description: 'Fecha «2026-01-01» incluida.' },
        hasta: { type: ['string', 'null'], description: 'Fecha «2026-03-31» incluida.' },
        categoria: { type: ['string', 'null'], description: 'Nombre exacto de categoría.' },
        importe_minimo: { type: ['number', 'null'], description: 'En euros, sobre el valor absoluto.' },
      },
      required: ['texto', 'desde', 'hasta', 'categoria', 'importe_minimo'],
      additionalProperties: false,
    },
    strict: true,
  },
];

export class ErrorHerramienta extends Error {}

/**
 * Ejecuta una herramienta sobre la foto de datos de esta petición.
 *
 * Devuelve siempre algo serializable. Los errores de argumentos se devuelven
 * como resultado y no como excepción: el modelo puede corregir el mes y volver
 * a preguntar, mientras que una excepción cortaría la conversación entera por
 * una fecha mal escrita.
 */
export function ejecutar(
  nombre: string,
  entrada: unknown,
  datos: readonly MovimientoVista[],
): unknown {
  const args = (entrada ?? {}) as Record<string, unknown>;

  switch (nombre) {
    case 'estado_datos':
      return estadoDatos(datos);

    case 'resumen_mes': {
      const mes = exigirMes(args.mes);
      if (typeof mes !== 'string') return mes;
      const r = resumirMes(datos, mes);
      return {
        mes,
        mes_en_palabras: nombreMes(mes),
        ingresos: dinero(r.ingresos),
        gastos: dinero(r.gastos),
        neto: dinero(r.neto, true),
        traspasos: dinero(r.traspasos),
        movimientos: r.movimientos,
        nota: 'Los traspasos no están sumados ni en ingresos ni en gastos.',
      };
    }

    case 'gasto_por_categoria': {
      const mes = args.mes == null ? undefined : String(args.mes);
      if (mes !== undefined && !esMes(mes)) return { error: 'El mes va como «2026-05».' };
      const lineas = desglosarGasto(datos, mes);
      return {
        mes: mes ?? 'todo el histórico',
        total: dinero(lineas.reduce((a, l) => a + l.total, 0)),
        categorias: lineas.map((l) => ({
          categoria: l.categoria,
          total: dinero(l.total),
          porcentaje: Math.round(l.proporcion * 100),
          movimientos: l.movimientos,
          puestas_por_el_modelo: l.porIA,
        })),
      };
    }

    case 'ingresos_por_origen': {
      const mes = exigirMes(args.mes);
      if (typeof mes !== 'string') return mes;
      return {
        mes,
        origenes: ingresosPorOrigen(datos, mes).map((l) => ({
          origen: l.clave,
          total: dinero(l.total),
          porcentaje: Math.round(l.proporcion * 100),
          movimientos: l.movimientos,
        })),
        nota: 'Los nombres salen del concepto del banco y son aproximados.',
      };
    }

    case 'movimientos_mayores': {
      const mes = exigirMes(args.mes);
      if (typeof mes !== 'string') return mes;
      const tipo = args.tipo === 'ingreso' ? 'ingreso' : 'gasto';
      const cuantos = acotar(args.cuantos, 1, 20, 5);
      return {
        mes,
        tipo,
        movimientos: mayores(datos, mes, tipo, cuantos).map(resumirMovimiento),
      };
    }

    case 'traspasos_mes': {
      const mes = exigirMes(args.mes);
      if (typeof mes !== 'string') return mes;
      const t = traspasosDelMes(datos, mes);
      return {
        mes,
        entradas: dinero(t.entradas),
        salidas: dinero(t.salidas),
        descuadre: dinero(t.entradas - t.salidas, true),
        movimientos: t.lista.map(resumirMovimiento),
        nota:
          'Mover dinero de una cuenta propia a otra no es ingreso ni gasto. Si entradas y ' +
          'salidas no cuadran, lo normal es que la otra cuenta no esté cargada.',
      };
    }

    case 'serie_y_prevision': {
      const meses = acotar(args.meses_proyectados, 0, 12, 4);
      const serie = serieMensual(datos);
      const p = meses > 0 ? proyectar(serie, meses) : null;
      return {
        serie: serie.map((s) => ({
          mes: s.mes,
          ingresos: dinero(s.ingresos),
          gastos: dinero(s.gastos),
          neto: dinero(s.neto, true),
          acumulado: dinero(s.acumulado, true),
          movimientos: s.movimientos,
        })),
        prevision: p
          ? {
              ritmo_mensual: dinero(p.ritmo, true),
              meses_promediados: p.base,
              puntos: p.puntos.map((q) => ({ mes: q.mes, acumulado: dinero(q.acumulado, true) })),
              nota:
                'Es la media de los últimos meses prolongada en línea recta. Contesta a «si ' +
                'nada cambia» y a nada más.',
            }
          : null,
        nota_acumulado:
          'El acumulado es variación, no saldo: no sabemos con cuánto empezó la cuenta.',
      };
    }

    case 'buscar_movimientos':
      return buscar(datos, args);

    default:
      return { error: `No existe ninguna herramienta llamada «${nombre}».` };
  }
}

function estadoDatos(datos: readonly MovimientoVista[]) {
  const meses = mesesDisponibles(datos);
  const pendientes = pendientesDeRevision(datos);
  const desde = origen(datos);
  const hasta = anclaje(datos);

  return {
    movimientos: datos.length,
    meses_disponibles: meses,
    desde: desde ? nombreMes(desde) : null,
    hasta: hasta ? nombreMes(hasta) : null,
    bancos: bancosDe(datos),
    movimientos_sin_banco: sinBanco(datos),
    sin_categorizar_o_puestos_por_el_modelo: pendientes,
    cobertura_ultimo_mes: hasta ? cobertura(datos, hasta) : null,
    aviso:
      pendientes > 0
        ? `Hay ${pendientes} movimientos sin revisar. Los totales son correctos; el reparto ` +
          'por categoría puede moverse.'
        : null,
  };
}

function resumirMovimiento(m: MovimientoVista) {
  const centimos = aCentimosSeguro(m.importe);
  return {
    fecha: m.fecha,
    concepto: m.concepto,
    importe: dinero(centimos, true),
    categoria: m.categoria ?? SIN_CATEGORIZAR,
    banco: m.banco ?? null,
  };
}

function buscar(datos: readonly MovimientoVista[], args: Record<string, unknown>) {
  const texto = args.texto == null ? null : normalizar(String(args.texto));
  const desde = args.desde == null ? null : String(args.desde);
  const hasta = args.hasta == null ? null : String(args.hasta);
  const categoria = args.categoria == null ? null : String(args.categoria);
  const minimo =
    args.importe_minimo == null ? null : Math.round(Math.abs(Number(args.importe_minimo)) * 100);

  const encontrados = datos.filter((m) => {
    if (desde && m.fecha < desde) return false;
    if (hasta && m.fecha > hasta) return false;
    if (categoria && (m.categoria ?? SIN_CATEGORIZAR) !== categoria) return false;
    if (texto && !normalizar(m.concepto).includes(texto)) return false;
    if (minimo !== null && Math.abs(aCentimosSeguro(m.importe)) < minimo) return false;
    return true;
  });

  const suma = encontrados.reduce((a, m) => a + aCentimosSeguro(m.importe), 0);

  return {
    encontrados: encontrados.length,
    // La suma es de TODO lo encontrado, no de lo que se enseña: si sólo sumara
    // los cuarenta mostrados, el total sería menor que el real sin decirlo.
    suma_de_todo_lo_encontrado: dinero(suma, true),
    recortado: encontrados.length > TOPE_BUSQUEDA,
    movimientos: encontrados.slice(0, TOPE_BUSQUEDA).map(resumirMovimiento),
  };
}

// --- utilidades ------------------------------------------------------------

function esMes(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Devuelve el mes válido, o el objeto de error que se le entrega al modelo. */
function exigirMes(v: unknown): string | { error: string } {
  const mes = typeof v === 'string' ? v.trim() : '';
  if (!esMes(mes)) return { error: 'El mes tiene que ir como «2026-05».' };
  return mes;
}

function acotar(v: unknown, min: number, max: number, porDefecto: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Céntimos de un importe que ya pasó por la ingesta.
 *
 * Cero si no se puede leer, y eso es aceptable **sólo aquí**: estos importes ya
 * fueron validados al entrar en la base de datos, así que un valor ilegible
 * sería un dato corrupto, no una entrada del usuario. Los totales del panel
 * salen de `aCentimos`, que sí distingue el cero del error.
 */
function aCentimosSeguro(importe: string): Centimos {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(importe.trim());
  if (!m) return 0;
  const [, signo, entero, dec = '0'] = m;
  const c = Number(entero) * 100 + Number(dec.padEnd(2, '0'));
  return signo === '-' ? -c : c;
}

/** El mes más reciente con datos, para que el copiloto sepa qué es «este mes». */
export function mesMasReciente(datos: readonly MovimientoVista[]): string | null {
  return datos.length > 0 ? mesDe(datos.reduce((a, m) => (m.fecha > a.fecha ? m : a)).fecha) : null;
}
