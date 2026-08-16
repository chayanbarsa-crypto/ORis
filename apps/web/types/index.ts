/**
 * Punto unico de importacion de tipos para consumidores externos.
 * Evita que los componentes tengan que conocer la ruta interna de cada modulo.
 */

export type { IresState, IresEmotion, StateProfile } from '@/lib/ires/state';
export type { EmotionTheme, RGB } from '@/lib/ires/theme';
export type { IRESNode, IRESEdge } from '@/lib/constellation/pisces';
export type { Point, Projection, ProjectedNode } from '@/lib/constellation/geometry';
export type { PatternResult } from '@/lib/constellation/unlockPattern';
export type { VoiceMode, VoiceCommand, SpeechAdapter } from '@/lib/voice/types';
export type { ChatMessage, IresResponse, IresBackend, MessageRole } from '@/lib/ai/types';
export type { FinanceSection } from '@/components/finance/FinanceSidebar';
