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
        <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">Categorías</h2>
        <div className="max-w-md rounded-2xl border border-[#0E9E70]/25 bg-[#0E9E70]/[0.06] px-6 py-7">
          <p className="text-sm text-white/75">No queda nada por categorizar.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-white/45">
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
        <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">Categorías</h2>
        <div className="max-w-md rounded-2xl border border-[#0E9E70]/25 bg-[#0E9E70]/[0.06] px-6 py-7">
          <p className="text-sm text-white/75">Por hoy hemos terminado.</p>
          <p className="mt-2.5 text-[0.78rem] leading-relaxed text-white/45">
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
        <h2 className="text-sm font-light tracking-wide text-white/70">Categorías</h2>
        <p className="text-[0.74rem] tabular-nums text-white/40">
          {grupos.length - indice} sin resolver · {formatear(restante)}
        </p>
      </div>

      {/* La pregunta, tal cual la redacta `revision.ts` con lo que el extracto
          sabe. Ni hora ni ubicación: no constan. */}
      <div className="max-w-2xl rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-5">
        <p className="text-[0.95rem] leading-relaxed text-white/85">{redactarPregunta(grupo)}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGERIDAS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={guardando}
              onClick={() => void asignar(c)}
              className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[0.78rem] text-white/70 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white/95 disabled:cursor-not-allowed disabled:opacity-40"
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
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.02] px-3.5 py-2 text-[0.84rem] text-white/85 placeholder:text-white/25 focus:border-white/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={guardando || escrita.trim() === ''}
            className="rounded-lg border border-[#2D96F0]/45 bg-[#2D96F0]/15 px-4 py-2 text-[0.82rem] text-white/90 transition-colors hover:bg-[#2D96F0]/25 disabled:cursor-not-allowed disabled:opacity-35"
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
            className="rounded-lg px-3 py-2 text-[0.8rem] text-white/40 transition-colors hover:text-white/70 disabled:opacity-40"
          >
            No me acuerdo
          </button>
        </form>

        {error ? (
          <p className="mt-3 text-[0.78rem] text-[#E05252]">{error}</p>
        ) : (
          <p className="mt-3 text-[0.72rem] leading-relaxed text-white/30">
            Lo que digas queda como decisión tuya: ninguna regla ni el modelo la
            volverán a cambiar. Y aprendo una regla para las próximas veces.
          </p>
        )}
      </div>

      {/* Lo que viene después, para que se vea que esto acaba. */}
      {grupos.length - indice > 1 ? (
        <div className="mt-6 max-w-2xl">
          <h3 className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-white/35">
            Después de éste
          </h3>
          <ul className="overflow-hidden rounded-xl border border-white/[0.07]">
            {grupos.slice(indice + 1, indice + 6).map((g) => (
              <li
                key={g.raiz}
                className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0"
              >
                <span className="truncate text-[0.82rem] text-white/60">{g.conceptoCrudo}</span>
                <span className="shrink-0 text-[0.76rem] tabular-nums text-white/40">
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
