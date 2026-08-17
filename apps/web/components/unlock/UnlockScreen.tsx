'use client';

/**
 * Pantalla de desbloqueo: la puerta de entrada a IRES.
 *
 * No es un login. La secuencia es locked -> awakening -> success -> idle, y
 * cada paso tiene su duracion propia para que se lea como un despertar y no
 * como un cambio de pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PiscesConstellation } from '@/components/constellation/PiscesConstellation';
import { PinPad } from './PinPad';
import { useIres } from '@/lib/ires/context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { rgba } from '@/lib/ires/theme';
import { MAX_PATTERN_ATTEMPTS, PIN_ENABLED } from '@/lib/ires/accessConfig';

const AWAKEN_MS = 1800;
const SUCCESS_HOLD_MS = 900;

export function UnlockScreen() {
  const { state, setState, theme } = useIres();
  const reduced = useReducedMotion();
  const [awaken, setAwaken] = useState(0);
  const [fails, setFails] = useState(0);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tras agotar los intentos, la constelacion cede el paso al PIN — si hay
  // PIN configurado. Sin variable de entorno no existe respaldo y se sigue
  // intentando el patron, que es preferible a un teclado que nunca abre.
  const showPin = fails >= MAX_PATTERN_ATTEMPTS && PIN_ENABLED;

  const handleFail = useCallback(() => setFails((n) => n + 1), []);

  const handleUnlock = useCallback(() => {
    setState('awakening');

    if (reduced) {
      // Sin movimiento: se salta la coreografia, no el flujo de estados.
      setAwaken(1);
      setState('success');
      timerRef.current = setTimeout(() => setState('idle'), 300);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / AWAKEN_MS);
      // easeOutCubic: arranca rapido y se asienta, que es como se lee un
      // destello expandiendose.
      setAwaken(1 - Math.pow(1 - t, 3));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setState('success');
        timerRef.current = setTimeout(() => setState('idle'), SUCCESS_HOLD_MS);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [reduced, setState]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const locked = state === 'locked';
  const leaving = state === 'success' || state === 'idle';

  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.div
          key="unlock"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <motion.header
            className="pointer-events-none absolute top-[8%] flex flex-col items-center gap-3 px-6 text-center"
            animate={{ opacity: leaving ? 0 : 1, y: leaving ? -12 : 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="text-[clamp(2.2rem,7vw,4rem)] font-extralight tracking-[0.42em] text-white/90"
              style={{ textShadow: `0 0 28px ${rgba(theme.glow, 0.55)}` }}
            >
              ORis
            </h1>
            <p className="text-[0.62rem] uppercase tracking-[0.34em] text-white/35 sm:text-xs">
              Inteligencia financiera
            </p>
          </motion.header>

          <div className="h-full w-full">
            <PiscesConstellation
              interactive={locked && !showPin}
              onUnlock={handleUnlock}
              onFail={handleFail}
              awakenProgress={awaken}
              mostrarGuia={locked && !showPin}
            />
          </div>

          {/* El PIN se superpone a la constelacion, que sigue latiendo detras:
              se cambia el metodo de acceso, no se cambia de pantalla. */}
          <AnimatePresence>
            {showPin && locked && (
              <motion.div
                key="pin"
                className="absolute inset-0 z-10 flex items-center justify-center bg-[#040814]/55 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                <PinPad onUnlock={handleUnlock} />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.footer
            className="pointer-events-none absolute bottom-[7%] flex flex-col items-center gap-2 px-6 text-center"
            animate={{ opacity: leaving ? 0 : 1, y: leaving ? 12 : 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-white/40 sm:text-xs">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: rgba(theme.glow, 0.9),
                  boxShadow: `0 0 10px ${rgba(theme.glow, 0.8)}`,
                }}
              />
              {locked ? 'Sistema bloqueado' : 'Despertando'}
            </span>
            <span className="max-w-xs text-[0.68rem] leading-relaxed text-white/25">
              {showPin
                ? 'Patrón bloqueado tras 3 intentos · introduce el PIN'
                : fails >= MAX_PATTERN_ATTEMPTS
                  ? 'Sin PIN configurado: define NEXT_PUBLIC_UNLOCK_PIN en .env.local'
                  : fails > 0
                    ? `Patrón no reconocido · ${MAX_PATTERN_ATTEMPTS - fails} ${
                        MAX_PATTERN_ATTEMPTS - fails === 1 ? 'intento restante' : 'intentos restantes'
                      }`
                    : 'Une los puntos numerados para despertar a ORis'}
            </span>
          </motion.footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
