'use client';

/**
 * Carcasa de la interfaz principal.
 *
 * El layout que reservó la Fase 1 se rellena aquí sin moverlo: `FinanceSidebar`
 * a la izquierda, contenido a la derecha. Lo que cambia es que el hueco de la
 * derecha ya no es un placeholder — es el panel, y el chat pasa a ser una de
 * las secciones en vez de la única cosa que había.
 *
 * Los movimientos llegan por props desde el servidor. Este componente no sabe
 * de dónde salen ni si hay base de datos: sólo los pinta o muestra por qué no
 * los hay.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { FinanceSidebar } from '@/components/finance/FinanceSidebar';
import { PanelPrincipal } from '@/components/panel/PanelPrincipal';
import { ListaMovimientos } from '@/components/panel/ListaMovimientos';
import type { MovimientoVista } from '@/lib/oris/agregados';
import { StatusBadge } from './StatusBadge';

export interface AppShellProps {
  movimientos?: readonly MovimientoVista[];
  motivoVacio?: string;
}

export function AppShell({ movimientos = [], motivoVacio }: AppShellProps) {
  const [seccion, setSeccion] = useState('panel');

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
    >
      <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 backdrop-blur-sm sm:px-7">
        <span className="text-sm font-light tracking-[0.32em] text-white/80">ORis</span>
        <StatusBadge />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <FinanceSidebar seccion={seccion} onSeccion={setSeccion} />

        {seccion === 'movimientos' ? (
          <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">
              Todos los movimientos
            </h2>
            <ListaMovimientos movimientos={movimientos} />
          </section>
        ) : (
          <PanelPrincipal movimientos={movimientos} motivoVacio={motivoVacio} />
        )}

        {/* El chat sigue siendo el hueco que era: no hay backend de IA todavía,
            y fingir uno haría imposible distinguir después lo conectado de lo
            inventado. */}
        <ChatPanel />
      </div>
    </motion.div>
  );
}
