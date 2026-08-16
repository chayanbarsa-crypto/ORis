'use client';

/**
 * Constelacion de Piscis interactiva.
 *
 * Todo el dibujo ocurre en un unico canvas y un unico bucle. El estado del
 * trazo vive en refs, no en useState: el bucle de animacion corre a 60 Hz y
 * un setState por frame provocaria 60 renders de React por segundo para nada.
 * Solo se sincroniza a React lo que la interfaz necesita ver (el resultado
 * del patron), y eso ocurre como mucho una vez por intento.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCanvas, type FrameInfo } from '@/hooks/useCanvas';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useIres } from '@/lib/ires/context';
import { IRES_THEME, rgba, themeFor } from '@/lib/ires/theme';
import { PISCES_EDGES, PISCES_NODES } from '@/lib/constellation/pisces';
import {
  fitToCanvas,
  findNodeAt,
  pointerToCanvas,
  projectNodes,
  type ProjectedNode,
} from '@/lib/constellation/geometry';
import {
  MIN_PATTERN_LENGTH,
  appendNode,
  validatePattern,
  type PatternResult,
} from '@/lib/constellation/unlockPattern';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  emotionIndex: number;
}

const EMOTIONS = Object.keys(IRES_THEME) as (keyof typeof IRES_THEME)[];
const ERROR_RESET_MS = 900;

export interface PiscesConstellationProps {
  /** Si false, la constelacion se dibuja pero no acepta trazos. */
  interactive?: boolean;
  onUnlock?: () => void;
  /** Se dispara con cada patron incorrecto. La pantalla lleva la cuenta. */
  onFail?: () => void;
  /** Progreso del despertar, 0..1. Lo controla la pantalla de desbloqueo. */
  awakenProgress?: number;
}

