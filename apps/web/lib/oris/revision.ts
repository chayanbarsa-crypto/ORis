/**
 * Lo que queda sin categorizar, agrupado para poder preguntarlo una sola vez.
 *
 * La idea de Jordy: en vez de una lista de movimientos sueltos esperando a que
 * alguien los etiquete, ORis pregunta. Pero preguntar apunte a apunte es
 * inviable — cuarenta preguntas para un mes es un formulario disfrazado de
 * conversación.
 *
 * Por eso se agrupa por **raíz del concepto**, la misma normalización que usa
 * el categorizador: siete visitas al mismo bar son un solo «¿qué es esto?», y
 * la respuesta arregla las siete. Con el extracto real de referencia, los 42
 * movimientos sin cubrir se reducen a unas 20 preguntas, y las cinco primeras
 * cubren más de la mitad del dinero pendiente.
 *
 * ## Lo que ORis sabe y lo que no
 *
 * Un extracto bancario da **fecha, concepto e importe**. No da la hora, no da
 * la dirección y no da el ticket. Así que la pregunta se escribe sólo con lo
 * que consta:
 *
 * - la fecha, con su día de la semana, que es lo que de verdad ayuda a recordar
 *   («un sábado» sitúa mejor que «17/05»);
 * - el texto tal cual lo imprimió el banco, sin normalizar, porque a veces
 *   lleva dentro la ciudad y quien lo lee la reconoce;
 * - cuántas veces se repite y cuánto suma en total, que es lo que convierte
 *   responder en algo que merece la pena.
 *
 * Inventar una hora o una ubicación haría la pregunta más bonita y la
 * respuesta menos fiable: quien recuerda mal por culpa de un dato falso
 * categoriza mal, y eso queda guardado como si fuera manual y cierto.
 */

import { SIN_CATEGORIZAR, type MovimientoVista } from './agregados';
import { normalizarConcepto } from './categorizar';
import { aCentimos, formatear, type Centimos } from './dinero';

export interface GrupoPendiente {
  /** Raíz normalizada. Es la clave del grupo y la base de la regla futura. */
  raiz: string;
  /** El concepto tal cual lo escribió el banco, del movimiento más reciente. */
  conceptoCrudo: string;
  /** Ids de todos los movimientos que caen aquí. */
  ids: string[];
  veces: number;
  /** Suma en céntimos. Negativo si son gastos. */
  total: Centimos;
  primeraFecha: string;
  ultimaFecha: string;
  /** Sólo si todos van en la misma dirección; null si mezcla cargos y abonos. */
  signo: 'cargo' | 'abono' | null;
}

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/**
 * Agrupa lo pendiente y lo ordena por dinero, no por fecha.
 *
 * Ordenar por importe total es lo que hace que las primeras preguntas sean las
 * que más mueven el desglose. Por fecha, ORis empezaría preguntando por un café
 * de 1,20 € porque es el más reciente.
 */
export function agruparPendientes(
  movimientos: readonly MovimientoVista[],
): GrupoPendiente[] {
  const grupos = new Map<string, GrupoPendiente>();

  for (const m of movimientos) {
    if (!esPendiente(m)) continue;

    const raiz = normalizarConcepto(m.concepto) || m.concepto.trim().toUpperCase();
    const centimos = aCentimos(m.importe) ?? 0;
    const g = grupos.get(raiz);

    if (!g) {
      grupos.set(raiz, {
        raiz,
        conceptoCrudo: m.concepto.trim(),
        ids: [m.id],
        veces: 1,
        total: centimos,
        primeraFecha: m.fecha,
        ultimaFecha: m.fecha,
        signo: centimos === 0 ? null : centimos < 0 ? 'cargo' : 'abono',
      });
      continue;
    }

    g.ids.push(m.id);
    g.veces += 1;
    g.total += centimos;
    if (m.fecha < g.primeraFecha) g.primeraFecha = m.fecha;
    if (m.fecha > g.ultimaFecha) {
      g.ultimaFecha = m.fecha;
      // El concepto crudo que se enseña es el del más reciente: es el que el
      // usuario tiene más fresco.
      g.conceptoCrudo = m.concepto.trim();
    }

    const esteSigno = centimos === 0 ? null : centimos < 0 ? 'cargo' : 'abono';
    if (g.signo !== esteSigno) g.signo = null;
  }

  // Por dinero pendiente descendente; a igualdad, el que más se repite.
  return [...grupos.values()].sort(
    (a, b) => Math.abs(b.total) - Math.abs(a.total) || b.veces - a.veces,
  );
}

