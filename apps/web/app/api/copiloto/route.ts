/**
 * El copiloto: preguntar sobre tus propios movimientos.
 *
 * Tres decisiones que definen lo que este endpoint puede y no puede hacer:
 *
 * **1. El modelo no ve la base de datos, ve herramientas.** No genera SQL ni
 * recibe un volcado de movimientos en el prompt. Llama a funciones que ya
 * estaban escritas y probadas —las mismas que pinta el panel— y recibe cifras
 * calculadas. Así el chat no puede dar un total distinto del de la pantalla de
 * al lado, que es la forma más rápida de que nadie vuelva a fiarse de ninguno
 * de los dos.
 *
 * **2. Una foto de datos por petición.** Los movimientos se leen una vez, al
 * principio, y todas las herramientas trabajan sobre ese mismo array. Dos
 * preguntas seguidas dentro de una respuesta no pueden contestar sobre estados
 * distintos de la base de datos.
 *
 * **3. Bucle manual en vez del `tool_runner` del SDK.** El runner devuelve el
 * mensaje final; aquí hacen falta los deltas según se generan **y** un aviso al
 * navegador cada vez que se consulta algo, para que se vea qué está mirando en
 * lugar de un punto parpadeando. Ese transporte es exactamente el caso en el
 * que la documentación del SDK admite bajar al bucle manual.
 */

import Anthropic from '@anthropic-ai/sdk';

import { cliente as clienteAnthropic, hayClave } from '@/lib/oris/anthropic';
import { cargarMovimientos } from '@/lib/oris/cargar';
import { HERRAMIENTAS, ejecutar, mesMasReciente } from '@/lib/oris/copiloto';
import { nombreMes } from '@/lib/oris/dinero';

export const runtime = 'nodejs';
/**
 * Sesenta segundos, que es el techo del plan gratuito de Vercel.
 *
 * Pedir más aquí no alarga nada: hace fallar el despliegue entero por una
 * función. Con ocho vueltas de herramientas y respuestas cortas sobra; si algún
 * día no sobrara, lo que hay que subir es el plan, no este número.
 */
export const maxDuration = 60;

const MODELO = 'claude-opus-5';
const MAX_TOKENS = 8_000;

/**
 * Tope de vueltas al bucle.
 *
 * No es un presupuesto de coste: es la red que evita que un fallo de
 * razonamiento encadene llamadas hasta agotar la cuenta. Ocho da margen de
 * sobra —la pregunta más rebuscada usa tres o cuatro— y corta en seco lo que
 * sería un bucle infinito facturado.
 */
const MAX_VUELTAS = 8;

/** Cuántos mensajes de historia se aceptan. Lo viejo se cae por delante. */
const MAX_HISTORIA = 20;

