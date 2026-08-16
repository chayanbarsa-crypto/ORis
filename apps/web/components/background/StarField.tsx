'use client';

/**
 * Campo estelar de fondo.
 *
 * Canvas propio y separado del de la constelacion: son dos capas con ritmos
 * distintos y mezclarlas obligaria a repintar las estrellas cada vez que se
 * mueve el dedo sobre un nodo.
 *
 * Las estrellas viven en un array plano de objetos creados una sola vez. Ni
 * un solo elemento React por estrella: 260 nodos del DOM parpadeando a 60 Hz
 * es exactamente lo que hay que evitar.
 */

import { useMemo, useRef } from 'react';
import { useCanvas, type FrameInfo } from '@/hooks/useCanvas';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useIres } from '@/lib/ires/context';
import { rgba, SPACE } from '@/lib/ires/theme';

interface Star {
  /** Posicion relativa 0..1: sobrevive a los cambios de tamano. */
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  /** Fase y velocidad de parpadeo, distintas por estrella. */
  phase: number;
  twinkle: number;
  /** Deriva lentisima, en unidades relativas por segundo. */
  vx: number;
  vy: number;
}

const STAR_COUNT = 260;

function createStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      // Mayoria diminutas y unas pocas algo mayores: un campo uniforme
      // parece ruido, no un cielo.
      radius: Math.random() < 0.86 ? 0.4 + Math.random() * 0.5 : 1.0 + Math.random() * 0.7,
      baseAlpha: 0.18 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.15 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * 0.004,
      vy: (Math.random() - 0.5) * 0.004,
    });
  }
  return stars;
}

export function StarField() {
  const { profile, theme } = useIres();
  const reduced = useReducedMotion();

  const stars = useMemo(() => createStars(STAR_COUNT), []);

  // El perfil se lee dentro del bucle a traves de refs: si el draw dependiera
  // de ellos, cada cambio de estado recrearia el callback en cada frame.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const canvasRef = useCanvas((frame: FrameInfo) => {
    const { ctx, width, height, time, delta } = frame;
    const p = profileRef.current;
    const th = themeRef.current;
    const quiet = reducedRef.current;

    ctx.clearRect(0, 0, width, height);

    // Velo de color hacia el tono actual: es lo que hace que el fondo
    // "reaccione" al estado sin volverse una discoteca.
    const tint = Math.min(0.09, 0.02 + p.starActivity * 0.035);
    ctx.fillStyle = rgba(th.glow, tint);
    ctx.fillRect(0, 0, width, height);

    const activity = quiet ? 0 : p.starActivity;

    for (const s of stars) {
      if (!quiet) {
        s.x += s.vx * delta * activity;
        s.y += s.vy * delta * activity;
        // Envolver en vez de reaparecer al azar: evita parpadeos bruscos.
        if (s.x < 0) s.x += 1;
        else if (s.x > 1) s.x -= 1;
        if (s.y < 0) s.y += 1;
        else if (s.y > 1) s.y -= 1;
      }

      const flicker = quiet
        ? 0
        : Math.sin(time * s.twinkle * (1 + activity * 0.8) + s.phase) * 0.28 * activity;
      const alpha = Math.max(0.04, Math.min(1, s.baseAlpha + flicker));

      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = rgba(SPACE.star, alpha);
      ctx.fill();
    }

    // Onda expansiva de los estados que procesan. Una sola, muy tenue.
    if (p.waves && !quiet) {
      const period = 3.4;
      const t = (time % period) / period;
      const maxR = Math.hypot(width, height) * 0.55;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, t * maxR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(th.glow, (1 - t) * 0.1);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
