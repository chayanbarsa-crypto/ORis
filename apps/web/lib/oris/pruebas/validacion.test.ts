/**
 * Pruebas de la validación de extracciones.
 *
 *   npx tsx lib/oris/pruebas/validacion.test.ts
 *
 * Estas comprobaciones son las que deciden si el dinero de un extracto entra
 * en la base de datos o no, así que lo que se prueba aquí no es que devuelvan
 * algo, sino que **no dejen pasar** lo que no cuadra. Cada caso corresponde a
 * un fallo que el modelo puede cometer escribiendo una respuesta impecable.
 *
 * Los mismos casos existen en `packages/core/tests/test_extractos.py` para el
 * extractor de Python. Son dos motores; el veredicto tiene que ser el mismo.
 */

import { ibanValido, validar, type Extraccion, type MovimientoExtraido } from '../validacion';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

function m(p: Partial<MovimientoExtraido> & { importe: string }): MovimientoExtraido {
  return {
    fecha: '2026-05-10',
    fecha_valor: null,
    concepto: 'x',
    saldo: null,
    ...p,
  };
}

function extraccion(p: Partial<Extraccion> = {}): Extraccion {
  return {
    banco: 'Banco de prueba',
    iban: null,
    periodo_inicio: '2026-05-01',
    periodo_fin: '2026-05-31',
    saldo_inicial: '100.00',
    saldo_final: '100.00',
    movimientos: [],
    paginas_ilegibles: [],
    ...p,
  };
}

function regla(v: ReturnType<typeof validar>, nombre: string) {
  return v.hallazgos.find((h) => h.regla === nombre);
}

// --- el cuadre ------------------------------------------------------------

{
  const v = validar(
    extraccion({
      saldo_inicial: '100.00',
      saldo_final: '80.50',
      movimientos: [m({ importe: '-30.00' }), m({ importe: '10.50' })],
    }),
  );
  comprobar(v.cuadra, 'un extracto que cuadra, cuadra');
  comprobar(v.suma === -1950, 'la suma sale en céntimos', v.suma);
  comprobar(regla(v, 'Cuadre de saldos')?.estado === 'Cumple', 'y lo dice como Cumple');
}

{
  // Falta un apunte de 5,00: la respuesta del modelo es válida y está mal.
  const v = validar(
    extraccion({
      saldo_inicial: '100.00',
      saldo_final: '80.50',
      movimientos: [m({ importe: '-30.00' }), m({ importe: '5.50' })],
    }),
  );
  comprobar(!v.cuadra, 'un movimiento que falta rompe el cuadre');
  const h = regla(v, 'Cuadre de saldos');
  comprobar(h?.severidad === 'Crítica', 'y es crítico');
  comprobar(!!h?.evidencia.includes('80,50'), 'la evidencia cita las dos cifras', h?.evidencia);
}

{
  // El caso peligroso: 0.1 + 0.2 en coma flotante da 0.30000000000000004 y el
  // cuadre fallaría por un céntimo inexistente.
  const v = validar(
    extraccion({
      saldo_inicial: '0.00',
      saldo_final: '0.30',
      movimientos: [m({ importe: '0.10' }), m({ importe: '0.20' })],
    }),
  );
  comprobar(v.cuadra, 'céntimos: 0,10 + 0,20 = 0,30 exacto');
}

{
  const v = validar(extraccion({ saldo_inicial: null }));
  comprobar(!v.cuadra, 'sin saldo inicial ni cadena de saldos no se da por bueno');
  comprobar(v.bloqueantes.length === 1, 'y el bloqueo se declara como tal', v.bloqueantes);
  comprobar(
    v.bloqueantes[0]?.regla === 'Cuadre de saldos',
    'nombrando la comprobación que falló',
    v.bloqueantes[0],
  );
}

{
  // Muchos extractos no declaran los saldos del periodo pero sí imprimen el
  // saldo tras cada apunte. Una cadena completa y sin rupturas demuestra lo
  // mismo que el cuadre: que no falta ninguno por el camino.
  const v = validar(
    extraccion({
      saldo_inicial: null,
      saldo_final: null,
      movimientos: [
        m({ importe: '-10.00', saldo: '90.00', concepto: 'UNO' }),
        m({ importe: '-20.00', saldo: '70.00', concepto: 'DOS' }),
      ],
    }),
  );
  comprobar(v.cuadra, 'sin saldos declarados pero con cadena intacta, se acepta');
  comprobar(v.bloqueantes.length === 0, 'y nada bloquea');
}

