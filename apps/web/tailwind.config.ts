import type { Config } from 'tailwindcss';

/**
 * Los globs de `content` se anclan al directorio de ESTE archivo, no al cwd.
 *
 * Con rutas relativas, Tailwind las resuelve contra el directorio desde el que
 * se lanza el proceso. Si se arranca desde fuera, escanea el sitio equivocado,
 * no encuentra ninguna clase y genera una hoja sin utilidades: la aplicacion
 * carga sin estilos y sin un solo error que lo delate.
 *
 * OJO con las barras: hay que forzar '/' aunque estemos en Windows. El motor
 * de globs trata '\' como caracter de escape, asi que un `path.join` deja
 * `D:\...\app\**\*.tsx` y eso no casa con nada — y tampoco avisa, porque el
 * array no esta vacio, simplemente no encuentra archivos.
 */
const root = __dirname.replace(/\\/g, '/');

const config: Config = {
  content: [
    `${root}/app/**/*.{ts,tsx}`,
    `${root}/components/**/*.{ts,tsx}`,
    `${root}/lib/**/*.{ts,tsx}`,
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      /*
        Los colores salen de las variables de `globals.css`, y con el alfa ya
        dentro. Eso descarta el modificador de Tailwind —`text-tinta/50` no hace
        nada— y a cambio el mismo nombre resuelve a un color en claro y a otro
        en oscuro sin que ningún componente lo sepa.
      */
      colors: {
        fondo: 'var(--fondo)',
        plano: 'var(--plano)',
        superficie: 'var(--superficie)',
        'superficie-2': 'var(--superficie-2)',
        'superficie-3': 'var(--superficie-3)',
        borde: 'var(--borde)',
        'borde-2': 'var(--borde-2)',
        'borde-3': 'var(--borde-3)',
        'borde-4': 'var(--borde-4)',
        tinta: 'var(--tinta)',
        'tinta-2': 'var(--tinta-2)',
        'tinta-3': 'var(--tinta-3)',
        'tinta-4': 'var(--tinta-4)',
        'tinta-5': 'var(--tinta-5)',
        serie: 'var(--serie)',
        pendiente: 'var(--pendiente)',
        bien: 'var(--bien)',
        mal: 'var(--mal)',
        control: 'var(--control)',
        'aviso-fondo': 'var(--aviso-fondo)',
        'aviso-borde': 'var(--aviso-borde)',
        'aviso-tinta': 'var(--aviso-tinta)',
        'bien-fondo': 'var(--bien-fondo)',
        'bien-borde': 'var(--bien-borde)',
        'serie-fondo': 'var(--serie-fondo)',
        'serie-borde': 'var(--serie-borde)',
      },
    },
  },
  plugins: [],
};

export default config;
