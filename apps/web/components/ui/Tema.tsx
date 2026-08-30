'use client';

/**
 * Cambiar entre claro, oscuro y lo que diga el sistema.
 *
 * Tres estados y no dos, porque «lo que diga el sistema» es una respuesta
 * distinta de «claro»: quien tiene el portátil en automático quiere que ORis
 * se oscurezca por la noche con todo lo demás, y un interruptor de dos
 * posiciones le obliga a elegir un bando y a corregirlo dos veces al día.
 *
 * Lo elegido se guarda en `localStorage` y lo aplica el guion de `layout.tsx`
 * antes de pintar. Aquí sólo se cambia: si esta parte lo aplicara al montarse,
 * la página aparecería un instante con el tema anterior.
 */

import { useEffect, useState } from 'react';

export type Tema = 'sistema' | 'claro' | 'oscuro';

export const CLAVE_TEMA = 'oris:tema';

const ORDEN: Tema[] = ['sistema', 'claro', 'oscuro'];

const ETIQUETA: Record<Tema, string> = {
  sistema: 'Tema: el del sistema',
  claro: 'Tema: claro',
  oscuro: 'Tema: oscuro',
};

export function Tema() {
  const [tema, setTema] = useState<Tema>('sistema');

  // Se lee después de montar, no en el estado inicial: el servidor no tiene
  // `localStorage`, y arrancar con un valor distinto al del navegador hace que
  // React se queje de que el HTML no coincide.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_TEMA);
      if (guardado === 'claro' || guardado === 'oscuro' || guardado === 'sistema') {
        setTema(guardado);
      }
    } catch {
      // Navegación privada, o almacenamiento bloqueado. Se queda en «sistema».
    }
  }, []);

  const cambiar = () => {
    const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
    setTema(siguiente);
    aplicar(siguiente);
    try {
      localStorage.setItem(CLAVE_TEMA, siguiente);
    } catch {
      // Si no se puede guardar, el cambio vale para esta sesión y ya.
    }
  };

  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={ETIQUETA[tema]}
      title={ETIQUETA[tema]}
      className="rounded-lg p-1.5 text-tinta-4 transition-colors hover:bg-superficie-2 hover:text-tinta-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-borde-4"
    >
      <Icono tema={tema} />
    </button>
  );
}

/** Pone o quita `data-tema` en el `html`. Sin atributo manda el sistema. */
export function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', tema);
}

function Icono({ tema }: { tema: Tema }) {
  const comun = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (tema === 'claro') {
    return (
      <svg {...comun}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (tema === 'oscuro') {
    return (
      <svg {...comun}>
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      </svg>
    );
  }
  // Sistema: media luna dentro del sol, que es lo que significa «depende».
  return (
    <svg {...comun}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
