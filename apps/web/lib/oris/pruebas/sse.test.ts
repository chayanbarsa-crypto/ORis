/**
 * Pruebas del lector de eventos.
 *
 *   npx tsx lib/oris/pruebas/sse.test.ts
 *
 * Todo lo de aquí es el mismo caso visto de siete formas: la red parte el flujo
 * donde le da la gana, y eso no puede perder ni una letra.
 */

import { LectorEventos } from '../sse';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

{
  const l = new LectorEventos();
  const r = l.leer(ev({ tipo: 'texto', texto: 'hola' }));
  comprobar(r.length === 1, 'un evento entero se lee entero');
  comprobar((r[0] as { texto: string }).texto === 'hola', 'y con su contenido');
}

{
  const l = new LectorEventos();
  comprobar(l.leer(ev({ a: 1 }) + ev({ a: 2 }) + ev({ a: 3 })).length === 3,
    'tres eventos en un trozo salen los tres');
}

{
  // El caso que importa: el corte cae en medio del JSON.
  const l = new LectorEventos();
  const entero = ev({ tipo: 'texto', texto: 'mil doscientos euros' });
  const corte = Math.floor(entero.length / 2);

  comprobar(l.leer(entero.slice(0, corte)).length === 0, 'medio evento no se entrega');
  const r = l.leer(entero.slice(corte));
  comprobar(r.length === 1, 'y al llegar la otra mitad, sale completo');
  comprobar((r[0] as { texto: string }).texto === 'mil doscientos euros', 'sin perder nada por el camino');
}

{
  // Cortando letra a letra: el peor caso posible.
  const l = new LectorEventos();
  const flujo = ev({ n: 1 }) + ev({ n: 2 });
  const salidos: unknown[] = [];
  for (const letra of flujo) salidos.push(...l.leer(letra));
  comprobar(salidos.length === 2, 'letra a letra siguen saliendo los dos', salidos.length);
  comprobar((salidos[1] as { n: number }).n === 2, 'y en orden');
}

{
  // El corte cae justo entre los dos saltos de línea separadores.
  const l = new LectorEventos();
  const flujo = ev({ n: 1 }) + ev({ n: 2 });
  const donde = flujo.indexOf('\n\n') + 1;
  const salidos = [...l.leer(flujo.slice(0, donde)), ...l.leer(flujo.slice(donde))];
  comprobar(salidos.length === 2, 'un corte entre los dos saltos no pierde el primero', salidos.length);
}

{
  const l = new LectorEventos();
  const r = l.leer('data: {roto\n\n' + ev({ bien: true }));
  comprobar(r.length === 1 && (r[0] as { bien: boolean }).bien, 'un evento ilegible se salta y el siguiente sale');
}

{
  const l = new LectorEventos();
  comprobar(l.leer(': comentario del servidor\n\n').length === 0, 'las líneas que no son datos se ignoran');
  comprobar(l.leer('').length === 0, 'un trozo vacío no rompe nada');
}

{
  // Dos respuestas seguidas con el mismo lector no deben mezclarse.
  const l = new LectorEventos();
  l.leer('data: {"a":1}');
  const r = l.leer('}\n\n' + ev({ b: 2 }));
  comprobar(r.length === 1, 'lo que quedó corrupto no contamina el evento siguiente', r);
}

console.log(fallos === 0 ? '\n✅ sse: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