/**
 * ¿Este movimiento necesita que alguien lo mire?
 *
 * Sin categoría, o con la categoría de relleno. Lo que puso el modelo NO cuenta
 * como pendiente aquí — para eso está el aviso del panel, que es otra cosa: ahí
 * se revisa lo dudoso, aquí se rellena lo que falta.
 */
function esPendiente(m: MovimientoVista): boolean {
  return m.categoria === null || m.categoria === SIN_CATEGORIZAR;
}

/** Cuánto dinero hay esperando a que alguien diga qué era. */
export function dineroPendiente(grupos: readonly GrupoPendiente[]): Centimos {
  return grupos.reduce((acc, g) => acc + Math.abs(g.total), 0);
}

/**
 * La pregunta, escrita como la haría una persona.
 *
 * Todo lo que aparece aquí sale del extracto. Si un dato no consta, no se
 * menciona: es preferible una frase más corta que una frase con un detalle
 * inventado que empuje a recordar algo que no pasó.
 */
export function redactarPregunta(g: GrupoPendiente): string {
  const verbo = g.signo === 'abono' ? 'te entraron' : 'gastaste';
  const cantidad = formatear(Math.abs(g.total));

  if (g.veces === 1) {
    return (
      `El ${enPalabras(g.ultimaFecha)} ${verbo} ${cantidad} y el banco lo apuntó ` +
      `como «${g.conceptoCrudo}». ¿Te acuerdas de qué fue? Si me lo dices, lo ` +
      `dejo categorizado.`
    );
  }

  const mismoDia = g.primeraFecha === g.ultimaFecha;
  const periodo = mismoDia
    ? `el ${enPalabras(g.ultimaFecha)}`
    : `entre ${enPalabras(g.primeraFecha, false)} y ${enPalabras(g.ultimaFecha, false)}`;

  return (
    `«${g.conceptoCrudo}» aparece ${g.veces} veces ${periodo}, ${cantidad} en ` +
    `total. ¿Qué es? Con que me lo digas una vez, categorizo las ${g.veces} y ` +
    `las que vengan.`
  );
}

/** «sábado 17 de mayo» — o «17 de mayo» sin el día de la semana. */
export function enPalabras(fecha: string, conDia = true): string {
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return fecha;
  // Mediodía UTC: evita que el desfase horario mueva la fecha un día atrás.
  const cuando = new Date(Date.UTC(a, m - 1, d, 12));
  const dia = DIAS[cuando.getUTCDay()];
  const mes = MESES[m - 1];
  return conDia ? `${dia} ${d} de ${mes}` : `${d} de ${mes}`;
}

/**
 * La regla que se aprende de una respuesta.
 *
 * Se ancla a la raíz completa y con límites de palabra, no a un fragmento: un
 * patrón demasiado corto arrastraría comercios que no tienen nada que ver, y
 * una regla mal aprendida es peor que no tener regla — categoriza en silencio y
 * para siempre.
 *
 * La prioridad es 60: por encima de las genéricas de comercio (50) porque es
 * una decisión tuya sobre un caso concreto, y por debajo de las estructurales
 * —comisiones (90) y traspasos (100)— que siguen mandando.
 */
export function reglaAprendida(
  g: GrupoPendiente,
  categoria: string,
): { categoria: string; patron: string; prioridad: number; signo: 'cargo' | 'abono' | 'cualquiera' } {
  return {
    categoria,
    patron: `\\b${escaparRegex(g.raiz)}\\b`,
    prioridad: 60,
    signo: g.signo ?? 'cualquiera',
  };
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
