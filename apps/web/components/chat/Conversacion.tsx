'use client';

/**
 * La conversación con ORis.
 *
 * Lo que se enseña mientras piensa no es decoración: **se dice qué está
 * mirando**. «Consultando el resumen de mayo» convierte la espera en algo que
 * se entiende, y de paso deja ver de dónde va a salir la cifra que responda.
 * Un punto girando no dice nada y, en una herramienta de dinero, no decir nada
 * se parece demasiado a inventar.
 *
 * El texto llega en trozos por SSE y se pinta según llega. No hay markdown ni
 * resaltado: los importes vienen ya formateados del servidor y lo único que
 * hace falta es respetar los saltos de línea.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { IresEye } from '@/components/ui/IresEye';
import { LectorEventos } from '@/lib/oris/sse';

export interface Turno {
  rol: 'user' | 'assistant';
  texto: string;
}

/** Cómo se llama en castellano lo que está haciendo por dentro. */
const EN_CURSO: Record<string, string> = {
  estado_datos: 'Mirando qué tienes cargado',
  resumen_mes: 'Sacando el resumen del mes',
  gasto_por_categoria: 'Repartiendo el gasto por categoría',
  ingresos_por_origen: 'Viendo de dónde viene el dinero',
  movimientos_mayores: 'Buscando los movimientos más grandes',
  traspasos_mes: 'Revisando los traspasos',
  serie_y_prevision: 'Calculando la evolución y la previsión',
  buscar_movimientos: 'Buscando entre tus movimientos',
};

export interface ConversacionProps {
  /** Se avisa al primer mensaje, para que el panel recoja la zona de subida. */
  onConversar?: () => void;
}

export function Conversacion({ onConversar }: ConversacionProps) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [escrito, setEscrito] = useState('');
  const [pensando, setPensando] = useState(false);
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abajo = useRef<HTMLDivElement>(null);
  const aborto = useRef<AbortController | null>(null);

  useEffect(() => {
    abajo.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos, pensando, haciendo]);

  // Si se cierra el panel a media respuesta, se corta la petición: dejarla viva
  // seguiría gastando tokens por una respuesta que nadie va a leer.
  useEffect(() => () => aborto.current?.abort(), []);

  const enviar = useCallback(async () => {
    const pregunta = escrito.trim();
    if (!pregunta || pensando) return;

    const historia: Turno[] = [...turnos, { rol: 'user', texto: pregunta }];
    setTurnos([...historia, { rol: 'assistant', texto: '' }]);
    setEscrito('');
    setError(null);
    setPensando(true);
    onConversar?.();

    const control = new AbortController();
    aborto.current = control;

    try {
      const res = await fetch('/api/copiloto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensajes: historia }),
        signal: control.signal,
      });

      if (!res.ok || !res.body) {
        const datos = await res.json().catch(() => ({}));
        setError(datos.mensaje ?? `El servidor respondió ${res.status}.`);
        setTurnos(historia);
        return;
      }

      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      // El troceado vive en `lib/oris/sse.ts` y está probado aparte: la red
      // parte los eventos por la mitad y eso no se reproduce en local.
      const eventos = new LectorEventos();

      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;

        for (const crudo of eventos.leer(decodificador.decode(value, { stream: true }))) {
          const evento = crudo as { tipo: string; texto?: string; nombre?: string; mensaje?: string };

          if (evento.tipo === 'texto' && evento.texto) {
            setHaciendo(null);
            setTurnos((previo) => {
              const copia = [...previo];
              const ultimo = copia[copia.length - 1];
              copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + evento.texto };
              return copia;
            });
          } else if (evento.tipo === 'herramienta') {
            setHaciendo(EN_CURSO[evento.nombre ?? ''] ?? 'Consultando tus datos');
          } else if (evento.tipo === 'error') {
            setError(evento.mensaje ?? 'Algo ha fallado.');
          }
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError('Se cortó la conexión a media respuesta.');
      }
    } finally {
      setPensando(false);
      setHaciendo(null);
      aborto.current = null;
      // Un turno que se quedó vacío no se deja en pantalla: un globo en blanco
      // parece una respuesta y no lo es.
      setTurnos((previo) =>
        previo.length > 0 && previo[previo.length - 1].texto === '' ? previo.slice(0, -1) : previo,
      );
    }
  }, [escrito, pensando, turnos, onConversar]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {turnos.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-3">
            <IresEye size={72} className="opacity-40" />
            <p className="max-w-xs text-center text-[0.82rem] leading-relaxed text-tinta-5">
              Pregúntame por tus cuentas. Las cifras las saco de tus movimientos,
              no me las invento.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['¿En qué se me va el dinero?', '¿Cuánto ahorré el mes pasado?', '¿Cuánto gasto en súper?'].map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEscrito(s)}
                    className="rounded-full border border-borde-2 px-2.5 py-1 text-[0.7rem] text-tinta-4 transition-colors hover:border-borde-4 hover:text-tinta-2"
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null}

        {turnos.map((t, i) => (
          <div
            key={i}
            className={t.rol === 'user' ? 'flex justify-end' : 'flex gap-2.5'}
          >
            {t.rol === 'assistant' ? (
              <IresEye size={20} className="mt-0.5 shrink-0 opacity-70" />
            ) : null}
            <p
              className={
                t.rol === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-superficie-3 px-3.5 py-2 text-[0.82rem] leading-relaxed text-tinta-2'
                  : 'max-w-[92%] whitespace-pre-wrap text-[0.82rem] leading-relaxed text-tinta-2'
              }
            >
              {t.texto}
            </p>
          </div>
        ))}

        {pensando ? (
          <p className="flex items-center gap-2 text-[0.74rem] text-tinta-4">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-serie" />
            {haciendo ?? 'Pensando'}…
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-aviso-borde bg-aviso-fondo px-3 py-2 text-[0.76rem] leading-relaxed text-tinta-2">
            {error}
          </p>
        ) : null}

        <div ref={abajo} />
      </div>

      <div className="border-t border-borde p-4">
        <form
          className="flex items-center gap-3 rounded-xl border border-borde-2 bg-superficie px-4 py-3 focus-within:border-borde-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <input
            type="text"
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            disabled={pensando}
            placeholder={pensando ? 'Un momento…' : 'Pregúntame por tus cuentas…'}
            className="flex-1 bg-transparent text-sm text-tinta-2 placeholder:text-tinta-5 focus:outline-none disabled:cursor-not-allowed"
            aria-label="Mensaje para ORis"
          />
          <button
            type="submit"
            disabled={pensando || escrito.trim() === ''}
            aria-label="Enviar"
            className="text-tinta-4 transition-colors hover:text-tinta-2 disabled:cursor-not-allowed disabled:text-tinta-5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
