/**
 * De quién son los datos.
 *
 * Todavía no hay login, así que todo pertenece al mismo usuario. La constante
 * existe igualmente por una razón concreta: **los lectores y los escritores
 * tienen que estar de acuerdo**. Mientras las rutas de escritura filtraban por
 * un identificador fijo y las consultas del panel no filtraban por ninguno, la
 * pantalla podía enseñar movimientos que después no se dejaban editar, y el
 * fallo salía como un «ese extracto no existe» delante de algo que se estaba
 * viendo.
 *
 * Cuando haya sesión, esto pasa a leerse de ella y hay un único sitio que
 * cambiar.
 */
export const USUARIO = 'jordy';
