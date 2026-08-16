'use client';

/**
 * Emblema de IRES: un ojo alado.
 *
 * SVG y no imagen a proposito. Es geometria pura, asi que escala sin
 * perder nitidez, hereda el color del estado en vez de venir quemado en un
 * PNG, y no anade ni un byte de descarga. Segun la regla de assets del
 * proyecto, lo que se puede resolver con codigo no se genera como imagen.
 *
 * El iris late con la respiracion de IRES; las alas quedan quietas para que
 * no parezca un aleteo de dibujo animado.
 */

import { useIres } from '@/lib/ires/context';
import { rgba } from '@/lib/ires/theme';

export interface IresEyeProps {
  size?: number;
  /** Desactiva el latido (por ejemplo si el usuario pide menos movimiento). */
  still?: boolean;
  className?: string;
}

export function IresEye({ size = 96, still = false, className }: IresEyeProps) {
  const { theme } = useIres();

  const glow = rgba(theme.glow, 0.9);
  const core = rgba(theme.core, 0.95);
  const line = rgba(theme.line, 0.75);
  const faint = rgba(theme.line, 0.28);

  return (
    <svg
      width={size}
      height={size * 0.56}
      viewBox="0 0 200 112"
      fill="none"
      className={className}
      role="img"
      aria-label="IRES"
    >
      <defs>
        <radialGradient id="ires-iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={core} />
          <stop offset="55%" stopColor={glow} />
          <stop offset="100%" stopColor={rgba(theme.glow, 0)} />
        </radialGradient>
        <filter id="ires-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#ires-glow)">
        {/* Ala izquierda: tres plumas que se acortan hacia fuera. */}
        <g stroke={line} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M72 56 C56 40, 34 34, 10 38 C30 44, 44 50, 60 58" />
          <path d="M72 60 C54 52, 32 52, 6 60 C30 64, 48 64, 62 62" />
          <path d="M74 64 C58 66, 38 72, 18 84 C40 80, 58 74, 68 68" />
        </g>
        {/* Ala derecha: espejo exacto de la izquierda. */}
        <g stroke={line} strokeWidth="1.6" strokeLinecap="round" fill="none" transform="translate(200,0) scale(-1,1)">
          <path d="M72 56 C56 40, 34 34, 10 38 C30 44, 44 50, 60 58" />
          <path d="M72 60 C54 52, 32 52, 6 60 C30 64, 48 64, 62 62" />
          <path d="M74 64 C58 66, 38 72, 18 84 C40 80, 58 74, 68 68" />
        </g>

        {/* Contorno del ojo. */}
        <path
          d="M70 56 C80 40, 120 40, 130 56 C120 72, 80 72, 70 56 Z"
          stroke={glow}
          strokeWidth="2"
          fill={rgba(theme.glow, 0.06)}
        />

        {/* Iris. */}
        <circle cx="100" cy="56" r="13" fill="url(#ires-iris)">
          {!still && (
            <animate
              attributeName="r"
              values="13;15;13"
              dur="3.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              keyTimes="0;0.5;1"
            />
          )}
        </circle>
        <circle cx="100" cy="56" r="4.5" fill={core} />

        {/* Destello superior: le da volumen sin recurrir a un degradado pesado. */}
        <circle cx="104" cy="52" r="1.8" fill="#fff" opacity="0.85" />
      </g>

      {/* Arco inferior: cierra la composicion y sugiere una orbita. */}
      <path d="M52 88 C76 100, 124 100, 148 88" stroke={faint} strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
