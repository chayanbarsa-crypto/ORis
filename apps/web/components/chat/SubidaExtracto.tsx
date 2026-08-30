'use client';

/**
 * Subir un extracto soltándoselo a ORis.
 *
 * Es una conversación, no un formulario: adjuntas el PDF y ORis contesta con lo
 * que ha encontrado. De ahí que viva en el chat y no en una pantalla aparte.
 *
 * Dos decisiones sobre qué se enseña:
 *
 * - **La espera se cuenta en segundos.** Leer siete páginas tarda minutos, y un
 *   indicador que sólo gira hace pensar que se ha colgado. Ver el tiempo subir
 *   dice que sigue vivo.
 * - **Se puede arrastrar el fichero encima.** En el móvil se toca el botón; en
 *   el ordenador, soltarlo sobre el panel es el gesto natural y no tener que
 *   pasar por un diálogo de ficheros ahorra la mitad de los pasos.
 * - **Un rechazo no es un error.** Que un extracto no cuadre es ORis haciendo
 *   su trabajo: encontró que faltan apuntes. Se enseña con su evidencia, en
 *   ámbar, no en rojo — y se dice claramente que no se ha guardado nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useIres } from '@/lib/ires/context';
import { ACEPTADOS } from '@/lib/oris/formatos';

interface Hallazgo {
  regla: string;
  severidad: string;
  estado: string;
  descripcion: string;
  evidencia: string;
}

type Resultado =
  | {
      tipo: 'guardado';
      duplicado: boolean;
      movimientos: number;
      solapados: number;
      banco: string | null;
      categorizados: number;
      sinCategorizar: number;
      hallazgos: Hallazgo[];
    }
  | { tipo: 'rechazado'; mensaje: string; evidencia: string; sugerencia: string }
  | { tipo: 'error'; mensaje: string; sugerencia: string };

export function SubidaExtracto() {
  const router = useRouter();
  const { setState } = useIres();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [encima, setEncima] = useState(false);
  const reposo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el componente desaparece con el temporizador en marcha, ORis se
  // quedaría para siempre en «success» o en «alert».
  useEffect(() => () => {
    if (reposo.current) clearTimeout(reposo.current);
  }, []);

  useEffect(() => {
    if (!subiendo) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [subiendo]);

  const enviar = useCallback(
    async (fichero: File) => {
      setResultado(null);
      setSegundos(0);
      setSubiendo(fichero.name);
      // El fondo lo cuenta antes que ningún texto: en «analyzing» el campo
      // estelar acelera y aparecen las ondas. La máquina de estados de IRES ya
      // existía para esto y no se estaba usando para nada.
      setState('analyzing');

      const cuerpo = new FormData();
      cuerpo.append('extracto', fichero);

      try {
        const res = await fetch('/api/extractos', { method: 'POST', body: cuerpo });
        const datos = await res.json();

        if (res.ok) {
          setResultado({
            tipo: 'guardado',
            duplicado: datos.estado === 'duplicado',
            movimientos: datos.movimientos ?? 0,
            solapados: datos.solapados ?? 0,
            banco: datos.banco ?? null,
            categorizados: datos.categorizados ?? 0,
            sinCategorizar: datos.sinCategorizar ?? 0,
            hallazgos: datos.hallazgos ?? [],
          });
          // El panel lo pinta el servidor, así que hay que pedirle que lo
          // vuelva a calcular: sin esto los movimientos nuevos no aparecen
          // hasta recargar a mano.
          router.refresh();
          // Un destello verde y de vuelta a la calma. Los 1.400 ms son lo que
          // tarda en leerse la frase de respuesta: si volviera antes, el
          // cambio de color se perdería justo cuando dice que salió bien.
          setState('success');
          reposo.current = setTimeout(() => setState('idle'), 1400);
        } else if (datos.estado === 'rechazado') {
          // «alert» tiñe la interfaz de ámbar mientras lees el motivo. No es
          // un error de la aplicación: es ORis diciendo que faltan apuntes.
          setState('alert');
          reposo.current = setTimeout(() => setState('idle'), 2600);
          setResultado({
            tipo: 'rechazado',
            mensaje: datos.mensaje ?? 'El extracto no cuadra.',
            evidencia: datos.evidencia ?? '',
            sugerencia: datos.sugerencia ?? '',
          });
        } else {
          setState('alert');
          reposo.current = setTimeout(() => setState('idle'), 2600);
          setResultado({
            tipo: 'error',
            mensaje: datos.mensaje ?? `El servidor respondió ${res.status}.`,
            sugerencia: datos.sugerencia ?? '',
          });
        }
      } catch {
        setState('alert');
        reposo.current = setTimeout(() => setState('idle'), 2600);
        setResultado({
          tipo: 'error',
          mensaje: 'Se cortó la conexión antes de terminar.',
          sugerencia: 'Si el extracto es largo, prueba a subirlo partido por meses.',
        });
      } finally {
        setSubiendo(null);
        if (entrada.current) entrada.current.value = '';
      }
    },
    [router, setState],
  );

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-dashed p-3 transition-colors ${
        encima ? 'border-borde-4 bg-superficie-2' : 'border-transparent'
      }`}
      // `onDragOver` tiene que llamar a preventDefault o el navegador abre el
      // fichero en una pestaña nueva en vez de dejarlo caer aquí.
      onDragOver={(e) => {
        e.preventDefault();
        if (!subiendo) setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        if (subiendo) return;
        const f = e.dataTransfer.files?.[0];
        if (f) void enviar(f);
      }}
    >
      {resultado ? <Respuesta resultado={resultado} /> : null}

      {subiendo ? (
        <p className="text-[0.72rem] leading-relaxed text-tinta-4">
          Leyendo <span className="text-tinta-2">{subiendo}</span>… {segundos}s
          <br />
          <span className="text-tinta-5">
            {/* Un tabular tarda milisegundos; un PDF, minutos. Decirlo evita
                que parezca colgado justo cuando está trabajando. */}
            {/\.pdf$/i.test(subiendo)
              ? 'Un PDF de varias páginas tarda un par de minutos. No cierres la pestaña.'
              : 'Esto es rápido: las cifras ya vienen separadas.'}
          </span>
        </p>
      ) : null}

      <input
        ref={entrada}
        type="file"
        accept={ACEPTADOS}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
        }}
      />

      <button
        type="button"
        disabled={Boolean(subiendo)}
        onClick={() => entrada.current?.click()}
        className="flex items-center gap-2 self-start rounded-lg border border-borde-2 bg-superficie px-3 py-2 text-[0.78rem] text-tinta-2 transition-colors hover:bg-superficie-2 hover:text-tinta disabled:cursor-not-allowed disabled:text-tinta-5"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {subiendo ? 'Leyendo el extracto…' : 'Adjuntar extracto (PDF, Excel o CSV)'}
      </button>

      {!subiendo ? (
        <p className="text-[0.68rem] text-tinta-5">
          O arrastra el fichero hasta aquí.
        </p>
      ) : null}
    </div>
  );
}

