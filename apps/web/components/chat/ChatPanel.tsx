'use client';

/**
 * Panel del copiloto: subir extractos y preguntar por lo subido.
 *
 * Las dos cosas viven aquí porque son la misma conversación. Sueltas el
 * extracto, ORis lo audita y lo guarda, y a continuación le preguntas por él
 * sin cambiar de pantalla.
 *
 * La subida va arriba y sólo mientras no hay conversación: en cuanto se empieza
 * a hablar, ocupa un sitio que necesita lo que se está leyendo. Sigue accesible
 * desde la sección de extractos.
 */

import { useState } from 'react';

import { IresEye } from '@/components/ui/IresEye';
import { Conversacion } from './Conversacion';
import { SubidaExtracto } from './SubidaExtracto';

export function ChatPanel() {
  const [subir, setSubir] = useState(true);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col border-t border-white/[0.07] md:border-l md:border-t-0"
      aria-label="Conversación con ORis"
    >
      <div className="flex items-center gap-2.5 px-5 py-3">
        {/* El ojo alado es el emblema de ORis, y aqui hace de interlocutor: es
            la cara de quien responde, no un adorno. Hereda el color del estado,
            asi que cambia con el animo de la constelacion sin tocar nada. */}
        <IresEye size={26} />
        <span className="text-[0.58rem] uppercase tracking-[0.26em] text-white/35">Copiloto</span>
      </div>

      {subir ? (
        <div className="px-5 pb-1">
          <SubidaExtracto />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSubir(true)}
          className="mx-5 mb-1 rounded-lg border border-dashed border-white/[0.1] px-3 py-1.5 text-[0.72rem] text-white/35 transition-colors hover:border-white/25 hover:text-white/60"
        >
          Subir otro extracto
        </button>
      )}

      <Conversacion onConversar={() => setSubir(false)} />

    </section>
  );
}