export async function POST(req: Request) {
  if (!hayClave()) {
    return Response.json(
      {
        mensaje:
          'No hay ANTHROPIC_API_KEY configurada, así que el copiloto no puede pensar. ' +
          'Añádela en las variables de entorno y vuelve a desplegar.',
      },
      { status: 503 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ mensaje: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  const { mensajes } = (cuerpo ?? {}) as { mensajes?: unknown };
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return Response.json({ mensaje: 'No hay nada que responder.' }, { status: 400 });
  }

  const historia: Anthropic.MessageParam[] = mensajes
    .slice(-MAX_HISTORIA)
    .filter(
      (m): m is { rol: 'user' | 'assistant'; texto: string } =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as { texto?: unknown }).texto === 'string' &&
        ((m as { rol?: unknown }).rol === 'user' || (m as { rol?: unknown }).rol === 'assistant'),
    )
    .map((m) => ({ role: m.rol, content: m.texto.slice(0, 4000) }));

  if (historia.length === 0 || historia[historia.length - 1].role !== 'user') {
    return Response.json({ mensaje: 'El último mensaje tiene que ser tuyo.' }, { status: 400 });
  }

  const { movimientos, motivo } = await cargarMovimientos(2000);

  const codificador = new TextEncoder();
  const flujo = new ReadableStream({
    async start(control) {
      const enviar = (dato: unknown) =>
        control.enqueue(codificador.encode(`data: ${JSON.stringify(dato)}\n\n`));

      try {
        const cliente = clienteAnthropic();
        const conversacion: Anthropic.MessageParam[] = [...historia];

        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
          const stream = cliente.messages.stream({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            system: sistema(movimientos.length, mesMasReciente(movimientos), motivo),
            thinking: { type: 'adaptive' },
            tools: HERRAMIENTAS,
            messages: conversacion,
          });

          stream.on('text', (delta) => enviar({ tipo: 'texto', texto: delta }));

          const mensaje = await stream.finalMessage();

          if (mensaje.stop_reason === 'pause_turn') {
            conversacion.push({ role: 'assistant', content: mensaje.content });
            continue;
          }
          if (mensaje.stop_reason !== 'tool_use') break;

          const llamadas = mensaje.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );
          conversacion.push({ role: 'assistant', content: mensaje.content });

          // Todos los `tool_result` en UN solo mensaje de usuario. Repartirlos
          // en varios le enseña al modelo a dejar de pedir cosas en paralelo.
          const resultados: Anthropic.ToolResultBlockParam[] = llamadas.map((ll) => {
            enviar({ tipo: 'herramienta', nombre: ll.name });
            const salida = ejecutar(ll.name, ll.input, movimientos);
            return {
              type: 'tool_result',
              tool_use_id: ll.id,
              content: JSON.stringify(salida),
            };
          });

          conversacion.push({ role: 'user', content: resultados });
        }

        enviar({ tipo: 'fin' });
      } catch (e) {
        console.error('[copiloto] fallo', e);
        enviar({ tipo: 'error', mensaje: explicar(e) });
      } finally {
        control.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

/**
 * Qué puede afirmar el copiloto.
 *
 * La regla del proyecto entera cabe en la primera línea: las cifras las pone el
 * código. Todo lo demás son consecuencias de eso.
 */
function sistema(cuantos: number, mesReciente: string | null, motivo: string | null): string {
  return [
    'Eres ORis, el copiloto financiero de quien te escribe. Hablas español de España,',
    'directo y sin florituras. Tuteas.',
    '',
    'REGLA PRINCIPAL: no calculas dinero. Ninguna cifra sale de tu cabeza — todas salen',
    'de las herramientas. Cita los importes usando el campo `texto` tal cual viene',
    '(«1.234,56 €»), nunca reformatees ni redondees tú. Si te falta una cifra y ninguna',
    'herramienta la da, dilo en vez de estimarla.',
    '',
    'Antes de dar porcentajes o repartos, comprueba con `estado_datos` si queda algo sin',
    'categorizar, y avísalo: los totales son correctos igual, pero el reparto puede moverse.',
    '',
    'Los traspasos entre cuentas propias no son ingreso ni gasto. Si alguien pregunta por',
    'qué sus ingresos parecen bajos, ésa suele ser la razón.',
    '',
    'La previsión es una media prolongada en línea recta. Puedes darla, pero di siempre',
    'que responde a «si nada cambia» y que no sabe de pagas extra ni de meses caros.',
    '',
    'No des consejo de inversión ni fiscal. Puedes señalar lo que ves en los datos —una',
    'suscripción que se repite, un mes que se sale de la media— y ahí paras.',
    '',
    'Respuestas cortas: dos o tres frases y, si hace falta, una lista breve. Nada de',
    'repetir la pregunta ni de preámbulos.',
    '',
    cuantos === 0
      ? `AHORA MISMO NO HAY DATOS CARGADOS. ${motivo ?? 'No hay ningún extracto importado.'} ` +
        'Dilo y explica que hace falta subir un extracto; no inventes ejemplos.'
      : `Hay ${cuantos} movimientos cargados. El mes más reciente con datos es ` +
        `${mesReciente ? nombreMes(mesReciente) : 'desconocido'}: cuando alguien diga «este mes» ` +
        'o «el mes pasado», cuenta desde ahí y no desde la fecha de hoy.',
  ].join('\n');
}

/** El texto que manda Anthropic dentro del error, recortado. */
function mensajeDeLaApi(e: InstanceType<typeof Anthropic.APIError>): string | null {
  const cuerpo = e.error as { error?: { message?: unknown } } | undefined;
  const mensaje = cuerpo?.error?.message;
  if (typeof mensaje !== 'string' || mensaje.trim() === '') return null;
  return mensaje.length > 300 ? `${mensaje.slice(0, 300)}…` : mensaje;
}

function explicar(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) {
    return 'La API va saturada ahora mismo. Prueba dentro de un momento.';
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return 'La ANTHROPIC_API_KEY no vale. Revísala en las variables de entorno.';
  }
  // `APIConnectionError` va antes que `APIError` porque hereda de ella: al
  // revés, todo fallo de red se contaría como respuesta del servidor.
  if (e instanceof Anthropic.APIConnectionError) {
    return 'No he podido llegar a la API. Puede ser la conexión.';
  }
  if (e instanceof Anthropic.APIError) {
    // El motivo, cuando la API lo da.
    //
    // Antes aquí sólo iba el código, por prudencia con lo que pudiera traer el
    // cuerpo. Salió mal: un 400 puede ser el saldo agotado o un esquema que no
    // le gusta, y «respondió 400» no distingue entre pagar y arreglar código.
    // El mensaje de Anthropic no lleva la petición, sólo qué está mal, así que
    // se enseña recortado.
    const detalle = mensajeDeLaApi(e);
    const cabeza = `La API respondió ${e.status ?? 'con un error'}`;
    return detalle ? `${cabeza}: ${detalle}` : `${cabeza}. No he podido contestar.`;
  }
  return 'Algo ha fallado por dentro y no he podido contestar.';
}
