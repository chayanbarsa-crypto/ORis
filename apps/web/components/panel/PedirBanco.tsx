'use client';

/**
 * «¿De qué banco es esto?»
 *
 * ORis reconoce el banco por el IBAN, por la cabecera del documento o por el
 * nombre del fichero. Cuando ninguna de las tres dice nada —pasa con Excel
 * descargados de banca electrónica, que a veces no se nombran a sí mismos en
 * ninguna parte— la alternativa a preguntar es adivinar, y adivinar mal agrupa
 * dos cuentas distintas bajo el mismo banco. Eso da una caja que no existe,
 * que es exactamente lo que este proyecto no hace.
 *
 * Se pregunta por extracto, no por movimiento: una respuesta arregla los
 * noventa movimientos que vinieron en él.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { BANCOS_CONOCIDOS, periodoCorto } from '@/lib/oris/bancos';
import type { ExtractoVista } from '@/lib/oris/cargar';

export interface PedirBancoProps {
  extracto: ExtractoVista;
}

export function PedirBanco({ extracto }: PedirBancoProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const guardar = async (banco: string) => {
    const limpio = banco.trim();
    if (limpio.length < 2 || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/extractos/banco', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: extracto.id, banco: limpio }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.mensaje ?? `El servidor respondió ${res.status}.`);
        return;
      }
      setHecho(true);
      router.refresh();
    } catch {
      setError('Se cortó la conexión. No se ha guardado nada.');
    } finally {
      setGuardando(false);
    }
  };

  if (hecho) return null;

  const periodo =
    extracto.periodoInicio && extracto.periodoFin
      ? periodoCorto(extracto.periodoInicio, extracto.periodoFin)
      : null;

  return (
    <div className="rounded-xl border border-aviso-borde bg-aviso-fondo px-4 py-3.5">
      <p className="text-[0.82rem] leading-relaxed text-tinta-2">
        No he sabido de qué banco es{' '}
        <strong className="font-normal text-tinta">{extracto.nombreFichero}</strong>
        {periodo ? <> ({periodo})</> : null}. ¿Me lo dices? Con varias cuentas hace
        falta para no mezclarlas.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {BANCOS_CONOCIDOS.slice(0, 8).map((b) => (
          <button
            key={b}
            type="button"
            disabled={guardando}
            onClick={() => guardar(b)}
            className="rounded-full border border-borde-2 px-2.5 py-1 text-[0.72rem] text-tinta-3 transition-colors hover:border-borde-4 hover:text-tinta disabled:opacity-40"
          >
            {b}
          </button>
        ))}
      </div>

      <form
        className="mt-2.5 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar(nombre);
        }}
      >
        {/* Lista abierta: sugiere los que ORis conoce y admite cualquier otro.
            Cerrarla dejaría sin respuesta posible al banco que aún no está. */}
        <input
          list="bancos-conocidos"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="u otro: escríbelo"
          aria-label="Nombre del banco"
          className="min-w-0 flex-1 rounded-lg border border-borde-2 bg-superficie px-3 py-1.5 text-[0.78rem] text-tinta-2 outline-none placeholder:text-tinta-5 focus:border-borde-4"
        />
        <datalist id="bancos-conocidos">
          {BANCOS_CONOCIDOS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={guardando || nombre.trim().length < 2}
          className="rounded-lg border border-borde-3 px-3 py-1.5 text-[0.75rem] text-tinta-2 transition-colors hover:border-borde-4 disabled:opacity-35"
        >
          {guardando ? 'Guardando…' : 'Es este'}
        </button>
      </form>

      {error ? <p className="mt-2 text-[0.72rem] text-mal">{error}</p> : null}
    </div>
  );
}
