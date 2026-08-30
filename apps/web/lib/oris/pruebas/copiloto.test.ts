/**
 * Pruebas de las herramientas del copiloto.
 *
 *   npx tsx lib/oris/pruebas/copiloto.test.ts
 *
 * Lo que se protege aquí no es el modelo —eso no se puede probar así— sino el
 * contrato: que lo que devuelve una herramienta sea **exactamente** la misma
 * cifra que pinta el panel, y que un argumento malo se conteste en vez de
 * reventar la conversación.
 */

import { CATEGORIA_TRASPASO, resumirMes, type MovimientoVista } from '../agregados';
import { HERRAMIENTAS, ejecutar, mesMasReciente } from '../copiloto';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

let n = 0;
function mov(
  fecha: string,
  importe: string,
  concepto = 'x',
  categoria: string | null = null,
  banco: string | null = 'Openbank',
): MovimientoVista {
  n += 1;
  return { id: `m${n}`, fecha, concepto, importe, categoria, origen: null, banco };
}

const DATOS: MovimientoVista[] = [
  mov('2026-04-01', '1000.00', 'NOMINA ACME'),
  mov('2026-04-10', '-250.00', 'COMPRA MERCADONA', 'Alimentación'),
  mov('2026-05-01', '2000.00', 'NOMINA ACME'),
  mov('2026-05-03', '-780.00', 'ALQUILER PISO', 'Hogar'),
  mov('2026-05-09', '-120.50', 'COMPRA MERCADONA', 'Alimentación'),
  mov('2026-05-15', '-500.00', 'A MI AHORRO', CATEGORIA_TRASPASO),
  mov('2026-05-20', '300.00', 'BIZUM DE Marta', null, null),
];

// --- las definiciones ------------------------------------------------------

comprobar(HERRAMIENTAS.length === 8, 'ocho herramientas declaradas', HERRAMIENTAS.length);
comprobar(
  HERRAMIENTAS.every((h) => (h.input_schema as { additionalProperties?: boolean }).additionalProperties === false),
  'todas cierran el esquema: un argumento inventado se rechaza en la API',
);
comprobar(
  HERRAMIENTAS.every((h) => {
    const e = h.input_schema as { properties?: object; required?: string[] };
    return Object.keys(e.properties ?? {}).length === (e.required ?? []).length;
  }),
  'y todo argumento es obligatorio: lo opcional se pide como null, que es lo que exige strict',
);
comprobar(
  HERRAMIENTAS.every((h) => (h as { strict?: boolean }).strict === true),
  'todas en modo estricto',
);
comprobar(
  new Set(HERRAMIENTAS.map((h) => h.name)).size === HERRAMIENTAS.length,
  'sin nombres repetidos',
);

// --- el contrato con el panel ---------------------------------------------

{
  const r = ejecutar('resumen_mes', { mes: '2026-05' }, DATOS) as {
    ingresos: { centimos: number; texto: string };
    gastos: { centimos: number };
    neto: { centimos: number; texto: string };
    traspasos: { centimos: number };
    movimientos: number;
  };
  const delPanel = resumirMes(DATOS, '2026-05');

  comprobar(r.ingresos.centimos === delPanel.ingresos, 'los ingresos son los mismos que el panel', r.ingresos);
  comprobar(r.gastos.centimos === delPanel.gastos, 'y los gastos');
  comprobar(r.neto.centimos === delPanel.neto, 'y el neto');
  comprobar(r.traspasos.centimos === delPanel.traspasos, 'y los traspasos');
  comprobar(r.ingresos.texto === '2.300,00 €', 'el importe viene ya formateado para citarlo', r.ingresos.texto);
  comprobar(r.neto.texto.startsWith('+'), 'y el neto lleva signo', r.neto.texto);
  comprobar(r.traspasos.centimos === 50000, 'el traspaso no se cuenta como gasto', r.traspasos);
}

{
  const r = ejecutar('gasto_por_categoria', { mes: '2026-05' }, DATOS) as {
    total: { centimos: number };
    categorias: { categoria: string; total: { centimos: number }; porcentaje: number }[];
  };
  comprobar(r.categorias[0].categoria === 'Hogar', 'la mayor va primero', r.categorias[0]);
  comprobar(r.total.centimos === 90050, 'el total no incluye el traspaso', r.total);
  comprobar(
    r.categorias.reduce((a, c) => a + c.total.centimos, 0) === r.total.centimos,
    'y las partes suman el total',
  );
}

{
  const r = ejecutar('movimientos_mayores', { mes: '2026-05', tipo: 'gasto', cuantos: 2 }, DATOS) as {
    movimientos: { concepto: string }[];
  };
  comprobar(r.movimientos.length === 2 && r.movimientos[0].concepto === 'ALQUILER PISO',
    'los mayores gastos, sin contar traspasos', r.movimientos.map((m) => m.concepto));
}

{
  const r = ejecutar('traspasos_mes', { mes: '2026-05' }, DATOS) as {
    salidas: { centimos: number };
    descuadre: { centimos: number };
  };
  comprobar(r.salidas.centimos === 50000, 'las salidas del traspaso');
  comprobar(r.descuadre.centimos === -50000, 'y el descuadre se dice, no se esconde', r.descuadre);
}

