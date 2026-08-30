'use client';

import { useEffect } from 'react';

import { StarField } from '@/components/background/StarField';
import { AppShell } from '@/components/ui/AppShell';
import { useIres } from '@/lib/ires/context';
import type { MovimientoVista } from '@/lib/oris/agregados';
import type { ExtractoVista } from '@/lib/oris/cargar';

export interface HomeClientProps {
  movimientos: readonly MovimientoVista[];
  extractos: readonly ExtractoVista[];
  motivoVacio?: string;
}

/**
 * Aquí ya no hay puerta.
 *
 * La había —la pantalla de la constelación con `desbloqueado`— y era un telón,
 * no una cerradura: esta página se renderiza en el servidor, así que los
 * movimientos ya estaban dentro del HTML antes de que nadie desbloqueara nada.
 * Ahora la puerta es el `middleware`, y si esta página llega a ejecutarse es
 * porque la cookie firmada era válida.
 */
export function HomeClient({ movimientos, extractos, motivoVacio }: HomeClientProps) {
  const { setState } = useIres();

  // El estado arranca en «locked» porque esa es la verdad en `/entrar`. Aquí ya
  // no: llegar a esta página significa haber pasado la puerta. Sin esto el
  // indicador de arriba se queda diciendo BLOQUEADO para siempre, que es
  // justamente lo contrario de lo que pasa, y encima sobre los datos abiertos.
  useEffect(() => {
    setState('idle');
  }, [setState]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* El campo estelar nunca se desmonta: sobrevive al desbloqueo y sigue
          reaccionando al estado de IRES en toda la aplicacion. */}
      <StarField />

      <AppShell movimientos={movimientos} extractos={extractos} motivoVacio={motivoVacio} />
    </main>
  );
}
