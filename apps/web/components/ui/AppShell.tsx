'use client';

/**
 * Carcasa de la interfaz principal.
 *
 * En Fase 1 solo se revela para demostrar que el desbloqueo desemboca en
 * algun sitio. El sidebar y el chat son huecos con su sitio ya reservado:
 * la Fase 2 rellena `FinanceSidebar` y `ChatPanel` sin tocar este layout.
 */

import { motion } from 'framer-motion';
import { StatusBadge } from './StatusBadge';
import { FinanceSidebar } from '@/components/finance/FinanceSidebar';
import { ChatPanel } from '@/components/chat/ChatPanel';

export function AppShell() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
    >
      <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 backdrop-blur-sm sm:px-7">
        <span className="text-sm font-light tracking-[0.32em] text-white/80">IRES</span>
        <StatusBadge />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <FinanceSidebar />
        <ChatPanel />
      </div>
    </motion.div>
  );
}
