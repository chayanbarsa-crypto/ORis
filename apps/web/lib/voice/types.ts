/**
 * Contratos del sistema de voz. Fase 3 los implementa.
 *
 * Se declaran ya porque el modo de voz afecta al estado de IRES (listening,
 * speaking) y al chat, y es mejor que esos componentes dependan de un tipo
 * estable desde el principio que reescribirlos cuando llegue la voz.
 */

export type VoiceMode = 'TEXT_ONLY' | 'VOICE_ONLY' | 'TEXT_AND_VOICE';

export const DEFAULT_VOICE_MODE: VoiceMode = 'TEXT_ONLY';

/** Comandos naturales que el parser reconocera. */
export type VoiceCommand =
  | { kind: 'setMode'; mode: VoiceMode }
  | { kind: 'speakLast' }
  | { kind: 'stopSpeaking' };

export interface SpeechAdapter {
  isSupported(): boolean;
  startListening(onResult: (transcript: string, final: boolean) => void): void;
  stopListening(): void;
  speak(text: string): Promise<void>;
  cancel(): void;
}
