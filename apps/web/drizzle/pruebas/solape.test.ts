/**
 * El solape entre extractos, contra un Postgres de verdad.
 *
 *   DATABASE_URL=postgres://… npx tsx drizzle/pruebas/solape.test.ts
 *
 * Es el escenario que planteó Jordy y que el hash del fichero no cubre: bajas
 * junio-julio, y más tarde bajas mayo-agosto. Son dos ficheros distintos —dos
 * hashes distintos— con dos meses repetidos dentro. Sin comprobar movimiento a
 * movimiento, junio y julio entrarían dos veces y el panel diría que gastaste
 * el doble, con cada movimiento correcto uno por uno. Es el error más difícil
 * de detectar a ojo, porque nada parece mal.
 *
 * Se prueba contra Postgres y no con dobles de prueba a propósito: lo que hay
 * que verificar es que la expresión SQL que construye la huella y la de
 * TypeScript producen exactamente la misma cadena. Un simulacro daría por
 * bueno justo lo que puede fallar.
 */

import { sql } from 'drizzle-orm';

import { db, hayBaseDeDatos } from '@/lib/db';
import { ingerir, type ExtraccionJSON } from '@/lib/db/ingesta';
import { categorias, extractos, movimientos } from '@/lib/db/schema';

let fallos = 0;
function comprobar(ok: boolean, msg: string, detalle?: unknown) {
  if (ok) console.log(`OK  ${msg}`);
  else {
    fallos++;
    console.error(`!!  ${msg}`, detalle ?? '');
  }
}

const USUARIO = 'prueba-solape';

function mov(fecha: string, concepto: string, importe: string, posicion: number) {
  return { fecha, fecha_valor: null, concepto, importe, saldo: null, posicion };
}

function extracto(
  documento: string,
  movs: ExtraccionJSON['movimientos'],
  saldoInicial: string,
  saldoFinal: string,
): ExtraccionJSON {
  return {
    documento,
    banco: 'Banco de prueba',
    iban: null,
    periodo_inicio: movs[0].fecha,
    periodo_fin: movs[movs.length - 1].fecha,
    saldo_inicial: saldoInicial,
    saldo_final: saldoFinal,
    cuadra: true,
    movimientos: movs,
    hallazgos: [],
  };
}

