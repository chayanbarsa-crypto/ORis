/**
 * Página principal. Componente **de servidor**: aquí se leen los datos.
 *
 * La parte interactiva vive en `HomeClient` porque necesita los hooks de IRES.
 * Separarlas permite que los movimientos se carguen en el servidor —sin un
 * parpadeo de «cargando» ni una llamada extra desde el navegador— y que el
 * cliente reciba sólo lo que tiene que pintar.
 */

import { cargarMovimientos } from '@/lib/oris/cargar';
import { HomeClient } from './HomeClient';

/**
 * Nada de prerenderizado estático.
 *
 * Por defecto Next congela esta página en el build. Como los movimientos se
 * leen aquí, eso significaría servir siempre los que hubiera en la base de
 * datos el día del despliegue: subir un extracto no cambiaría nada en pantalla
 * hasta el siguiente deploy, y sin dar ningún error. Los datos son por usuario
 * y cambian solos, así que la página tiene que consultarlos en cada petición.
 */
export const dynamic = 'force-dynamic';

export default async function Home() {
  const { movimientos, motivo } = await cargarMovimientos();
  return <HomeClient movimientos={movimientos} motivoVacio={motivo ?? undefined} />;
}
