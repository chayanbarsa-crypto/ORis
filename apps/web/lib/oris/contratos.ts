/**
 * Los contratos compartidos con el extractor de Python.
 *
 * El esquema y las reglas no se declaran aquí: se leen de `contratos/`, que es
 * la misma carpeta que lee `oris_core`. Este módulo sólo les pone tipos y
 * comprueba al cargar que siguen siendo lo que decimos que son.
 *
 * La comprobación es deliberada. Un JSON no tiene tipos en tiempo de ejecución,
 * así que un fichero editado a mano puede compilar perfectamente y romper una
 * extracción media hora después, cuando ya hay un PDF a medio procesar. Mejor
 * que falle al arrancar.
 */

import esquemaJson from '@/contratos/esquema-movimientos.json';
import reglasJson from '@/contratos/reglas-base.json';

/** Sobre qué texto se compara una regla. */
export type SobreQue = 'raiz' | 'crudo';

/** Qué signo de importe admite una regla. */
export type SignoRegla = 'cargo' | 'abono' | 'cualquiera';

export interface ReglaCategorizacion {
  categoria: string;
  /** Expresión regular en mayúsculas y sin acentos. */
  patron: string;
  /** Mayor gana. */
  prioridad: number;
  signo: SignoRegla;
  /**
   * `raiz` compara contra el concepto normalizado; `crudo` contra el original.
   * No es un detalle: la normalización borra IBAN, ISIN y referencias, así que
   * una regla que los necesite y declare `raiz` no encontrará nunca nada.
   */
  sobre: SobreQue;
}

const SIGNOS: readonly SignoRegla[] = ['cargo', 'abono', 'cualquiera'];
const SOBRE: readonly SobreQue[] = ['raiz', 'crudo'];

function comprobarEsquema(esquema: unknown): Record<string, unknown> {
  if (typeof esquema !== 'object' || esquema === null) {
    throw new Error('esquema-movimientos.json no es un objeto.');
  }
  const e = esquema as Record<string, unknown>;
  if (e.additionalProperties !== false) {
    throw new Error(
      'esquema-movimientos.json no es estricto: sin additionalProperties=false ' +
        'el modelo puede añadir claves que nadie espera.',
    );
  }
  return e;
}

function comprobarReglas(reglas: unknown): ReglaCategorizacion[] {
  if (!Array.isArray(reglas) || reglas.length === 0) {
    throw new Error('reglas-base.json debe ser una lista no vacía.');
  }

  return reglas.map((r, i) => {
    const donde = `reglas-base.json[${i}]`;
    if (typeof r !== 'object' || r === null) throw new Error(`${donde} no es un objeto.`);
    const { categoria, patron, prioridad, signo, sobre } = r as Record<string, unknown>;

    if (typeof categoria !== 'string' || categoria === '') {
      throw new Error(`${donde}: falta "categoria".`);
    }
    if (typeof patron !== 'string' || patron === '') {
      throw new Error(`${donde}: falta "patron".`);
    }
    // Las expresiones se escriben pensando en Python. Casi toda la sintaxis es
    // común, pero lo que no lo sea tiene que saltar aquí y no en producción.
    try {
      new RegExp(patron);
    } catch {
      throw new Error(`${donde}: "${patron}" no es una expresión regular válida en JavaScript.`);
    }
    if (typeof prioridad !== 'number' || !Number.isInteger(prioridad)) {
      throw new Error(`${donde}: "prioridad" debe ser un entero.`);
    }
    if (typeof signo !== 'string' || !SIGNOS.includes(signo as SignoRegla)) {
      throw new Error(`${donde}: "signo" debe ser ${SIGNOS.join(', ')}.`);
    }
    if (typeof sobre !== 'string' || !SOBRE.includes(sobre as SobreQue)) {
      throw new Error(`${donde}: "sobre" debe ser ${SOBRE.join(' o ')}.`);
    }

    return { categoria, patron, prioridad, signo: signo as SignoRegla, sobre: sobre as SobreQue };
  });
}

/** El JSON Schema estricto que debe cumplir la extracción de un extracto. */
export const ESQUEMA_MOVIMIENTOS = comprobarEsquema(esquemaJson);

/**
 * Las reglas deterministas, ya ordenadas por prioridad descendente.
 *
 * Se ordenan aquí y no en cada uso: el orden es parte del significado —
 * `Traspaso entre cuentas propias` tiene que ganar a cualquier regla de
 * ingreso— y dejarlo a cargo de quien las consuma es pedir que un día se olvide.
 */
export const REGLAS_BASE: readonly ReglaCategorizacion[] = comprobarReglas(reglasJson).sort(
  (a, b) => b.prioridad - a.prioridad,
);

/**
 * Categoría de los traspasos: ni ingreso ni gasto. Ver `agregados.ts`.
 *
 * El nombre tiene que coincidir exactamente con el de la regla que los detecta.
 * Si alguien renombra la regla en el JSON y no aquí, los traspasos dejarían de
 * excluirse de los totales y el panel inflaría ingresos y gastos a la vez, sin
 * error visible. De ahí la comprobación de abajo.
 */
export const CATEGORIA_TRASPASO = 'Traspaso entre cuentas propias';

if (!REGLAS_BASE.some((r) => r.categoria === CATEGORIA_TRASPASO)) {
  throw new Error(
    `Ninguna regla de reglas-base.json asigna "${CATEGORIA_TRASPASO}". ` +
      'Sin ella los traspasos entre cuentas propias contarían como ingreso y gasto.',
  );
}
