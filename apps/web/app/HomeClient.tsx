'use client';

import { StarField } from '@/components/background/StarField';
import { UnlockScreen } from '@/components/unlock/UnlockScreen';
import { AppShell } from '@/components/ui/AppShell';
import { useIres } from '@/lib/ires/context';
import type { MovimientoVista } from '@/lib/oris/agregados';
import type { ExtractoVista } from '@/lib/oris/cargar';

export interface HomeClientProps {
  movimientos: readonly MovimientoVista[];
  extractos: readonly ExtractoVista[];
  motivoVacio?: string;
}

export function HomeClient({ movimientos, extractos, motivoVacio }: HomeClientProps) {
  const { desbloqueado } = useIres();

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* El campo estelar nunca se desmonta: sobrevive al desbloqueo y sigue
          reaccionando al estado de IRES en toda la aplicacion. */}
      <StarField />

      {/* El panel se enseña cuando la puerta está abierta, no cuando ORis
          está en reposo. Eran la misma condición, y por eso ponerse a analizar
          un extracto te devolvía a la constelación. */}
      {desbloqueado && <AppShell movimientos={movimientos} extractos={extractos} motivoVacio={motivoVacio} />}
      <UnlockScreen />
    </main>
  );
}
