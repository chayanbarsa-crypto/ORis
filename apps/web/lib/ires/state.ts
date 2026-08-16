/**
 * Estados y emociones de IRES.
 *
 * El estado dice QUE ESTA HACIENDO IRES; la emocion dice CON QUE TONO.
 * Son ejes separados a proposito: "thinking" puede ser analitico o de riesgo,
 * y queremos poder cambiar el tono sin cambiar el estado.
 *
 * Nada de esto sabe de React ni de canvas. Los componentes leen el perfil y
 * lo traducen a pixeles; asi se puede cambiar el lenguaje corporal de IRES
 * desde un unico sitio.
 */

export type IresState =
  | 'locked'
  | 'awakening'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'processing'
  | 'speaking'
  | 'analyzing'
  | 'alert'
  | 'success';

export type IresEmotion =
  | 'neutral'
  | 'analytical'
  | 'positive'
  | 'risk'
  | 'empathy'
  | 'processing';

/**
 * Parametros de movimiento asociados a cada estado. Los consumen la
 * constelacion y el campo estelar; son numeros relativos (1 = reposo),
 * no unidades de render, para que cada canvas los escale a su manera.
 */
export interface StateProfile {
  /** Tono por defecto del estado. Se puede sobrescribir por nodo. */
  emotion: IresEmotion;
  /** Ciclos de pulso por segundo. */
  pulseSpeed: number;
  /** Multiplicador del halo. */
  glow: number;
  /** Actividad del campo estelar: deriva y parpadeo. */
  starActivity: number;
  /** Emision de particulas alrededor de los nodos. */
  particles: number;
  /** Si el estado emite ondas expansivas periodicas. */
  waves: boolean;
}

export const STATE_PROFILE: Record<IresState, StateProfile> = {
  locked:     { emotion: 'neutral',    pulseSpeed: 0.22, glow: 0.55, starActivity: 0.35, particles: 0.15, waves: false },
  awakening:  { emotion: 'processing', pulseSpeed: 1.10, glow: 2.20, starActivity: 1.60, particles: 1.00, waves: true  },
  idle:       { emotion: 'analytical', pulseSpeed: 0.35, glow: 1.00, starActivity: 0.50, particles: 0.25, waves: false },
  listening:  { emotion: 'empathy',    pulseSpeed: 0.75, glow: 1.35, starActivity: 0.80, particles: 0.45, waves: false },
  thinking:   { emotion: 'analytical', pulseSpeed: 0.90, glow: 1.25, starActivity: 0.95, particles: 0.50, waves: false },
  processing: { emotion: 'processing', pulseSpeed: 1.20, glow: 1.60, starActivity: 1.30, particles: 0.80, waves: true  },
  speaking:   { emotion: 'positive',   pulseSpeed: 1.00, glow: 1.40, starActivity: 0.90, particles: 0.55, waves: false },
  analyzing:  { emotion: 'processing', pulseSpeed: 0.95, glow: 1.45, starActivity: 1.15, particles: 0.70, waves: true  },
  alert:      { emotion: 'risk',       pulseSpeed: 1.45, glow: 1.75, starActivity: 1.40, particles: 0.85, waves: false },
  success:    { emotion: 'positive',   pulseSpeed: 0.60, glow: 1.90, starActivity: 1.10, particles: 0.90, waves: true  },
};

/** Estados en los que la interfaz principal ya es visible. */
export function isUnlocked(state: IresState): boolean {
  return state !== 'locked' && state !== 'awakening';
}
