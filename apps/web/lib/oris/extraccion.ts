/**
 * La llamada al modelo que lee un extracto bancario.
 *
 * Es la única parte de ORis que no es determinista, y por eso está aislada aquí:
 * entra un PDF, sale un objeto que cumple `esquema-movimientos.json`, y todo lo
 * que decide si ese objeto es aceptable vive fuera, en `validacion.ts`.
 *
 * Tres decisiones que no son de estilo:
 *
 * 1. **El PDF va nativo, no como texto.** El modelo tiene que *ver* la
 *    maquetación: casi todos los bancos usan dos columnas (entrada / salida) con
 *    las cifras sin signo, y en texto plano se pierde de qué columna venía cada
 *    número. Un cargo transcrito como abono descuadra el extracto entero.
 *
 * 2. **Esquema estricto, no «devuélveme JSON».** Con `additionalProperties:
 *    false` y todo en `required`, la respuesta o encaja o la API la rechaza. Sin
 *    eso, un campo omitido llega como `undefined` y se convierte en un importe
 *    de cero que suma perfectamente y está mal.
 *
 * 3. **Streaming.** La respuesta puede acercarse a los 32.000 tokens y una
 *    petición no-streaming de ese tamaño supera el tiempo máximo de la conexión
 *    HTTP. Aquí no se usa para enseñar texto al vuelo, sino para que la llamada
 *    llegue a completarse.
 */

import type Anthropic from '@anthropic-ai/sdk';

import { cliente as clienteAnthropic, hayClave } from './anthropic';

import { ESQUEMA_MOVIMIENTOS, PROMPT_EXTRACCION } from './contratos';
import type { Extraccion } from './validacion';

export const MODELO = 'claude-opus-5';
export const MAX_TOKENS = 32_000;

/** Límites de la API para adjuntar un PDF nativo. */
const MAX_MB_PDF = 32;

export class ErrorExtraccion extends Error {
  constructor(
    message: string,
    /** Qué puede hacer quien lo lea. Vacío si no hay nada que hacer. */
    readonly sugerencia = '',
  ) {
    super(message);
    this.name = 'ErrorExtraccion';
  }
}

export function hayClaveIA(): boolean {
  return hayClave();
}

export async function extraer(pdf: Uint8Array, nombre: string): Promise<Extraccion> {
  if (!hayClave()) {
    throw new ErrorExtraccion(
      'No hay ANTHROPIC_API_KEY configurada, así que ORis no puede leer el PDF.',
      'Añádela en las variables de entorno y vuelve a desplegar.',
    );
  }

  const mb = pdf.byteLength / (1024 * 1024);
  if (mb > MAX_MB_PDF) {
    throw new ErrorExtraccion(
      `El PDF pesa ${mb.toFixed(1)} MB y el máximo son ${MAX_MB_PDF} MB.`,
      'Divídelo por meses y súbelo en varias veces.',
    );
  }

  const cliente = clienteAnthropic();

  const stream = cliente.messages.stream({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: PROMPT_EXTRACCION,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: Buffer.from(pdf).toString('base64'),
            },
          },
          {
            type: 'text',
            text:
              `Extrae todos los movimientos del extracto adjunto (${nombre}). ` +
              'Transcribe, no calcules.',
          },
        ],
      },
    ],
    // El esquema estricto viaja aquí, no en el prompt: así lo hace cumplir la
    // API en vez de depender de que el modelo se acuerde.
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: ESQUEMA_MOVIMIENTOS },
    },
    thinking: { type: 'adaptive' },
  } as Anthropic.MessageStreamParams);

  const respuesta = await stream.finalMessage();

  // Comprobar el motivo de parada ANTES de leer el contenido. Una respuesta
  // truncada por límite de tokens trae JSON a medias, y `JSON.parse` fallaría
  // con un error de sintaxis que no explica nada de lo que pasó de verdad.
  if (respuesta.stop_reason === 'refusal') {
    throw new ErrorExtraccion(
      'El modelo se negó a procesar este documento.',
      'Comprueba que el PDF es un extracto bancario.',
    );
  }
  if (respuesta.stop_reason === 'max_tokens') {
    throw new ErrorExtraccion(
      'El extracto es demasiado largo y la respuesta se cortó a medias.',
      'Súbelo partido por meses.',
    );
  }

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!texto.trim()) {
    throw new ErrorExtraccion('El modelo no devolvió contenido.');
  }

  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorExtraccion('La respuesta del modelo no es JSON válido.');
  }

  return comprobarForma(datos);
}

/**
 * Comprobación de forma, no de contenido.
 *
 * El esquema estricto ya lo garantiza en la API, pero esto es lo que separa un
 * `TypeError` en mitad de la ingesta de un mensaje que dice qué pasó. Barato, y
 * la alternativa es confiar en que nada cambie nunca al otro lado.
 */
function comprobarForma(datos: unknown): Extraccion {
  if (typeof datos !== 'object' || datos === null) {
    throw new ErrorExtraccion('La respuesta del modelo no es un objeto.');
  }
  const d = datos as Record<string, unknown>;

  if (!Array.isArray(d.movimientos)) {
    throw new ErrorExtraccion('La respuesta no trae la lista de movimientos.');
  }
  if (!Array.isArray(d.paginas_ilegibles)) {
    throw new ErrorExtraccion('La respuesta no trae paginas_ilegibles.');
  }

  for (const [i, m] of d.movimientos.entries()) {
    if (typeof m !== 'object' || m === null) {
      throw new ErrorExtraccion(`El movimiento ${i + 1} no es un objeto.`);
    }
    const mov = m as Record<string, unknown>;
    if (typeof mov.fecha !== 'string' || typeof mov.concepto !== 'string') {
      throw new ErrorExtraccion(`Al movimiento ${i + 1} le falta la fecha o el concepto.`);
    }
    if (typeof mov.importe !== 'string') {
      throw new ErrorExtraccion(`El importe del movimiento ${i + 1} no es una cadena.`);
    }
  }

  return datos as Extraccion;
}
