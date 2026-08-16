/**
 * Interpreta ordenes de voz en lenguaje natural.
 *
 * Vive aqui y no en el componente de chat a proposito: es logica pura y hay
 * que poder probarla sin montar interfaz.
 *
 * Fase 1 implementa el reconocimiento de las ordenes; quien las ejecuta
 * (motor de voz real) llega en la Fase 3.
 */

import type { VoiceCommand } from './types';

interface Rule {
  patterns: readonly string[];
  command: VoiceCommand;
}

const RULES: readonly Rule[] = [
  { patterns: ['solo habla', 'modo voz', 'hablame', 'háblame'], command: { kind: 'setMode', mode: 'VOICE_ONLY' } },
  { patterns: ['solo escribe', 'modo texto', 'silencio'], command: { kind: 'setMode', mode: 'TEXT_ONLY' } },
  { patterns: ['escribe y habla', 'texto y voz'], command: { kind: 'setMode', mode: 'TEXT_AND_VOICE' } },
  { patterns: ['leemelo', 'léemelo', 'lee eso'], command: { kind: 'speakLast' } },
  { patterns: ['calla', 'para de hablar'], command: { kind: 'stopSpeaking' } },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    // Propiedad Unicode en vez de un rango de caracteres combinantes
    // literales: esos se corrompen en cuanto el archivo cambia de encoding.
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve el comando reconocido o null si el texto es una frase corriente.
 * Comparar sobre el texto normalizado permite que "Háblame" y "hablame"
 * lleguen a la misma regla sin duplicarla.
 */
export function parseVoiceCommand(input: string): VoiceCommand | null {
  const text = normalize(input);
  if (!text) return null;

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (text === normalize(pattern)) return rule.command;
    }
  }
  return null;
}
