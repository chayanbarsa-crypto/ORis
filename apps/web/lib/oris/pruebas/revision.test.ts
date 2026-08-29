/**
 * Pruebas de la revisión de lo pendiente.
 *
 *   npx tsx lib/oris/pruebas/revision.test.ts
 *
 * Lo que se comprueba no es que agrupe, sino que agrupe **por el mismo
 * criterio que categoriza**. Si la agrupación usara otra normalización, ORis
 * preguntaría por «MERCADONA 4521» y por «MERCADONA 8830» como si fueran dos
 * comercios distintos, y la regla aprendida de una no cubriría la otra.
 *
 * Y que la pregunta no diga nada que el extracto no sepa: ni hora ni sitio.
 */

import { agruparPendientes, dineroPendiente, enPalabras, redactarPregunta, reglaAprendida } from '../revision';
import { SIN_CATEGORIZAR, type MovimientoVista } from '../agregados';
import { normalizarConcepto } from '../categorizar';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

let n = 0;
function mov(p: Partial<MovimientoVista> & { importe: string }): MovimientoVista {
  n += 1;
  return {
    id: `m${n}`,
    fecha: '2026-05-17',
    concepto: 'ALGO',
    categoria: null,
    origen: null,
    ...p,
  };
}

// --- agrupación ------------------------------------------------------------

{
  const grupos = agruparPendientes([
    mov({ concepto: 'TRANSACCION CON TARJETA BAR PEPE 4521', importe: '-3.00', fecha: '2026-05-02' }),
    mov({ concepto: 'TRANSACCION CON TARJETA BAR PEPE 8830', importe: '-4.50', fecha: '2026-05-09' }),
    mov({ concepto: 'COMPRA BAR PEPE S.L. 1002', importe: '-6.00', fecha: '2026-05-23' }),
    mov({ concepto: 'TRANSACCION CON TARJETA LIBRERIA ALFA', importe: '-22.00', fecha: '2026-05-11' }),
  ]);

  comprobar(grupos.length === 2, 'tres visitas al mismo bar son un solo grupo', grupos.length);
  comprobar(grupos[0].raiz === 'LIBRERIA ALFA', 'ordena por dinero, no por fecha', grupos[0].raiz);
  const bar = grupos.find((g) => g.raiz === 'BAR PEPE');
  comprobar(!!bar, 'la raíz ignora referencias y forma jurídica', grupos.map((g) => g.raiz));
  comprobar(bar?.veces === 3, 'con sus tres apuntes', bar?.veces);
  comprobar(bar?.total === -1350, 'y el total en céntimos', bar?.total);
  comprobar(bar?.primeraFecha === '2026-05-02', 'primera fecha', bar?.primeraFecha);
  comprobar(bar?.ultimaFecha === '2026-05-23', 'última fecha', bar?.ultimaFecha);
  comprobar(bar?.ids.length === 3, 'y guarda los ids para poder arreglarlos todos', bar?.ids);
}

{
  // El criterio de agrupación tiene que ser EL MISMO que el de categorización.
  const concepto = 'Transacción con tarjeta AHORRAMAS S.L. 4521';
  const grupos = agruparPendientes([mov({ concepto, importe: '-12.00' })]);
  comprobar(
    grupos[0].raiz === normalizarConcepto(concepto),
    'la raíz del grupo es la misma que usa el categorizador',
    grupos[0].raiz,
  );
}

{
  const grupos = agruparPendientes([
    mov({ concepto: 'X', importe: '-10.00', categoria: 'Alimentación', origen: 'regla' }),
    mov({ concepto: 'Y', importe: '-10.00', categoria: SIN_CATEGORIZAR }),
    mov({ concepto: 'Z', importe: '-10.00', categoria: null }),
    mov({ concepto: 'W', importe: '-10.00', categoria: 'Restauración', origen: 'ia' }),
  ]);
  comprobar(grupos.length === 2, 'sólo lo que no tiene categoría queda pendiente', grupos.map((g) => g.raiz));
  comprobar(
    !grupos.some((g) => g.raiz === 'W'),
    'lo que puso el modelo no es «pendiente»: es «revisable», y eso es otra cosa',
  );
}

{
  const grupos = agruparPendientes([
    mov({ concepto: 'DEVOLUCION TIENDA', importe: '18.00' }),
    mov({ concepto: 'OTRA COSA', importe: '-7.00' }),
  ]);
  comprobar(dineroPendiente(grupos) === 2500, 'el dinero pendiente suma en valor absoluto', dineroPendiente(grupos));
}

