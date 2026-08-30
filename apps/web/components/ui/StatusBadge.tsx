'use client';

import { useIres } from '@/lib/ires/context';
import { rgba } from '@/lib/ires/theme';

const LABEL: Record<string, string> = {
  locked: 'BLOQUEADO',
  awakening: 'DESPERTANDO',
  idle: 'ONLINE',
  listening: 'ESCUCHANDO',
  thinking: 'PENSANDO',
  processing: 'PROCESANDO',
  speaking: 'HABLANDO',
  analyzing: 'ANALIZANDO',
  alert: 'ALERTA',
  success: 'LISTO',
};

export function StatusBadge() {
  const { state, theme } = useIres();

  return (
    <span className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.22em] text-tinta-3">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: rgba(theme.glow, 0.95),
          boxShadow: `0 0 10px ${rgba(theme.glow, 0.85)}`,
        }}
      />
      {LABEL[state] ?? state.toUpperCase()}
    </span>
  );
}
