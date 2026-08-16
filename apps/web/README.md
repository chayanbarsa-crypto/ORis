# IRES — Fase 1

Inteligencia financiera con interfaz espacial. Esta fase implementa el desbloqueo
por constelación: arquitectura, canvas, Piscis, patrón y campo estelar.

## Requisitos

Node.js 18.18 o superior. **No está instalado en este equipo**; instálalo antes de
continuar (`winget install OpenJS.NodeJS.LTS` o desde nodejs.org).

## Arranque

```bash
cd D:/OBSIDIAN/ires-app
npm install
npm run dev
```

Luego abre `http://localhost:3000`.

## Qué deberías ver

1. Fondo espacial con microestrellas a la deriva.
2. La constelación de Piscis en el centro, latiendo despacio en cian.
3. Al pasar el cursor, los nodos se iluminan.
4. Al arrastrar de nodo en nodo, se traza una línea con halo y partículas.
5. Patrón correcto → expansión de luz, el campo estelar se activa, y aparece la
   carcasa de la interfaz.
6. Patrón incorrecto → el trazo se tiñe de rojo y se reinicia solo.

**El patrón es el pez septentrional**: desde el nudo, hacia arriba.
`Alrescha → Omicron → Eta → Tau → Phi`. Se cambia en `lib/constellation/pisces.ts`.

## Estructura

```
app/                  layout, página y estilos globales
components/
  background/         campo estelar (canvas propio)
  chat/               hueco del chat (Fase 2)
  constellation/      Piscis interactiva
  finance/            sidebar financiero (Fase 2)
  ui/                 carcasa y badge de estado
  unlock/             pantalla de desbloqueo
hooks/                useCanvas, useReducedMotion
lib/
  ai/                 contratos de backend (sin implementación)
  constellation/      configuración, geometría y validación del patrón
  ires/               estados, emociones, tema y contexto global
  voice/              contratos y parser de comandos
types/                reexportación de tipos
```

## Reglas de la arquitectura

- **El color nunca se escribe en un componente.** Todo sale de `lib/ires/theme.ts`.
- **La lógica no vive en componentes.** Validar el patrón, proyectar coordenadas o
  interpretar comandos de voz son funciones puras en `lib/`.
- **Un canvas, un bucle.** Nada de un elemento React por estrella.
- **No se simula backend.** Lo que no existe está deshabilitado y dice que lo está.

## Estado de verificación

| | |
|---|---|
| `npm install` | ✅ 107 paquetes |
| `npm run typecheck` | ✅ sin errores |
| `npm run dev` | ✅ compila y sirve en 1,4 s |
| CSS de Tailwind | ✅ 138 reglas, layout correcto |
| Lógica (patrón, geometría, estados, voz) | ✅ 25 comprobaciones |
| **Render y animación del canvas** | ⚠️ **sin verificar** |

Lo visual no se ha podido comprobar: la verificación se hizo con el navegador en
segundo plano, y con la pestaña oculta `requestAnimationFrame` no dispara, así que
los canvas nunca llegan a pintar. Ábrelo en tu navegador para verlo de verdad.

**Arráncalo siempre desde este directorio** (`cd ires-app && npm run dev`). Lanzarlo
desde fuera funciona, pero es lo que destapó el problema de los globs de Tailwind
que documenta `tailwind.config.ts`.
