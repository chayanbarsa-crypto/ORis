/**
 * El cliente de Anthropic, en un solo sitio.
 *
 * Lo construían por su cuenta la lectura de PDF y el copiloto, y eso significaba
 * que cualquier detalle de autenticación había que acertarlo dos veces. Éste,
 * concretamente:
 *
 * **Hay claves ligadas a la identidad y claves ligadas a un espacio de
 * trabajo.** Las primeras no dicen por sí solas en nombre de qué espacio
 * actúan, así que la API las rechaza con un 400 —«anthropic-workspace-id is
 * required»— hasta que se manda esa cabecera. No es un fallo de configuración
 * del proyecto ni del prompt: la petición no llega al modelo.
 *
 * `ANTHROPIC_WORKSPACE_ID` es opcional a propósito. Con una clave de espacio de
 * trabajo no hace falta y mandarla vacía sería peor que no mandarla.
 */

import Anthropic from '@anthropic-ai/sdk';

export class SinClave extends Error {
  constructor(readonly sugerencia = '') {
    super('No hay ANTHROPIC_API_KEY configurada.');
    this.name = 'SinClave';
  }
}

export function hayClave(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Un cliente listo para usar.
 *
 * Lanza `SinClave` si falta la clave, en vez de devolver un cliente que fallará
 * más adelante con un error de red incomprensible.
 */
export function cliente(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new SinClave();

  const espacio = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  return new Anthropic({
    apiKey,
    // Sólo si la hay: la cabecera vacía es peor que la cabecera ausente.
    ...(espacio ? { defaultHeaders: { 'anthropic-workspace-id': espacio } } : {}),
  });
}
