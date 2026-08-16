import type { Metadata, Viewport } from 'next';
import './globals.css';
import { IresProvider } from '@/lib/ires/context';

export const metadata: Metadata = {
  title: 'IRES',
  description: 'Inteligencia financiera',
};

export const viewport: Viewport = {
  themeColor: '#040814',
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
        <IresProvider>{children}</IresProvider>
      </body>
    </html>
  );
}
