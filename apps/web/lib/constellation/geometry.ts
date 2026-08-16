/**
 * Proyeccion de coordenadas relativas a pixeles y deteccion de nodos.
 *
 * La clave es `fitToCanvas`: escala con un unico factor (el menor de los dos
 * ejes) y centra. Si se escalara cada eje por separado, Piscis se deformaria
 * en pantallas anchas o estrechas y dejaria de reconocerse.
 */

import type { IRESNode } from './pisces';

export interface Point {
  x: number;
  y: number;
}

export interface Projection {
  /** Relativo (0..1) -> pixeles del canvas. */
  project(p: { x: number; y: number }): Point;
  /** Lado util tras aplicar el margen. Sirve para escalar radios y grosores. */
  scale: number;
}

export function fitToCanvas(width: number, height: number, padding = 0.12): Projection {
  const side = Math.min(width, height) * (1 - padding * 2);
  const offsetX = (width - side) / 2;
  const offsetY = (height - side) / 2;

  return {
    scale: side,
    project(p) {
      return { x: offsetX + p.x * side, y: offsetY + p.y * side };
    },
  };
}

export interface ProjectedNode extends IRESNode {
  px: number;
  py: number;
}

export function projectNodes(
  nodes: readonly IRESNode[],
  projection: Projection,
): ProjectedNode[] {
  return nodes.map((n) => {
    const p = projection.project(n);
    return { ...n, px: p.x, py: p.y };
  });
}

/**
 * Nodo mas cercano al punto dentro de `radius` pixeles.
 * Devuelve el mas cercano, no el primero que entre en el radio: con nodos
 * juntos, "el primero" haria que el trazo saltase al equivocado.
 */
export function findNodeAt(
  point: Point,
  nodes: readonly ProjectedNode[],
  radius: number,
): ProjectedNode | null {
  let best: ProjectedNode | null = null;
  let bestDist = radius * radius;

  for (const n of nodes) {
    const dx = n.px - point.x;
    const dy = n.py - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestDist) {
      bestDist = d2;
      best = n;
    }
  }
  return best;
}

/** Coordenadas del puntero relativas al canvas, en pixeles CSS. */
export function pointerToCanvas(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