{
  // Un concepto que se normaliza a nada no se pierde: se agrupa por el crudo.
  const grupos = agruparPendientes([mov({ concepto: '4521 8830', importe: '-5.00' })]);
  comprobar(grupos.length === 1, 'un concepto sin letras sigue generando su grupo', grupos);
  comprobar(grupos[0].raiz !== '', 'y su clave no es la cadena vacía', grupos[0].raiz);
}

{
  const grupos = agruparPendientes([
    mov({ concepto: 'BIZUM LAURA', importe: '-20.00' }),
    mov({ concepto: 'BIZUM LAURA', importe: '35.00' }),
  ]);
  comprobar(grupos[0].signo === null, 'si mezcla cargos y abonos, no se le asigna signo', grupos[0].signo);
}

// --- la pregunta -----------------------------------------------------------

comprobar(enPalabras('2026-05-17') === 'domingo 17 de mayo', 'la fecha se dice en palabras', enPalabras('2026-05-17'));
comprobar(enPalabras('2026-01-01') === 'jueves 1 de enero', 'y acierta en enero', enPalabras('2026-01-01'));
comprobar(enPalabras('2026-05-17', false) === '17 de mayo', 'sin día de la semana cuando estorba');

{
  const [g] = agruparPendientes([
    mov({ concepto: 'PELUQUERIA XUANYI', importe: '-25.00', fecha: '2026-08-17' }),
  ]);
  const p = redactarPregunta(g);
  comprobar(p.includes('lunes 17 de agosto'), 'la pregunta sitúa el día', p);
  comprobar(p.includes('25,00 €'), 'y la cantidad', p);
  comprobar(p.includes('PELUQUERIA XUANYI'), 'con el texto tal cual del banco', p);
  comprobar(!/\d{1,2}:\d{2}/.test(p), 'nunca inventa una hora: el extracto no la trae', p);
}

{
  const [g] = agruparPendientes([
    mov({ concepto: 'BAR PEPE', importe: '-3.00', fecha: '2026-05-02' }),
    mov({ concepto: 'BAR PEPE', importe: '-4.50', fecha: '2026-05-09' }),
    mov({ concepto: 'BAR PEPE', importe: '-6.00', fecha: '2026-05-23' }),
  ]);
  const p = redactarPregunta(g);
  comprobar(p.includes('3 veces'), 'cuando se repite, lo dice', p);
  comprobar(p.includes('13,50 €'), 'con el total acumulado, que es lo que da valor a responder', p);
  comprobar(p.includes('2 de mayo') && p.includes('23 de mayo'), 'y el periodo', p);
}

{
  const [g] = agruparPendientes([mov({ concepto: 'NOMINA RARA', importe: '900.00' })]);
  comprobar(redactarPregunta(g).includes('te entraron'), 'un ingreso no se pregunta como un gasto', redactarPregunta(g));
}

// --- la regla que se aprende ----------------------------------------------

{
  const [g] = agruparPendientes([
    mov({ concepto: 'TRANSACCION CON TARJETA BAR PEPE 4521', importe: '-3.00' }),
  ]);
  const r = reglaAprendida(g, 'Restauración');
  comprobar(r.categoria === 'Restauración', 'la regla lleva la categoría que dijiste');
  comprobar(r.prioridad === 60, 'con prioridad por encima de las genéricas y por debajo de traspasos', r.prioridad);
  comprobar(r.signo === 'cargo', 'y hereda el signo del grupo', r.signo);
  comprobar(
    new RegExp(r.patron).test('BAR PEPE'),
    'el patrón casa con la raíz que la generó',
    r.patron,
  );
  comprobar(
    !new RegExp(r.patron).test('BAR PEPITO'),
    'pero no arrastra a un comercio que sólo se le parece',
    r.patron,
  );
}

{
  // Una raíz con caracteres de expresión regular no debe romper el patrón.
  const [g] = agruparPendientes([mov({ concepto: 'C A F E', importe: '-2.00' })]);
  const r = reglaAprendida(g, 'Restauración');
  let compila = true;
  try {
    new RegExp(r.patron);
  } catch {
    compila = false;
  }
  comprobar(compila, 'el patrón aprendido siempre compila', r.patron);
}

console.log(fallos === 0 ? '\n✅ revisión: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