function Respuesta({ resultado }: { resultado: Resultado }) {
  if (resultado.tipo === 'guardado') {
    const { duplicado, movimientos, solapados, banco, categorizados, sinCategorizar } = resultado;
    return (
      <div className="rounded-xl border border-borde-2 bg-superficie px-3.5 py-3 text-[0.76rem] leading-relaxed text-tinta-3">
        {duplicado ? (
          <p>
            Este extracto ya estaba guardado, con sus{' '}
            <strong className="font-normal text-tinta-2">{movimientos}</strong> movimientos. No he
            duplicado nada.
          </p>
        ) : (
          <>
            <p>
              Guardado: <strong className="font-normal text-tinta-2">{movimientos}</strong>{' '}
              movimientos{banco ? ` de ${banco}` : ''}. El cuadre sale.
            </p>
            {solapados > 0 ? (
              <p className="mt-1.5">
                <strong className="font-normal text-tinta-2">{solapados}</strong> ya los tenía de
                un extracto anterior, así que no los he vuelto a contar.
              </p>
            ) : null}
            <p className="mt-1.5 text-tinta-4">
              {categorizados} categorizados por reglas
              {sinCategorizar > 0 ? `, ${sinCategorizar} pendientes de revisar` : ''}.
            </p>
          </>
        )}
      </div>
    );
  }

  if (resultado.tipo === 'rechazado') {
    return (
      <div className="rounded-xl border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-[0.76rem] leading-relaxed text-tinta-2">
        <p className="text-tinta-2">No lo he guardado.</p>
        <p className="mt-1.5">{resultado.mensaje}</p>
        {resultado.evidencia ? (
          <p className="mt-1.5 text-tinta-4">{resultado.evidencia}</p>
        ) : null}
        <p className="mt-1.5 text-tinta-4">
          {resultado.sugerencia ||
            'Prefiero no guardar nada a guardar unas cuentas que no cuadran.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-borde-2 bg-superficie px-3.5 py-3 text-[0.76rem] leading-relaxed text-tinta-3">
      <p className="text-tinta-2">{resultado.mensaje}</p>
      {resultado.sugerencia ? (
        <p className="mt-1.5 text-tinta-4">{resultado.sugerencia}</p>
      ) : null}
    </div>
  );
}
