/**
 * Configuración de acceso a ORis.
 *
 * Aquí vivía el PIN, leído de `NEXT_PUBLIC_UNLOCK_PIN`, y este archivo avisaba
 * de que eso no era seguridad: una variable `NEXT_PUBLIC_` acaba dentro del
 * JavaScript que se descarga, así que el PIN se leía abriendo las herramientas
 * de desarrollo. Era una cerradura de conveniencia, y se dijo desde el primer
 * día que tenía que desaparecer en cuanto hubiera dinero de verdad detrás.
 *
 * Ese día llegó. Ahora el PIN se comprueba en el servidor —`app/api/pin`— y no
 * existe ninguna copia en el navegador: lo único que viaja es la cookie firmada
 * que devuelve el servidor si acierta. Lo que queda aquí son medidas de la
 * interfaz, que no guardan ningún secreto.
 */

/** Intentos de patrón fallidos antes de ofrecer el PIN directamente. */
export const MAX_PATTERN_ATTEMPTS = 3;

/**
 * Cuántos puntos se dibujan mientras se teclea.
 *
 * Es sólo la forma del componente. El servidor acepta de cuatro a ocho dígitos
 * y no dice cuántos son los correctos: contarlo en pantalla le ahorraría trabajo
 * a quien esté probando.
 */
export const PIN_LENGTH = 4;
