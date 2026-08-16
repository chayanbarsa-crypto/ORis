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
    },
  },
  plugins: [],
};

export default config;
