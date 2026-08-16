/**
 * Identidad visual de IRES. Punto unico de verdad del color.
 *
 * Los componentes NUNCA escriben un color literal: piden el tema de una
 * emocion. Cambiar la identidad de IRES es editar este archivo.
 *
 * Los colores se guardan como tripletas RGB en vez de hex porque el canvas
 * necesita componer alfas variables por frame (`rgba(r,g,b,a)`), y parsear
 * hex en cada frame seria trabajo tirado.
 */

import type { IresEmotion } from './state';

export type RGB = readonly [number, number, number];

export interface EmotionTheme {
  /** Centro del nodo. */
  core: RGB;
  /** Halo alrededor del nodo. */
  glow: RGB;
  /** Lineas de la constelacion. */
  line: RGB;
  /** Particulas emitidas. */
  particle: RGB;
}

export const IRES_THEME: Record<IresEmotion, EmotionTheme> = {
  neutral: {
    core: [190, 240, 255],
    glow: [56, 189, 248],
    line: [56, 189, 248],
    particle: [125, 211, 252],
  },
  analytical: {
    core: [200, 235, 255],
    glow: [45, 150, 240],
    line: [59, 130, 246],
    particle: [96, 165, 250],
  },
  positive: {
    core: [214, 255, 235],
    glow: [16, 185, 129],
    line: [52, 211, 153],
    particle: [110, 231, 183],
  },
  risk: {
    core: [255, 226, 200],
    glow: [239, 108, 60],
    line: [248, 113, 74],
    particle: [253, 164, 115],
  },
  empathy: {
    core: [232, 219, 255],
    glow: [139, 92, 246],
    line: [167, 139, 250],
    particle: [196, 181, 253],
  },
  processing: {
    core: [222, 231, 255],
    glow: [124, 120, 245],
    line: [129, 140, 248],
    particle: [165, 180, 252],
  },
};

/** Fondo espacial. Se usa tambien como color de estela del canvas. */
export const SPACE = {
  deep: [4, 8, 20] as RGB,
  mid: [8, 15, 35] as RGB,
  star: [226, 240, 255] as RGB,
};

export function rgba(color: RGB, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** Interpola dos colores. Se usa para las transiciones entre emociones. */
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function themeFor(emotion: IresEmotion): EmotionTheme {
  return IRES_THEME[emotion];
}
