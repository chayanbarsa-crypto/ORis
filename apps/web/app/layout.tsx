import type { Metadata, Viewport } from 'next';
import './globals.css';
import { IresProvider } from '@/lib/ires/context';

export const metadata: Metadata = {
  title: 'ORis',
  description: 'Inteligencia financiera',
};

export const viewport: Viewport = {
  // Dos, uno por tema: es el color de la barra del navegador en el móvil, y
  // con uno solo la barra se queda negra sobre una aplicación clara.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#040814' },
    { media: '(prefers-color-scheme: light)', color: '#F2F4F8' },
  ],
  // La constelacion se dibuja a pantalla completa; el zoom por pellizco
  // romperia la relacion entre el dedo y los nodos.
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        {/*
          Antes de pintar nada.

          Si el tema se aplicara desde React, la página aparecería un instante
          con el tema anterior y saltaría al elegido — el parpadeo blanco que
          hace daño a los ojos justamente a quien eligió el oscuro. Este guion
          es síncrono y corre antes del primer pintado. Va en `body` y no en
          `head` porque Next reordena `head`, y aquí el orden es el requisito.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('oris:tema');" +
              "if(t==='claro'||t==='oscuro')document.documentElement.setAttribute('data-tema',t);}catch(e){}",
          }}
        />
        <IresProvider>{children}</IresProvider>
      </body>
    </html>
  );
}
