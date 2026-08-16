'use client';

/**
 * Respeta `prefers-reduced-motion`.
 *
 * Devuelve false en el primer render del servidor y se corrige al montar:
 * leer matchMedia durante SSR reventaria, y asumir "sin movimiento" haria
 * que la constelacion apareciese congelada un instante en todos los equipos.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    setReduced(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
