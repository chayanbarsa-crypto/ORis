/**
 * La puerta.
 *
 * Es una página aparte y no un estado de la principal, y ésa es justamente la
 * diferencia entre una puerta y un telón: mientras el desbloqueo era un estado
 * de `/`, el servidor ya había consultado los movimientos y los había metido en
 * el HTML antes de decidir si enseñarlos. Aquí no hay nada que consultar.
 */

import { StarField } from '@/components/background/StarField';
import { UnlockScreen } from '@/components/unlock/UnlockScreen';

export const metadata = { title: 'ORis' };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; falta?: string }>;
}) {
  const { volver, falta } = await searchParams;

  // Sólo rutas internas: un `volver` que empiece por `//` o por `http` lo
  // convertiría en un redirector abierto a cualquier sitio, y bastaría un
  // enlace con buena pinta para acabar en otra web tras meter el PIN.
  const destino = typeof volver === 'string' && /^\/(?!\/)/.test(volver) ? volver : '/';

  return (
    <main className="tema-oscuro relative h-dvh w-screen overflow-hidden">
      <StarField />
      <UnlockScreen destino={destino} />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-6">
        {falta ? (
          <p className="max-w-xs rounded-lg border border-aviso-borde bg-aviso-fondo px-3 py-2 text-center text-[0.72rem] leading-relaxed text-tinta-3">
            Falta <code>ORIS_SECRETO</code> en el entorno del despliegue. Hasta que esté,
            no se puede entrar — y es lo correcto: sin ella no habría puerta.
          </p>
        ) : null}
      </div>
    </main>
  );
}
