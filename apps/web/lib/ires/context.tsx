'use client';

/**
 * Estado global de IRES.
 *
 * Context + useReducer en vez de una libreria externa: el estado es pequeno
 * y las transiciones son explicitas. Si en fases posteriores crece (chat,
 * documentos, cartera), este es el punto por el que se sustituye.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, useCallback } from 'react';
import type { ReactNode } from 'react';
import { STATE_PROFILE, type IresEmotion, type IresState, type StateProfile } from './state';
import { themeFor, type EmotionTheme } from './theme';

interface IresContextValue {
  /**
   * ¿Está abierta la puerta?
   *
   * Separado de `state` a propósito, y no es un detalle: eran lo mismo, y eso
   * significaba que ORis no podía ponerse a «analizar» sin devolverte a la
   * constelación. Cualquier actividad que no fuera reposo te echaba fuera.
   *
   * Ahora `desbloqueado` dice si has entrado y `state` dice qué está haciendo.
   */
  desbloqueado: boolean;
  /** Abre la puerta. La llama la pantalla de desbloqueo al terminar. */
  abrir(): void;
  state: IresState;
  /** Emocion efectiva: la del estado, salvo que se haya forzado otra. */
  emotion: IresEmotion;
  profile: StateProfile;
  theme: EmotionTheme;
  setState(next: IresState): void;
  /** Fuerza un tono sin cambiar de estado. `null` vuelve al de por defecto. */
  setEmotion(next: IresEmotion | null): void;
}

interface InternalState {
  state: IresState;
  emotionOverride: IresEmotion | null;
  desbloqueado: boolean;
}

type Action =
  | { type: 'setState'; state: IresState }
  | { type: 'setEmotion'; emotion: IresEmotion | null }
  | { type: 'abrir' };

function reducer(prev: InternalState, action: Action): InternalState {
  switch (action.type) {
    case 'setState':
      // Cambiar de estado limpia el tono forzado: si no, un "alert" antiguo
      // tenirian de rojo estados posteriores que ya no lo son.
      return { ...prev, state: action.state, emotionOverride: null };
    case 'setEmotion':
      return { ...prev, emotionOverride: action.emotion };
    case 'abrir':
      return { ...prev, desbloqueado: true };
    default:
      return prev;
  }
}

const IresContext = createContext<IresContextValue | null>(null);

/** Dónde se recuerda que la puerta ya se abrió en esta pestaña. */
const CLAVE_ABIERTA = 'oris:desbloqueado';

export function IresProvider({
  children,
  initialState = 'locked',
}: {
  children: ReactNode;
  initialState?: IresState;
}) {
  const [internal, dispatch] = useReducer(reducer, {
    state: initialState,
    emotionOverride: null,
    desbloqueado: false,
  });

  /**
   * Se recuerda que ya entraste, mientras la pestaña siga abierta.
   *
   * Antes, cualquier recarga —incluida la que hace la propia aplicación al
   * guardar un extracto— te devolvía a trazar la constelación. Una puerta
   * bonita se vuelve un peaje si la cruzas diez veces seguidas.
   *
   * En `sessionStorage` y no en `localStorage`: al cerrar la pestaña vuelve a
   * cerrarse. Y no es un mecanismo de seguridad — nunca lo fue: la constelación
   * corre en el navegador y protege tanto como una cortina. Lo que protege de
   * verdad es el login del servidor, que llega en su fase.
   *
   * Se restaura en un efecto y no al inicializar para que el servidor y el
   * navegador pinten lo mismo en el primer render: si no, React encuentra dos
   * árboles distintos y descarta el suyo.
   */
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAVE_ABIERTA) === '1') {
        dispatch({ type: 'abrir' });
        dispatch({ type: 'setState', state: 'idle' });
      }
    } catch {
      // Navegación privada o almacenamiento bloqueado: se entra por la puerta.
    }
  }, []);

  const abrir = useCallback(() => {
    dispatch({ type: 'abrir' });
    try {
      sessionStorage.setItem(CLAVE_ABIERTA, '1');
    } catch {
      // Que no se pueda recordar no impide abrir.
    }
  }, []);

  const setState = useCallback((next: IresState) => {
    dispatch({ type: 'setState', state: next });
  }, []);

  const setEmotion = useCallback((next: IresEmotion | null) => {
    dispatch({ type: 'setEmotion', emotion: next });
  }, []);

  const value = useMemo<IresContextValue>(() => {
    const profile = STATE_PROFILE[internal.state];
    const emotion = internal.emotionOverride ?? profile.emotion;
    return {
      desbloqueado: internal.desbloqueado,
      abrir,
      state: internal.state,
      emotion,
      profile,
      theme: themeFor(emotion),
      setState,
      setEmotion,
    };
  }, [internal, abrir, setState, setEmotion]);

  return <IresContext.Provider value={value}>{children}</IresContext.Provider>;
}

export function useIres(): IresContextValue {
  const ctx = useContext(IresContext);
  if (!ctx) throw new Error('useIres debe usarse dentro de <IresProvider>');
  return ctx;
}
