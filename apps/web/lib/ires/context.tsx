'use client';

/**
 * Estado global de IRES.
 *
 * Context + useReducer en vez de una libreria externa: el estado es pequeno
 * y las transiciones son explicitas. Si en fases posteriores crece (chat,
 * documentos, cartera), este es el punto por el que se sustituye.
 */

import { createContext, useContext, useMemo, useReducer, useCallback } from 'react';
import type { ReactNode } from 'react';
import { STATE_PROFILE, type IresEmotion, type IresState, type StateProfile } from './state';
import { themeFor, type EmotionTheme } from './theme';

interface IresContextValue {
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
}

type Action =
  | { type: 'setState'; state: IresState }
  | { type: 'setEmotion'; emotion: IresEmotion | null };

function reducer(prev: InternalState, action: Action): InternalState {
  switch (action.type) {
    case 'setState':
      // Cambiar de estado limpia el tono forzado: si no, un "alert" antiguo
      // tenirian de rojo estados posteriores que ya no lo son.
      return { state: action.state, emotionOverride: null };
    case 'setEmotion':
      return { ...prev, emotionOverride: action.emotion };
    default:
      return prev;
  }
}

const IresContext = createContext<IresContextValue | null>(null);

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
  });

  const setState = useCallback((next: IresState) => {
    dispatch({ type: 'setState', state: next });
  }, []);

  const setEmotion = useCallback((next: IresEmotion | null) => {
    dispatch({ type: 'setEmotion', emotion: next });
  }, []);

  const value = useMemo<IresContextValue>(() => {
    const profile = STATE_PROFILE[internal.state];
    const emotion = internal.emotionOverride ?? profile.emotion;
    return { state: internal.state, emotion, profile, theme: themeFor(emotion), setState, setEmotion };
  }, [internal, setState, setEmotion]);

  return <IresContext.Provider value={value}>{children}</IresContext.Provider>;
}

export function useIres(): IresContextValue {
  const ctx = useContext(IresContext);
  if (!ctx) throw new Error('useIres debe usarse dentro de <IresProvider>');
  return ctx;
}
