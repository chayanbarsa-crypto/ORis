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

export default async function Home() {
  const { movimientos, motivo } = await cargarMovimientos();
  return <HomeClient movimientos={movimientos} motivoVacio={motivo ?? undefined} />;
}
