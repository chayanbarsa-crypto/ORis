'use client';

/**
 * Canvas con bucle de animacion.
 *
 * Resuelve de una vez las cuatro cosas que siempre se hacen mal en canvas:
 *   1. DPR: se escala el buffer por devicePixelRatio y se dibuja en unidades
 *      CSS, o en pantallas retina todo sale borroso.
 *   2. Resize: ResizeObserver en vez de window.onresize, porque el canvas
 *      puede cambiar de tamano sin que cambie la ventana (sidebar, layout).
 *   3. Limpieza: se cancela el frame al desmontar. Sin esto, cada montaje en
 *      React Strict Mode deja un bucle huerfano corriendo para siempre.
 *   4. Delta time: se dibuja en funcion del tiempo real, no del numero de
 *      frames, para que la animacion vaya igual a 60 que a 144 Hz.
 *
 * El callback de dibujo se guarda en una ref para que cambiarlo no reinicie
 * el bucle: si dependiera del render, cada cambio de estado cortaria la
 * animacion a la mitad.
 */

import { useEffect, useRef } from 'react';

export interface FrameInfo {
  ctx: CanvasRenderingContext2D;
  /** Ancho y alto en pixeles CSS. */
  width: number;
  height: number;
  /** Segundos desde el montaje. */
  time: number;
  /** Segundos desde el frame anterior, acotado para evitar saltos al volver de otra pestana. */
  delta: number;
}

export function useCanvas(
  draw: (frame: FrameInfo) => void,
  options: { paused?: boolean } = {},
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const pausedRef = useRef(options.paused ?? false);
  pausedRef.current = options.paused ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let start = 0;
    let last = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (start === 0) {
        start = now;
        last = now;
      }
      if (pausedRef.current || width === 0) return;

      const time = (now - start) / 1000;
      // Acotado a 50 ms: al volver de una pestana en segundo plano el delta
      // puede ser de varios segundos y todo saltaria de golpe.
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;

      drawRef.current({ ctx, width, height, time, delta });
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return canvasRef;
}
