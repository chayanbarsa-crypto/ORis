'use client';

/**
 * La revisión de lo que ORis no supo categorizar.
 *
 * Una pregunta por comercio, no por movimiento, ordenadas por dinero. Contestar
 * la primera mueve el desglose más que contestar las diez últimas.
 *
 * Lo que se guarda aquí queda con `origen = 'manual'`, y eso es una marca
 * definitiva: ninguna regla ni ningún modelo la vuelve a pisar. Por eso el
 * botón dice «Es esto» y no «Guardar»: estás afirmando algo, no rellenando un
 * formulario.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MovimientoVista } from '@/lib/oris/agregados';
import { formatear } from '@/lib/oris/dinero';
import { agruparPendientes, dineroPendiente, redactarPregunta } from '@/lib/oris/revision';

/**
 * Las categorías que se ofrecen de entrada.
 *
 * Son las mismas que asignan las reglas, para que lo que decides a mano y lo
 * que decide una regla acaben en el mismo sitio. Si hicieran falta otras, el
 * campo libre las crea.
 */
const SUGERIDAS = [
  'Alimentación',
  'Restauración',
  'Transporte',
  'Salud',
  'Suministros',
  'Suscripciones',
  'Compras',
  'Ocio',
  'Cuidado personal',
  'Hogar',
  'Comisiones',
  'Traspaso entre cuentas propias',
] as const;

export interface RevisionProps {
  movimientos: readonly MovimientoVista[];
}

export function Revision({ movimientos }: RevisionProps) {
  const router = useRouter();
  const grupos = useMemo(() => agruparPendientes(movimientos), [movimientos]);
  const [indice, setIndice] = useState(0);
  const [escrita, setEscrita] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hechos, setHechos] = useState(0);

  const grupo = grupos[indice];

  const asignar = useCallback(
    async (categoria: string) => {
      if (!grupo || !categoria.trim()) return;
      setGuardando(true);
      setError(null);
      try {
        const res = await fetch('/api/movimientos/categoria', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ids: grupo.ids,
            categoria: categoria.trim(),
            // La raíz viaja para poder aprender la regla: sin ella habría que
            // volver a normalizar el concepto en el servidor y arriesgarse a
            // que las dos normalizaciones difieran.
            raiz: grupo.raiz,
            signo: grupo.signo,
          }),
        });
        const datos = await res.json();
        if (!res.ok) {
          setError(datos.mensaje ?? `El servidor respondió ${res.status}.`);
          return;
        }
        setHechos((n) => n + 1);
        setEscrita('');
        setIndice((i) => i + 1);
        router.refresh();
      } catch {
        setError('Se cortó la conexión. No se ha guardado nada.');
      } finally {
        setGuardando(false);
      }
    },
    [grupo, router],
  );

  if (grupos.length === 0) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <h2 className="mb-4 text-sm font-light tracking-wide text-tinta-2">Categorías</h2>
        <div className="max-w-md rounded-2xl border border-bien-borde bg-bien-fondo px-6 py-7">
          <p className="text-sm text-tinta-2">No queda nada por categorizar.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-tinta-4">
            {hechos > 0
              ? `Has resuelto ${hechos} ${hechos === 1 ? 'grupo' : 'grupos'}. Las reglas aprendidas se aplicarán solas la próxima vez que aparezcan.`
              : 'Todos los movimientos tienen categoría.'}
          </p>
        </div>
      </section>
    );
  }

  if (!grupo) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <h2 className="mb-4 text-sm font-light tracking-wide text-tinta-2">Categorías</h2>
        <div className="max-w-md rounded-2xl border border-bien-borde bg-bien-fondo px-6 py-7">
          <p className="text-sm text-tinta-2">Por hoy hemos terminado.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-tinta-4">
            Has resuelto {hechos} {hechos === 1 ? 'grupo' : 'grupos'}. Recarga para ver
            si queda algo más.
          </p>
        </div>
      </section>
    );
  }

  const restante = dineroPendiente(grupos.slice(indice));

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-light tracking-wide text-tinta-2">Categorías</h2>
        <p className="text-[0.74rem] tabular-nums text-tinta-4">
          {grupos.length - indice} sin resolver · {formatear(restante)}
        </p>
      </div>

      {/* La pregunta, tal cual la redacta `revision.ts` con lo que el extracto
          sabe. Ni hora ni ubicación: no constan. */}
      <div className="max-w-2xl rounded-2xl border border-borde-2 bg-superficie px-5 py-5">
        <p className="text-[0.95rem] leading-relaxed text-tinta-2">{redactarPregunta(grupo)}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGERIDAS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={guardando}
              onClick={() => void asignar(c)}
              className="rounded-full border border-borde-2 px-3 py-1.5 text-[0.78rem] text-tinta-2 transition-colors hover:border-borde-4 hover:bg-superficie-2 hover:text-tinta disabled:cursor-not-allowed disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void asignar(escrita);
          }}
        >
          <input
            type="text"
            value={escrita}
            onChange={(e) => setEscrita(e.target.value)}
            disabled={guardando}
            placeholder="…o escribe otra"
            aria-label="Categoría nueva"
            className="min-w-0 flex-1 rounded-lg border border-borde-2 bg-superficie px-3.5 py-2 text-[0.84rem] text-tinta-2 placeholder:text-tinta-5 focus:border-borde-4 focus:outline-none"
          />
          <button
            type="submit"
            disabled={guardando || escrita.trim() === ''}
            className="rounded-lg border border-serie-borde bg-serie/15 px-4 py-2 text-[0.82rem] text-tinta transition-colors hover:bg-serie/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Es esto
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => {
              setEscrita('');
              setIndice((i) => i + 1);
            }}
            className="rounded-lg px-3 py-2 text-[0.8rem] text-tinta-4 transition-colors hover:text-tinta-2 disabled:opacity-40"
          >
            No me acuerdo
          </button>
        </form>

        {error ? (
          <p className="mt-3 text-[0.78rem] text-mal">{error}</p>
        ) : (
          <p className="mt-3 text-[0.72rem] leading-relaxed text-tinta-5">
            Lo que digas queda como decisión tuya: ninguna regla ni el modelo la
            volverán a cambiar. Y aprendo una regla para las próximas veces.
          </p>
        )}
      </div>

      {/* Lo que viene después, para que se vea que esto acaba. */}
      {grupos.length - indice > 1 ? (
        <div className="mt-6 max-w-2xl">
          <h3 className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-tinta-4">
            Después de éste
          </h3>
          <ul className="overflow-hidden rounded-xl border border-borde">
            {grupos.slice(indice + 1, indice + 6).map((g) => (
              <li
                key={g.raiz}
                className="flex items-baseline justify-between gap-4 border-b border-borde px-4 py-2.5 last:border-b-0"
              >
                <span className="truncate text-[0.82rem] text-tinta-3">{g.conceptoCrudo}</span>
                <span className="shrink-0 text-[0.76rem] tabular-nums text-tinta-4">
                  {g.veces > 1 ? `${g.veces}× · ` : ''}
                  {formatear(Math.abs(g.total))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