/** Un PDF distinto por cada caso: el hash del fichero no debe salvarnos. */
function pdfFalso(semilla: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4 ${semilla}`);
}

async function main() {
  if (!hayBaseDeDatos) {
    console.error('Hace falta DATABASE_URL apuntando a un Postgres de pruebas.');
    process.exit(1);
  }

  const cliente = db();
  await cliente.delete(movimientos).where(sql`${movimientos.usuarioId} = ${USUARIO}`);
  await cliente.delete(extractos).where(sql`${extractos.usuarioId} = ${USUARIO}`);
  await cliente.delete(categorias).where(sql`${categorias.usuarioId} = ${USUARIO}`);

  // --- 1. Junio y julio ----------------------------------------------------
  const junioJulio = extracto(
    'junio-julio.pdf',
    [
      mov('2026-06-05', 'NOMINA JUNIO', '1850.00', 0),
      mov('2026-06-12', 'MERCADONA', '-61.20', 1),
      mov('2026-07-05', 'NOMINA JULIO', '1850.00', 2),
      mov('2026-07-20', 'CAFE', '-3.00', 3),
    ],
    '0.00',
    '3635.80',
  );

  const r1 = await ingerir(junioJulio, pdfFalso('a'), USUARIO);
  comprobar(r1.estado === 'guardado', 'el primer extracto entra', r1);
  comprobar(r1.estado === 'guardado' && r1.movimientos === 4, 'con sus cuatro movimientos', r1);

  // --- 2. Mayo a agosto, que repite junio y julio --------------------------
  const mayoAgosto = extracto(
    'mayo-agosto.pdf',
    [
      mov('2026-05-05', 'NOMINA MAYO', '1850.00', 0),
      mov('2026-06-05', 'NOMINA JUNIO', '1850.00', 1),
      mov('2026-06-12', 'MERCADONA', '-61.20', 2),
      mov('2026-07-05', 'NOMINA JULIO', '1850.00', 3),
      mov('2026-07-20', 'CAFE', '-3.00', 4),
      mov('2026-08-05', 'NOMINA AGOSTO', '1850.00', 5),
    ],
    '0.00',
    '7335.80',
  );

  const r2 = await ingerir(mayoAgosto, pdfFalso('b'), USUARIO);
  comprobar(r2.estado === 'guardado', 'el segundo extracto entra', r2);
  comprobar(
    r2.estado === 'guardado' && r2.solapados === 4,
    'reconoce los cuatro movimientos que ya estaban',
    r2,
  );
  comprobar(
    r2.estado === 'guardado' && r2.movimientos === 2,
    'y sólo guarda los dos nuevos',
    r2,
  );

  const [{ total }] = await cliente
    .select({ total: sql<number>`count(*)::int` })
    .from(movimientos)
    .where(sql`${movimientos.usuarioId} = ${USUARIO}`);
  comprobar(total === 6, 'en total hay seis movimientos, no diez', total);

  const [{ suma }] = await cliente
    .select({ suma: sql<string>`sum(${movimientos.importe})::text` })
    .from(movimientos)
    .where(sql`${movimientos.usuarioId} = ${USUARIO}`);
  comprobar(suma === '7335.80', 'y suman lo que debe sumar mayo-agosto', suma);

  // --- 3. Dos cafés iguales el mismo día son dos cafés ---------------------
  //     La deduplicación cuenta multiplicidades. Si mirase sólo si «existe»,
  //     se comería el segundo café y descuadraría el mes.
  const dosCafes = extracto(
    'dos-cafes.pdf',
    [
      mov('2026-09-01', 'CAFE', '-3.00', 0),
      mov('2026-09-01', 'CAFE', '-3.00', 1),
    ],
    '0.00',
    '-6.00',
  );
  const r3 = await ingerir(dosCafes, pdfFalso('c'), USUARIO);
  comprobar(
    r3.estado === 'guardado' && r3.movimientos === 2 && r3.solapados === 0,
    'dos apuntes idénticos el mismo día entran los dos',
    r3,
  );

  // Fichero distinto, contenido idéntico a lo ya guardado. No se crea un
  // extracto vacío: un extracto sin movimientos en la lista sería ruido, porque
  // parecería que subiste algo y que no se guardó nada.
  const r4 = await ingerir(dosCafes, pdfFalso('d'), USUARIO);
  comprobar(
    r4.estado === 'duplicado' && r4.movimientos === 2,
    'al repetirlos en otro fichero, no entra ninguno y no se crea extracto',
    r4,
  );

  // --- 4. El mismo fichero otra vez ----------------------------------------
  const r5 = await ingerir(junioJulio, pdfFalso('a'), USUARIO);
  comprobar(r5.estado === 'duplicado', 'el mismo fichero se reconoce por su hash', r5);

  // --- 5. Espacios de más no crean un movimiento nuevo ---------------------
  const conEspacios = extracto(
    'espacios.pdf',
    [mov('2026-06-12', '  MERCADONA   ', '-61.20', 0)],
    '0.00',
    '-61.20',
  );
  const r6 = await ingerir(conEspacios, pdfFalso('e'), USUARIO);
  comprobar(
    r6.estado === 'duplicado' && r6.movimientos === 1,
    'el mismo concepto con espacios distintos sigue siendo el mismo movimiento',
    r6,
  );

  const [{ total: tras }] = await cliente
    .select({ total: sql<number>`count(*)::int` })
    .from(extractos)
    .where(sql`${extractos.usuarioId} = ${USUARIO}`);
  comprobar(tras === 3, 'y no quedan extractos vacíos en la lista', tras);

  // --- 6. Un extracto sin saldos declarados (un CSV o un Excel) ------------
  //     La comprobación posterior al guardado compara los saldos en SQL. Con
  //     NULL esa comparación da NULL —ni verdadero ni falso—, y tomarlo por
  //     «no cuadra» abortaba la transacción de todos los tabulares.
  const sinSaldos: ExtraccionJSON = {
    documento: 'sin-saldos.csv',
    banco: null,
    iban: null,
    periodo_inicio: '2026-01-08',
    periodo_fin: '2026-01-09',
    saldo_inicial: null,
    saldo_final: null,
    cuadra: true,
    movimientos: [
      mov('2026-01-08', 'COMPRA SIN SALDO UNO', '-11.11', 0),
      mov('2026-01-09', 'COMPRA SIN SALDO DOS', '-22.22', 1),
    ],
    hallazgos: [],
  };
  const r7 = await ingerir(sinSaldos, pdfFalso('f'), USUARIO);
  comprobar(
    r7.estado === 'guardado' && r7.movimientos === 2,
    'un extracto sin saldos declarados se guarda',
    r7,
  );

  await cliente.delete(movimientos).where(sql`${movimientos.usuarioId} = ${USUARIO}`);
  await cliente.delete(extractos).where(sql`${extractos.usuarioId} = ${USUARIO}`);
  await cliente.delete(categorias).where(sql`${categorias.usuarioId} = ${USUARIO}`);

  console.log(fallos === 0 ? '\n✅ solape: todo en verde' : `\n❌ ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
