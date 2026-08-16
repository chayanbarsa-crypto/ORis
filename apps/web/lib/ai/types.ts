/**
 * Contratos de la capa de IA. Sin implementacion todavia.
 *
 * `IresBackend` es la unica frontera que la interfaz conoce. Cuando exista
 * backend (Fase 7) se implementa esta interfaz y nada del resto de la
 * aplicacion cambia. Mientras tanto no hay ninguna implementacion falsa:
 * simular respuestas haria imposible distinguir despues lo conectado de lo
 * inventado.
 */

import type { IresEmotion } from '../ires/state';

export type MessageRole = 'user' | 'ires';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  /** Tono con el que IRES responde; alimenta el estado visual. */
  emotion?: IresEmotion;
}

export interface IresResponse {
  message: ChatMessage;
  /** Alertas financieras detectadas, si las hay. */
  alerts?: readonly string[];
}

export interface IresBackend {
  send(messages: readonly ChatMessage[]): Promise<IresResponse>;
}
