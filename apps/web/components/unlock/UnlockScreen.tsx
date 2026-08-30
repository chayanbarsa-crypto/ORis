'use client';

/**
 * La puerta de ORis: la constelación y, detrás, el PIN.
 *
 * Los dos pasos hacen cosas distintas y conviene no confundirlas. **El patrón
 * no es seguridad**: se dibuja en el navegador y allí no se puede guardar
 * ningún secreto. Es el ritual de entrada — despierta a ORis, y está porque una
 * herramienta que se abre bien se usa más. **El PIN sí lo es**: lo comprueba el
 * servidor, y hasta que lo acierta no se sirve ni un movimiento.
 *
 * Por eso el patrón lleva siempre al PIN en vez de abrir nada, y por eso tres
 * patrones fallidos no bloquean: saltan directamente al teclado. Que un gesto
 * mal dibujado te dejara fuera de tus propias cuentas sería una cerradura que
 * protege de su dueño.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PiscesConstellation } from '@/components/constellation/PiscesConstellation';
import { PinPad } from './PinPad';
import { useIres } from '@/lib/ires/context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { rgba } from '@/lib/ires/theme';
import { MAX_PATTERN_ATTEMPTS } from '@/lib/ires/accessConfig';

const AWAKEN_MS = 1800;
const SUCCESS_HOLD_MS = 900;

export interface UnlockScreenProps {
  /** A dónde ir cuando el servidor acepta el PIN. Siempre una ruta interna. */
  destino?: string;
}

export function UnlockScreen({ destino = '/' }: UnlockScreenProps) {
  const router = useRouter();
  const { state, setState, theme, desbloqueado, abrir } = useIres();
  const reduced = useReducedMotion();
  const [awaken, setAwaken] = useState(0);
  const [fails, setFails] = useState(0);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El PIN aparece al acertar el patrón o al fallarlo tres veces. Las dos vías
  // llevan al mismo sitio porque el patrón no decide nada: decide el servidor.
  const showPin = pidiendoPin || fails >= MAX_PATTERN_ATTEMPTS;

  const handleFail = useCallback(() => setFails((n) => n + 1), []);

  /** El servidor ha aceptado el PIN: la cookie ya está puesta. */
  const handleDentro = useCallback(() => {
    abrir();
    setState('success');
    // `refresh` además de `replace`: el panel se renderiza en el servidor y sin
    // esto se serviría la copia cacheada de antes de tener sesión, que es la
    // redirección de vuelta a esta misma pantalla.
    timerRef.current = setTimeout(() => {
      router.replace(destino);
      router.refresh();
    }, SUCCESS_HOLD_MS);
  }, [abrir, destino, router, setState]);

  const handleUnlock = useCallback(() => {
    setState('awakening');

    if (reduced) {
      // Sin movimiento: se salta la coreografia, no el flujo de estados.
      setAwaken(1);
      setPidiendoPin(true);
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
        // Despierta, y entonces pide el PIN. La animación es la bienvenida;
        // la cerradura viene después.
        setPidiendoPin(true);
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
      {/* Se cierra cuando la puerta se abre, no cuando el estado llega a
          «idle»: si dependiera del estado, volvería a aparecer en cuanto ORis
          se pusiera a analizar algo. */}
      {!desbloqueado && (
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
              className="text-[clamp(2.2rem,7vw,4rem)] font-extralight tracking-[0.42em] text-tinta"
              style={{ textShadow: `0 0 28px ${rgba(theme.glow, 0.55)}` }}
            >
              ORis
            </h1>
            <p className="text-[0.62rem] uppercase tracking-[0.34em] text-tinta-4 sm:text-xs">
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
            {showPin && !desbloqueado && (
              <motion.div
                key="pin"
                className="absolute inset-0 z-10 flex items-center justify-center bg-fondo/55 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                <PinPad onUnlock={handleDentro} />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.footer
            className="pointer-events-none absolute bottom-[7%] flex flex-col items-center gap-2 px-6 text-center"
            animate={{ opacity: leaving ? 0 : 1, y: leaving ? 12 : 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-tinta-4 sm:text-xs">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: rgba(theme.glow, 0.9),
                  boxShadow: `0 0 10px ${rgba(theme.glow, 0.8)}`,
                }}
              />
              {locked ? 'Sistema bloqueado' : 'Despertando'}
            </span>
            <span className="max-w-xs text-[0.68rem] leading-relaxed text-tinta-5">
              {showPin
                ? 'ORis está despierto · ahora el PIN'
                : fails > 0
                  ? `Patrón no reconocido · ${MAX_PATTERN_ATTEMPTS - fails} ${
                      MAX_PATTERN_ATTEMPTS - fails === 1
                        ? 'intento antes de pasar al PIN'
                        : 'intentos antes de pasar al PIN'
                    }`
                  : 'Une los puntos numerados para despertar a ORis'}
            </span>
          </motion.footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
