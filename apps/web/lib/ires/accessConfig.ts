/**
 * Configuracion de acceso a IRES.
 *
 * ⚠️ ESTO NO ES SEGURIDAD. El patron y el PIN acaban en el bundle de
 * JavaScript: cualquiera que abra las herramientas de desarrollo los ve. Es
 * una cerradura de conveniencia para que la aplicacion no se abra sola, nada
 * mas. Cuando IRES maneje datos financieros reales, la autenticacion tiene
 * que vivir en el servidor y esto debe desaparecer.
 *
 * El PIN se lee de una variable de entorno y NO tiene valor por defecto: si
 * estuviera escrito aqui, quedaria en el historial de git para siempre en
 * cuanto el repositorio se publique. Sin variable definida, el acceso por PIN
 * simplemente no se ofrece y solo funciona el patron.
 *
 * Se define en `.env.local` (ignorado por git). Ver `.env.example`.
 */

/** Intentos de patron fallidos antes de ofrecer el PIN de respaldo. */
export const MAX_PATTERN_ATTEMPTS = 3;

const PIN = process.env.NEXT_PUBLIC_UNLOCK_PIN ?? '';

/** Si no hay PIN configurado, el respaldo no existe. */
export const PIN_ENABLED = PIN.length > 0;

export const PIN_LENGTH = PIN.length || 4;

export function isValidPin(input: string): boolean {
  return PIN_ENABLED && input === PIN;
}