{
  const v = validar(
    extraccion({
      saldo_inicial: null,
      saldo_final: null,
      movimientos: [
        m({ importe: '-10.00', saldo: '90.00', concepto: 'UNO' }),
        m({ importe: '-20.00', saldo: '65.00', concepto: 'DOS' }),
      ],
    }),
  );
  comprobar(!v.cuadra, 'pero si la cadena se rompe, no');
}

{
  // El orden de fechas es un aviso, no un bloqueo: los bancos ordenan por
  // fecha valor y esto pasa a menudo en extractos perfectamente completos.
  const v = validar(
    extraccion({
      movimientos: [
        m({ importe: '0.00', fecha: '2026-08-18', concepto: 'UNO' }),
        m({ importe: '0.00', fecha: '2026-08-17', concepto: 'DOS' }),
      ],
    }),
  );
  comprobar(
    v.bloqueantes.every((h) => h.regla !== 'Orden cronológico'),
    'el desorden de fechas nunca es el motivo del rechazo',
    v.bloqueantes,
  );
}

{
  // Un importe mal formado valdría cero al sumar, y el cuadre podría salir
  // bien por casualidad. Tiene que rechazarse igual.
  const v = validar(
    extraccion({
      saldo_inicial: '100.00',
      saldo_final: '100.00',
      movimientos: [m({ importe: '1.234,56', concepto: 'RARO' })],
    }),
  );
  comprobar(!v.cuadra, 'un importe fuera de formato invalida la extracción');
  comprobar(regla(v, 'Formato de importes')?.severidad === 'Crítica', 'y es crítico');
}

// --- continuidad del saldo ------------------------------------------------

{
  const v = validar(
    extraccion({
      saldo_inicial: '100.00',
      saldo_final: '70.00',
      movimientos: [
        m({ importe: '-10.00', saldo: '90.00', concepto: 'UNO' }),
        m({ importe: '-20.00', saldo: '70.00', concepto: 'DOS' }),
      ],
    }),
  );
  comprobar(!regla(v, 'Continuidad del saldo'), 'cadena de saldos intacta: sin hallazgo');
}

{
  const v = validar(
    extraccion({
      saldo_inicial: '100.00',
      saldo_final: '65.00',
      movimientos: [
        m({ importe: '-10.00', saldo: '90.00', concepto: 'UNO' }),
        m({ importe: '-20.00', saldo: '65.00', concepto: 'DOS' }),
      ],
    }),
  );
  const h = regla(v, 'Continuidad del saldo');
  comprobar(!!h, 'un salto en el saldo se detecta');
  comprobar(!!h?.evidencia.includes('DOS'), 'y la evidencia dice dónde', h?.evidencia);
}

// --- orden cronológico ----------------------------------------------------

{
  const v = validar(
    extraccion({
      movimientos: [
        m({ importe: '0.00', fecha: '2026-05-10', concepto: 'UNO' }),
        m({ importe: '0.00', fecha: '2026-05-03', concepto: 'DOS' }),
      ],
    }),
  );
  comprobar(!!regla(v, 'Orden cronológico'), 'fechas hacia atrás se detectan');
  comprobar(v.cuadra, 'pero no invalidan el cuadre: es un aviso, no un error de importes');
}

// --- páginas ilegibles ----------------------------------------------------

{
  const v = validar(extraccion({ paginas_ilegibles: [4, 5] }));
  comprobar(!v.cuadra, 'páginas ilegibles impiden guardar');
  comprobar(regla(v, 'Integridad de la extracción')?.pagina === 4, 'apunta a la primera página');
}

// --- IBAN mod-97 ----------------------------------------------------------

comprobar(ibanValido('GB82 WEST 1234 5698 7654 32'), 'IBAN válido con espacios');
comprobar(ibanValido('ES9121000418450200051332'), 'IBAN español válido');
comprobar(!ibanValido('ES9121000418450200051333'), 'un dígito cambiado no cuela');
comprobar(!ibanValido('ES912100041845020005133'), 'longitud corta no cuela');
comprobar(!ibanValido('1S9121000418450200051332'), 'país que no son dos letras no cuela');

{
  const v = validar(extraccion({ iban: 'ES9121000418450200051333' }));
  comprobar(!!regla(v, 'Identificador de cuenta'), 'un IBAN malo se reporta');
  comprobar(v.cuadra, 'pero no impide guardar: el dinero es correcto aunque el IBAN se leyera mal');
}

console.log(fallos === 0 ? '\n✅ validación: todo en verde' : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
