'use client';

import { StarField } from '@/components/background/StarField';
import { UnlockScreen } from '@/components/unlock/UnlockScreen';
import { AppShell } from '@/components/ui/AppShell';
import { useIres } from '@/lib/ires/context';

export default function Home() {
  const { state } = useIres();

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* El campo estelar nunca se desmonta: sobrevive al desbloqueo y sigue
          reaccionando al estado de IRES en toda la aplicacion. */}
      <StarField />

      {state === 'idle' && <AppShell />}
      <UnlockScreen />
    </main>
  );
}
