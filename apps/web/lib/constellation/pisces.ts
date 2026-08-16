/**
 * Configuracion de la constelacion de Piscis.
 *
 * Las coordenadas son RELATIVAS (0..1) sobre el lienzo logico de la
 * constelacion, no pixeles. `geometry.ts` las proyecta preservando la
 * relacion de aspecto, asi que la composicion se mantiene igual en un movil
 * que en un monitor: es la unica forma de que Piscis siga pareciendo Piscis.
 *
 * Piscis son dos peces unidos por dos cuerdas que se juntan en Alrescha
 * ("el nudo"). De ahi salen dos ramales: uno hacia el oeste, que termina en
 * el anillo del pez occidental, y otro hacia el norte.
 */

import type { IresEmotion } from '../ires/state';

export interface IRESNode {
  id: string;
  /** Nombre de la estrella, para la interfaz. */
  label: string;
  /** 0..1, origen arriba-izquierda. */
  x: number;
  y: number;
  /** Dimension de IRES que representara este nodo. */
  emotion: IresEmotion;
  /** Brillo relativo: las estrellas principales se ven mas. */
  magnitude: number;
}

export interface IRESEdge {
  from: string;
  to: string;
}

export const PISCES_NODES: readonly IRESNode[] = [
  // El nudo: origen de los dos ramales.
  { id: 'alrescha', label: 'Alrescha', x: 0.72, y: 0.80, emotion: 'analytical', magnitude: 1.0 },

  // Ramal norte — el pez septentrional.
  { id: 'omicron', label: 'Omicron', x: 0.79, y: 0.66, emotion: 'analytical', magnitude: 0.7 },
  { id: 'eta', label: 'Eta', x: 0.84, y: 0.51, emotion: 'processing', magnitude: 0.9 },
  { id: 'tau', label: 'Tau', x: 0.87, y: 0.37, emotion: 'processing', magnitude: 0.6 },
  { id: 'upsilon', label: 'Upsilon', x: 0.83, y: 0.25, emotion: 'positive', magnitude: 0.55 },
  { id: 'phi', label: 'Phi', x: 0.74, y: 0.17, emotion: 'positive', magnitude: 0.65 },

  // Ramal oeste — la cuerda larga.
  { id: 'xi', label: 'Xi', x: 0.62, y: 0.75, emotion: 'neutral', magnitude: 0.6 },
  { id: 'nu', label: 'Nu', x: 0.54, y: 0.72, emotion: 'neutral', magnitude: 0.55 },
  { id: 'mu', label: 'Mu', x: 0.46, y: 0.70, emotion: 'empathy', magnitude: 0.5 },
  { id: 'epsilon', label: 'Epsilon', x: 0.38, y: 0.68, emotion: 'empathy', magnitude: 0.6 },
  { id: 'delta', label: 'Delta', x: 0.30, y: 0.66, emotion: 'risk', magnitude: 0.55 },
  { id: 'omega', label: 'Omega', x: 0.22, y: 0.61, emotion: 'risk', magnitude: 0.75 },

  // Anillo del pez occidental.
  { id: 'iota', label: 'Iota', x: 0.13, y: 0.52, emotion: 'neutral', magnitude: 0.6 },
  { id: 'theta', label: 'Theta', x: 0.07, y: 0.61, emotion: 'analytical', magnitude: 0.5 },
  { id: 'gamma', label: 'Gamma', x: 0.11, y: 0.72, emotion: 'positive', magnitude: 0.7 },
  { id: 'kappa', label: 'Kappa', x: 0.20, y: 0.72, emotion: 'neutral', magnitude: 0.45 },
];

export const PISCES_EDGES: readonly IRESEdge[] = [
  // Ramal norte.
  { from: 'alrescha', to: 'omicron' },
  { from: 'omicron', to: 'eta' },
  { from: 'eta', to: 'tau' },
  { from: 'tau', to: 'upsilon' },
  { from: 'upsilon', to: 'phi' },

  // Ramal oeste.
  { from: 'alrescha', to: 'xi' },
  { from: 'xi', to: 'nu' },
  { from: 'nu', to: 'mu' },
  { from: 'mu', to: 'epsilon' },
  { from: 'epsilon', to: 'delta' },
  { from: 'delta', to: 'omega' },

  // Anillo del pez occidental (cierra sobre omega).
  { from: 'omega', to: 'iota' },
  { from: 'iota', to: 'theta' },
  { from: 'theta', to: 'gamma' },
  { from: 'gamma', to: 'kappa' },
  { from: 'kappa', to: 'omega' },
];

/**
 * Secuencia de desbloqueo.
 *
 * PROVISIONAL Y DELIBERADAMENTE FACIL: los cuatro nodos de la cuerda oeste,
 * que estan casi alineados y son contiguos. Se traza de un solo arrastre
 * horizontal desde el nudo hacia la izquierda, sin levantar el dedo y sin
 * tener que apuntar a nodos sueltos. Pensado para desarrollar comodo.
 *
 * Cuando toque endurecerlo, basta cambiar este array: ningun componente
 * conoce la secuencia.
 */
export const UNLOCK_SEQUENCE: readonly string[] = [
  'alrescha',
  'xi',
  'nu',
  'mu',
];

export const NODE_BY_ID: ReadonlyMap<string, IRESNode> = new Map(
  PISCES_NODES.map((n) => [n.id, n]),
);
