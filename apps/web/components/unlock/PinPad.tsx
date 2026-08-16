'use client';

/**
 * PIN de respaldo tras agotar los intentos de patron.
 *
 * Se valida solo cuando estan los 4 digitos: comprobar a cada pulsacion
 * revelaria la longitud y el prefijo por ensayo y error.
 *
 * Las teclas son de 64px con separacion generosa porque este es justamente
 * el momento en que el usuario esta nervioso y probablemente en el movil.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { IresEye } from '@/components/ui/IresEye';
import { useIres } from '@/lib/ires/context';
import { IRES_THEME, rgba } from '@/lib/ires/theme';
import { PIN_LENGTH, isValidPin } from '@/lib/ires/accessConfig';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export interface PinPadProps {
  onUnlock(): void;
}

export function PinPad({ onUnlock }: PinPadProps) {
  const { theme } = useIres();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  const press = useCallback(
    (key: string) => {
      if (key === '') return;
      setError(false);

      if (key === '⌫') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + key;
        if (next.length === PIN_LENGTH) {
          if (isValidPin(next)) {
            onUnlock();
          } else {
            setError(true);
            errorTimer.current = setTimeout(() => {
              setPin('');
              setError(false);
            }, 700);
          }
        }
        return next;
      });
    },
    [onUnlock],
  );

  // Teclado fisico: en escritorio nadie quiere pulsar botones con el raton.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <motion.div
      className="w-[min(20rem,88vw)] rounded-3xl border border-white/[0.09] bg-white/[0.03] p-6 backdrop-blur-xl"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      style={{ boxShadow: `0 0 60px ${rgba(theme.glow, 0.13)}` }}
    >
      <div className="flex flex-col items-center gap-1">
        <IresEye size={112} />
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.3em] text-white/40">
          Acceso alternativo
        </p>
      </div>

      {/* Puntos de progreso */}
      <motion.div
        className="my-6 flex justify-center gap-3.5"
        animate={error ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.42 }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          // El rojo sale del tema de riesgo, no de un hex suelto: el color
          // vive en un unico sitio.
          const color = error ? IRES_THEME.risk.glow : theme.glow;
          return (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full transition-all duration-200"
              style={{
                background: filled ? rgba(color, 0.95) : 'transparent',
                border: `1px solid ${rgba(color, filled ? 0.95 : 0.3)}`,
                boxShadow: filled ? `0 0 12px ${rgba(color, 0.7)}` : 'none',
              }}
            />
          );
        })}
      </motion.div>

      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              className="h-16 rounded-2xl border border-white/[0.07] bg-white/[0.02] text-lg font-light text-white/80 transition-colors active:bg-white/[0.09] md:hover:bg-white/[0.06]"
              aria-label={k === '⌫' ? 'Borrar' : k}
            >
              {k}
            </button>
          ),
        )}
      </div>

      <p className="mt-5 text-center text-[0.66rem] leading-relaxed text-white/25">
        {error ? 'PIN incorrecto' : 'Introduce tu PIN para despertar a IRES'}
      </p>
    </motion.div>
  );
}
