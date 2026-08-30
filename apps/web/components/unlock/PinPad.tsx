'use client';

/**
 * El PIN. Lo que de verdad abre la puerta.
 *
 * Antes comparaba contra una constante que viajaba en el JavaScript de la
 * página; ahora pregunta al servidor, que es el único que sabe la respuesta. Lo
 * que vuelve no es un «sí» que el navegador pueda fingir: es una cookie firmada
 * que el `middleware` verifica en cada petición posterior.
 *
 * Se envía sólo al completar los dígitos: comprobar a cada pulsación revelaría
 * la longitud y el prefijo por ensayo y error.
 *
 * Las teclas son grandes y separadas porque éste es justamente el momento en
 * que el usuario está con prisa y probablemente en el móvil.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { IresEye } from '@/components/ui/IresEye';
import { useIres } from '@/lib/ires/context';
import { IRES_THEME, rgba } from '@/lib/ires/theme';
import { PIN_LENGTH } from '@/lib/ires/accessConfig';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export interface PinPadProps {
  /** Se llama cuando el servidor ha aceptado el PIN y la cookie ya está puesta. */
  onUnlock(): void;
}

export function PinPad({ onUnlock }: PinPadProps) {
  const { theme } = useIres();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  const fallar = useCallback((mensaje: string) => {
    setError(true);
    setAviso(mensaje);
    errorTimer.current = setTimeout(() => {
      setPin('');
      setError(false);
    }, 700);
  }, []);

  const comprobar = useCallback(
    async (candidato: string) => {
      if (enVuelo.current) return;
      enVuelo.current = true;
      setComprobando(true);
      try {
        const res = await fetch('/api/pin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pin: candidato }),
        });
        if (res.ok) {
          setAviso(null);
          onUnlock();
          return;
        }
        const datos = await res.json().catch(() => ({}));
        fallar(datos.mensaje ?? 'PIN incorrecto');
      } catch {
        fallar('No he podido comprobarlo. ¿Hay conexión?');
      } finally {
        enVuelo.current = false;
        setComprobando(false);
      }
    },
    [fallar, onUnlock],
  );

  const press = useCallback(
    (key: string) => {
      if (key === '' || enVuelo.current) return;
      setError(false);

      if (key === '⌫') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + key;
        if (next.length === PIN_LENGTH) void comprobar(next);
        return next;
      });
    },
    [comprobar],
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
      className="w-[min(20rem,88vw)] rounded-3xl border border-borde-2 bg-superficie p-6 backdrop-blur-xl"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      style={{ boxShadow: `0 0 60px ${rgba(theme.glow, 0.13)}` }}
    >
      <div className="flex flex-col items-center gap-1">
        <IresEye size={112} />
        {/* Ya no es «acceso alternativo»: era el respaldo del patrón cuando
            el patrón abría, y ahora el patrón sólo despierta. Esto es la
            cerradura. */}
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.3em] text-tinta-4">
          Tu PIN
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
              className="h-16 rounded-2xl border border-borde bg-superficie text-lg font-light text-tinta-2 transition-colors active:bg-superficie-3 md:hover:bg-superficie-2"
              aria-label={k === '⌫' ? 'Borrar' : k}
            >
              {k}
            </button>
          ),
        )}
      </div>

      <p className="mt-5 text-center text-[0.66rem] leading-relaxed text-tinta-5">
        {comprobando ? 'Comprobando…' : (aviso ?? 'Introduce tu PIN para despertar a ORis')}
      </p>
    </motion.div>
  );
}