export function PiscesConstellation({
  interactive = true,
  onUnlock,
  onFail,
  awakenProgress = 0,
}: PiscesConstellationProps) {
  const { theme, profile } = useIres();
  const reduced = useReducedMotion();

  // Estado del trazo: solo refs, leidas por el bucle de dibujo.
  const pathRef = useRef<string[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const resultRef = useRef<PatternResult>('incomplete');
  const particlesRef = useRef<Particle[]>([]);
  const projectedRef = useRef<ProjectedNode[]>([]);
  const hoverRef = useRef<string | null>(null);
  // Radio de acierto en pixeles. Lo fija el bucle de dibujo a partir del
  // tamano real del canvas: un radio fijo seria enorme en movil y ridiculo
  // en un monitor grande.
  const hitRadiusRef = useRef(26);

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const awakenRef = useRef(awakenProgress);
  awakenRef.current = awakenProgress;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  // Lo unico que se refleja en React: sirve para el texto de ayuda.
  const [result, setResult] = useState<PatternResult>('incomplete');
  const [pathLength, setPathLength] = useState(0);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPath = useCallback(() => {
    pathRef.current = [];
    resultRef.current = 'incomplete';
    setResult('incomplete');
    setPathLength(0);
  }, []);

  const spawnParticles = useCallback((node: ProjectedNode, count: number) => {
    const emotionIndex = EMOTIONS.indexOf(node.emotion);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 46;
      particlesRef.current.push({
        x: node.px,
        y: node.py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.7,
        emotionIndex: emotionIndex < 0 ? 0 : emotionIndex,
      });
    }
    // Techo duro: sin el, mantener el dedo sobre un nodo llenaria el array
    // sin limite y el frame acabaria cayendo.
    if (particlesRef.current.length > 400) {
      particlesRef.current.splice(0, particlesRef.current.length - 400);
    }
  }, []);

  const tryAppend = useCallback(
    (point: { x: number; y: number }) => {
      const nodes = projectedRef.current;
      if (nodes.length === 0) return;
      const hit = findNodeAt(point, nodes, hitRadiusRef.current);
      hoverRef.current = hit ? hit.id : null;
      if (!hit) return;

      const next = appendNode(pathRef.current, hit.id);
      if (next.length !== pathRef.current.length) {
        pathRef.current = next;
        setPathLength(next.length);
        if (!reducedRef.current) spawnParticles(hit, 12);
      }
    },
    [spawnParticles],
  );

  const finishPattern = useCallback(() => {
    drawingRef.current = false;
    pointerRef.current = null;

    const path = pathRef.current;
    if (path.length < MIN_PATTERN_LENGTH) {
      clearPath();
      return;
    }

    const outcome = validatePattern(path);
    resultRef.current = outcome;
    setResult(outcome);

    if (outcome === 'valid') {
      onUnlock?.();
      return;
    }

    onFail?.();
    // Reinicio automatico tras un patron incorrecto.
    resetTimer.current = setTimeout(clearPath, ERROR_RESET_MS);
  }, [clearPath, onUnlock, onFail]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactiveRef.current || resultRef.current === 'valid') return;
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
      if (resultRef.current === 'invalid') clearPath();

      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = pointerToCanvas(e, e.currentTarget);
      pointerRef.current = p;
      tryAppend(p);
    },
    [clearPath, tryAppend],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactiveRef.current) return;
      const p = pointerToCanvas(e, e.currentTarget);
      if (!drawingRef.current) {
        // Sin arrastrar solo se resalta el nodo bajo el cursor.
        const hit = findNodeAt(p, projectedRef.current, 26);
        hoverRef.current = hit ? hit.id : null;
        return;
      }
      pointerRef.current = p;
      tryAppend(p);
    },
    [tryAppend],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactiveRef.current || !drawingRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      finishPattern();
    },
    [finishPattern],
  );

  const canvasRef = useCanvas((frame: FrameInfo) => {
    const { ctx, width, height, time, delta } = frame;
    const th = themeRef.current;
    const p = profileRef.current;
    const quiet = reducedRef.current;
    const awaken = awakenRef.current;
    const path = pathRef.current;
    const outcome = resultRef.current;

    ctx.clearRect(0, 0, width, height);

    // La escala crece ligeramente durante el despertar.
    const projection = fitToCanvas(width, height, 0.14 - awaken * 0.02);
    const nodes = projectNodes(PISCES_NODES, projection);
    projectedRef.current = nodes;
    const unit = projection.scale;
    // Generoso en pantallas pequenas, acotado para que no se solapen nodos.
    hitRadiusRef.current = Math.max(20, Math.min(44, unit * 0.055));

    const pulse = quiet ? 0 : Math.sin(time * Math.PI * 2 * p.pulseSpeed) * 0.5 + 0.5;
    const glow = p.glow * (0.75 + pulse * 0.25) * (1 + awaken * 1.2);

    const errorTint = outcome === 'invalid';
    const lineColor = errorTint ? IRES_THEME.risk.line : th.line;
    const glowColor = errorTint ? IRES_THEME.risk.glow : th.glow;

    // --- aristas de fondo ---
    ctx.lineWidth = Math.max(1, unit * 0.0022);
    for (const edge of PISCES_EDGES) {
      const a = nodes.find((n) => n.id === edge.from);
      const b = nodes.find((n) => n.id === edge.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.strokeStyle = rgba(lineColor, 0.1 + awaken * 0.45);
      ctx.stroke();
    }

    // --- trazo del usuario ---
    if (path.length > 0) {
      const pts = path
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is ProjectedNode => Boolean(n));

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, unit * 0.006);

      ctx.beginPath();
      ctx.moveTo(pts[0].px, pts[0].py);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].px, pts[i].py);

      const live = pointerRef.current;
      if (drawingRef.current && live) ctx.lineTo(live.x, live.y);

      ctx.shadowBlur = 18 * glow;
      ctx.shadowColor = rgba(glowColor, 0.8);
      ctx.strokeStyle = rgba(lineColor, 0.9);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // --- nodos ---
    for (const node of nodes) {
      const inPath = path.includes(node.id);
      const isHover = hoverRef.current === node.id;
      const nodeTheme = errorTint ? IRES_THEME.risk : themeFor(node.emotion);

      const baseR = unit * (0.006 + node.magnitude * 0.007);
      const r = baseR * (1 + (inPath ? 0.5 : 0) + (isHover ? 0.25 : 0) + awaken * 0.4);
      const intensity = inPath ? 1 : isHover ? 0.7 : 0.34;

      // Halo
      const haloR = r * (3.4 + pulse * 0.6 + awaken * 2.2);
      const grad = ctx.createRadialGradient(node.px, node.py, 0, node.px, node.py, haloR);
      grad.addColorStop(0, rgba(nodeTheme.glow, 0.42 * intensity * glow));
      grad.addColorStop(1, rgba(nodeTheme.glow, 0));
      ctx.beginPath();
      ctx.arc(node.px, node.py, haloR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Nucleo
      ctx.beginPath();
      ctx.arc(node.px, node.py, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(nodeTheme.core, 0.55 + intensity * 0.45);
      ctx.fill();

      // Anillo de los nodos ya trazados
      if (inPath) {
        ctx.beginPath();
        ctx.arc(node.px, node.py, r * 2.1, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(nodeTheme.glow, 0.55);
        ctx.lineWidth = Math.max(1, unit * 0.0018);
        ctx.stroke();
      }
    }

    // --- particulas ---
    const parts = particlesRef.current;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life += delta;
      if (q.life >= q.maxLife) {
        parts.splice(i, 1);
        continue;
      }
      q.x += q.vx * delta;
      q.y += q.vy * delta;
      q.vx *= 0.96;
      q.vy *= 0.96;

      const k = 1 - q.life / q.maxLife;
      const emotion = EMOTIONS[q.emotionIndex] ?? 'neutral';
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(0.4, unit * 0.0022 * k), 0, Math.PI * 2);
      ctx.fillStyle = rgba(IRES_THEME[emotion].particle, k * 0.75);
      ctx.fill();
    }

    // --- expansion de luz del despertar ---
    if (awaken > 0.001) {
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.hypot(width, height) * 0.6;
      const ringR = awaken * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(glowColor, (1 - awaken) * 0.5);
      ctx.lineWidth = Math.max(1, unit * 0.004 * (1 - awaken));
      ctx.stroke();

      const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      wash.addColorStop(0, rgba(glowColor, awaken * (1 - awaken) * 0.5));
      wash.addColorStop(1, rgba(glowColor, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);
    }
  });

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor: interactive ? 'crosshair' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Constelación de Piscis. Traza el patrón para despertar a IRES."
      />
      <ConstellationStatus result={result} length={pathLength} />
    </div>
  );
}

/** Texto accesible del estado del trazo. Fuera del canvas, que no lo lee nadie. */
function ConstellationStatus({ result, length }: { result: PatternResult; length: number }) {
  const message =
    result === 'valid'
      ? 'Patrón reconocido. Despertando a IRES.'
      : result === 'invalid'
        ? 'Patrón no reconocido.'
        : length > 0
          ? `${length} nodos enlazados.`
          : 'Sistema bloqueado.';

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message}
    </p>
  );
}
