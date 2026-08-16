/**
 * Validacion del patron de desbloqueo.
 *
 * Logica pura, sin React ni canvas: se puede probar sin montar nada.
 * La validacion se hace al SOLTAR, no mientras se dibuja, para no ir
 * revelando el patron nodo a nodo por ensayo y error.
 */

import { UNLOCK_SEQUENCE } from './pisces';

export type PatternResult = 'incomplete' | 'valid' | 'invalid';

export function validatePattern(
  path: readonly string[],
  expected: readonly string[] = UNLOCK_SEQUENCE,
): PatternResult {
  if (path.length === 0) return 'incomplete';
  if (path.length !== expected.length) return 'invalid';
  return path.every((id, i) => id === expected[i]) ? 'valid' : 'invalid';
}

/**
 * ¿Puede anadirse este nodo al trazo?
 * Se rechazan los duplicados: un patron que permita repetir nodo convierte
 * cualquier trazo largo en valido por accidente.
 */
export function canAppend(path: readonly string[], nodeId: string): boolean {
  return !path.includes(nodeId);
}

export function appendNode(path: readonly string[], nodeId: string): string[] {
  return canAppend(path, nodeId) ? [...path, nodeId] : [...path];
}

/** Longitud minima para que un trazo cuente como intento y no como roce. */
export const MIN_PATTERN_LENGTH = 2;
