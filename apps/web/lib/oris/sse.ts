/**
 * Leer eventos SSE de un flujo que llega a trozos.
 *
 * Existe aparte por una razón muy concreta: **un trozo de red puede cortar un
 * evento por la mitad**. En local nunca pasa —todo llega de una pieza— y en
 * producción pasa constantemente, con lo que el fallo aparece sólo cuando ya
 * está desplegado y en forma de letras sueltas perdidas o un `JSON.parse` que
 * revienta a media respuesta.
 *
 * Aquí se guarda lo incompleto para la vuelta siguiente, y se puede probar sin
 * navegador ni servidor.
 */

export class LectorEventos {
  private resto = '';

  /**
   * Los eventos completos que haya en este trozo. Lo que quede a medias se
   * guarda y sale en una llamada posterior.
   */
  leer(trozo: string): unknown[] {
    this.resto += trozo;
    const partes = this.resto.split('\n\n');
    // El último es siempre lo que va después de la última línea en blanco: o
    // está incompleto, o está vacío. En ambos casos, a esperar.
    this.resto = partes.pop() ?? '';

    const eventos: unknown[] = [];
    for (const parte of partes) {
      const linea = parte.split('\n').find((l) => l.startsWith('data: '));
      if (!linea) continue;
      try {
        eventos.push(JSON.parse(linea.slice(6)));
      } catch {
        // Un evento ilegible se salta: cortar la respuesta entera por una línea
        // corrupta perdería todo lo que ya iba bien.
      }
    }
    return eventos;
  }
}