{
  const r = ejecutar('serie_y_prevision', { meses_proyectados: 3 }, DATOS) as {
    serie: { mes: string; acumulado: { centimos: number } }[];
    prevision: { meses_promediados: number; puntos: unknown[] } | null;
  };
  comprobar(r.serie.length === 2, 'dos meses de serie', r.serie.map((s) => s.mes));
  comprobar(r.prevision?.puntos.length === 3, 'y tres meses proyectados');
  comprobar(
    (ejecutar('serie_y_prevision', { meses_proyectados: 0 }, DATOS) as { prevision: unknown }).prevision === null,
    'con cero no se proyecta nada',
  );
}

// --- el estado -------------------------------------------------------------

{
  const r = ejecutar('estado_datos', {}, DATOS) as {
    movimientos: number;
    meses_disponibles: string[];
    bancos: string[];
    movimientos_sin_banco: number;
    sin_categorizar_o_puestos_por_el_modelo: number;
    aviso: string | null;
  };
  comprobar(r.movimientos === 7, 'cuenta todos los movimientos');
  comprobar(r.meses_disponibles.join(',') === '2026-05,2026-04', 'los meses, del más reciente al más antiguo', r.meses_disponibles);
  comprobar(r.bancos.join(',') === 'Openbank', 'los bancos que hay');
  comprobar(r.movimientos_sin_banco === 1, 'y cuántos vienen sin identificar');
  comprobar(r.sin_categorizar_o_puestos_por_el_modelo === 3, 'los pendientes de revisar', r.sin_categorizar_o_puestos_por_el_modelo);
  comprobar(r.aviso !== null, 'y con pendientes se avisa antes de dar porcentajes');
}

// --- búsqueda --------------------------------------------------------------

{
  const r = ejecutar(
    'buscar_movimientos',
    { texto: 'mercadona', desde: null, hasta: null, categoria: null, importe_minimo: null },
    DATOS,
  ) as { encontrados: number; suma_de_todo_lo_encontrado: { centimos: number }; recortado: boolean };
  comprobar(r.encontrados === 2, 'busca sin distinguir mayúsculas', r.encontrados);
  comprobar(r.suma_de_todo_lo_encontrado.centimos === -37050, 'y suma lo encontrado', r.suma_de_todo_lo_encontrado);
  comprobar(r.recortado === false, 'dice si ha recortado la lista');
}

{
  const r = ejecutar(
    'buscar_movimientos',
    { texto: 'nomina', desde: '2026-05-01', hasta: null, categoria: null, importe_minimo: null },
    DATOS,
  ) as { encontrados: number };
  comprobar(r.encontrados === 1, 'el filtro de fecha recorta', r.encontrados);
}

{
  const r = ejecutar(
    'buscar_movimientos',
    { texto: null, desde: null, hasta: null, categoria: null, importe_minimo: 400 },
    DATOS,
  ) as { encontrados: number };
  comprobar(r.encontrados === 4, 'el mínimo va sobre el valor absoluto: entran cargos y abonos', r.encontrados);
}

{
  // El contrato nuevo: los esquemas ya no llevan tipos unión —el modo estricto
  // los rechaza con un 400— así que «sin filtro» viaja como cadena vacía. Si
  // esto se rompiera, una búsqueda sin filtros devolvería cero en vez de todo.
  const r = ejecutar(
    'buscar_movimientos',
    { texto: '', desde: '', hasta: '', categoria: '', importe_minimo: 0 },
    DATOS,
  ) as { encontrados: number };
  comprobar(r.encontrados === DATOS.length, 'con todos los filtros vacíos salen todos', r.encontrados);

  const conEspacios = ejecutar(
    'buscar_movimientos',
    { texto: '   ', desde: '', hasta: '', categoria: '', importe_minimo: 0 },
    DATOS,
  ) as { encontrados: number };
  comprobar(conEspacios.encontrados === DATOS.length, 'y un filtro de sólo espacios tampoco filtra');

  const todo = ejecutar('gasto_por_categoria', { mes: '' }, DATOS) as { mes: string };
  comprobar(todo.mes === 'todo el histórico', 'el mes vacío significa todo el histórico', todo.mes);
}

{
  // Y ningún esquema puede volver a llevar un tipo unión sin que salte esto.
  const uniones = HERRAMIENTAS.filter((h) => {
    const props = (h.input_schema as { properties?: Record<string, { type?: unknown }> }).properties ?? {};
    return Object.values(props).some((p) => Array.isArray(p.type));
  });
  comprobar(uniones.length === 0, 'ningún parámetro usa tipo unión: el modo estricto los rechaza',
    uniones.map((h) => h.name));
}

// --- argumentos malos ------------------------------------------------------

comprobar(
  (ejecutar('resumen_mes', { mes: 'mayo' }, DATOS) as { error?: string }).error !== undefined,
  'un mes mal escrito se contesta con un error, no revienta',
);
comprobar(
  (ejecutar('resumen_mes', { mes: '2026-13' }, DATOS) as { error?: string }).error !== undefined,
  'y el mes 13 tampoco cuela',
);
comprobar(
  (ejecutar('no_existe', {}, DATOS) as { error?: string }).error !== undefined,
  'una herramienta inventada se contesta, no lanza',
);
comprobar(
  ((ejecutar('movimientos_mayores', { mes: '2026-05', tipo: 'gasto', cuantos: 999 }, DATOS) as {
    movimientos: unknown[];
  }).movimientos.length) <= 20,
  'pedir mil movimientos devuelve como mucho veinte',
);

// --- el mes de referencia --------------------------------------------------

comprobar(mesMasReciente(DATOS) === '2026-05', 'el mes más reciente es el que vale como «este mes»');
comprobar(mesMasReciente([]) === null, 'sin datos no hay mes de referencia');

console.log(fallos === 0 ? '\n✅ copiloto: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
