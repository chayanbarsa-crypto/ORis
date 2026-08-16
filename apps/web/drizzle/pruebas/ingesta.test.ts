/**
 * Prueba de la ingesta contra un Postgres real.
 *
 *   createdb oris_ingesta
 *   psql -d oris_ingesta -f drizzle/0000_modelo_inicial.sql
 *   DATABASE_URL=postgresql://... npx tsx drizzle/pruebas/ingesta.test.ts
 *
 * Comprueba las tres invariantes de `lib/db/ingesta.ts` — todo o nada,
 * lo que no cuadra no entra, un PDF una vez — y que el cuadre sobrevive al
 * viaje de texto a `numeric(14,2)`, que es donde un céntimo se perdería sin
 * que nadie lo notara.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { eq, sql } from 'drizzle-orm';

import { db } from '../../lib/db/index';
import { extractos, hallazgos, movimientos } from '../../lib/db/schema';
import { hashDocumento, ingerir, type ExtraccionJSON } from '../../lib/db/ingesta';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, '../../../..');
const USUARIO = 'prueba-ingesta';

let fallos = 0;
function comprobar(condicion: boolean, mensaje: string, detalle?: unknown) {
  if (condicion) {
    console.log(`OK  ${mensaje}`);
  } else {
    fallos++;
    console.error(`!!  ${mensaje}`, detalle ?? '');
  }
}

/** Convierte el fixture de oris_core al formato que produce `extraer.py --json`. */
function comoExtraccion(fixture: any, documento: string): ExtraccionJSON {
  return {
    documento,
    banco: fixture.banco,
    iban: fixture.iban,
    periodo_inicio: fixture.periodo_inicio,
    periodo_fin: fixture.periodo_fin,
    saldo_inicial: fixture.saldo_inicial,
    saldo_final: fixture.saldo_final,
    cuadra: true,
    movimientos: fixture.movimientos.map((m: any, i: number) => ({ ...m, posicion: i })),
    hallazgos: [
      {
        regla: 'Cuadre de saldos',
        severidad: 'Informativa',
        estado: 'Cumple',
        descripcion: `El cuadre da: ${fixture.movimientos.length} movimientos.`,
        evidencia: `${fixture.saldo_inicial} + suma = ${fixture.saldo_final}.`,
      },
    ],
  };
}

async function limpiar() {
  const cliente = db();
  await cliente.delete(extractos).where(eq(extractos.usuarioId, USUARIO));
}

async function main() {
  const cliente = db();
  await limpiar();

  const fixture = JSON.parse(
    readFileSync(
      join(RAIZ, 'packages/core/tests/fixtures/extracto_dos_columnas.json'),
      'utf8',
    ),
  );
  const pdf = new Uint8Array(
    readFileSync(join(RAIZ, 'packages/core/tests/fixtures/extracto_dos_columnas.pdf')),
  );
  const extraccion = comoExtraccion(fixture, 'extracto_dos_columnas.pdf');

  // --- 1. Guardado normal --------------------------------------------------
  const r1 = await ingerir(extraccion, pdf, USUARIO);
  comprobar(r1.estado === 'guardado', 'un extracto que cuadra se guarda', r1);
  comprobar(
    r1.estado === 'guardado' && r1.movimientos === fixture.movimientos.length,
    `se guardan los ${fixture.movimientos.length} movimientos`,
    r1,
  );

  // --- 2. El cuadre sobrevive al viaje a numeric ---------------------------
  // Join + group by, no subconsulta correlacionada: Drizzle no correlaciona
  // una `sql` anidada dentro del SELECT con la tabla del FROM exterior, y la
  // suma sale 0 sin dar ningún error — un fallo silencioso que sólo se ve
  // comparando contra la consulta escrita a mano.
  const [fila] = (await cliente.execute(sql`
    select e.saldo_inicial as inicial,
           e.saldo_final   as final,
           sum(m.importe)::text as suma,
           count(m.id)::int as n,
           (e.saldo_inicial + sum(m.importe) = e.saldo_final) as cuadra
    from extractos e
    join movimientos m on m.extracto_id = e.id
    where e.usuario_id = ${USUARIO}
    group by e.id, e.saldo_inicial, e.saldo_final
  `)) as unknown as Array<{
    inicial: string;
    final: string;
    suma: string;
    n: number;
    cuadra: boolean;
  }>;

  comprobar(fila.cuadra === true, 'el cuadre se recalcula en Postgres y da', fila);
  comprobar(
    fila.inicial === fixture.saldo_inicial && fila.final === fixture.saldo_final,
    'los saldos llegan intactos, sin redondeo',
    fila,
  );

  // Los céntimos sueltos: 0,10 y 0,20 deben seguir siendo exactos.
  const [centimos] = await cliente
    .select({ suma: sql<string>`sum(importe)::text` })
    .from(movimientos)
    .where(sql`${movimientos.usuarioId} = ${USUARIO} and concepto in ('CAFE','PAN')`);
  comprobar(centimos.suma === '-0.30', '0,10 + 0,20 sigue siendo 0,30 exacto', centimos);

  // --- 3. Deduplicación ----------------------------------------------------
  const r2 = await ingerir(extraccion, pdf, USUARIO);
  comprobar(r2.estado === 'duplicado', 'el mismo PDF por segunda vez se rechaza', r2);
  const [{ n: totalExtractos }] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(extractos)
    .where(eq(extractos.usuarioId, USUARIO));
  comprobar(totalExtractos === 1, 'no se ha creado un segundo extracto', { totalExtractos });

  // --- 4. Lo que no cuadra no entra ---------------------------------------
  const roto: ExtraccionJSON = {
    ...extraccion,
    documento: 'roto.pdf',
    cuadra: false,
    hallazgos: [
      {
        regla: 'Cuadre de saldos',
        severidad: 'Crítica',
        estado: 'No cumple',
        descripcion: 'Faltan 500,00 €.',
        evidencia: 'La suma no lleva del inicial al final.',
      },
    ],
  };
  const pdfRoto = new Uint8Array([...pdf, 0x0a]); // hash distinto
  const r3 = await ingerir(roto, pdfRoto, USUARIO);
  comprobar(r3.estado === 'rechazado', 'una extracción que no cuadra se rechaza', r3);
  comprobar(
    r3.estado === 'rechazado' && r3.motivo.includes('500,00'),
    'el motivo cita el hallazgo crítico',
    r3,
  );

  const [{ n: trasRechazo }] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(extractos)
    .where(eq(extractos.usuarioId, USUARIO));
  comprobar(trasRechazo === 1, 'el rechazo no ha escrito nada', { trasRechazo });

  // --- 5. Todo o nada: la transacción se deshace entera --------------------
  //     Se declara cuadrar, pero los importes no llevan del inicial al final.
  //     La comprobación final dentro de la transacción tiene que lanzar.
  const mentiroso: ExtraccionJSON = {
    ...extraccion,
    documento: 'mentiroso.pdf',
    cuadra: true,
    saldo_final: '9999.99', // no se corresponde con los movimientos
  };
  const pdfMentiroso = new Uint8Array([...pdf, 0x0a, 0x0a]);

  let lanzo = false;
  try {
    await ingerir(mentiroso, pdfMentiroso, USUARIO);
  } catch (e) {
    lanzo = true;
    comprobar(
      (e as Error).message.includes('no sobrevivió'),
      'la comprobación posterior al guardado detecta el descuadre',
      (e as Error).message.slice(0, 90),
    );
  }
  comprobar(lanzo, 'un cuadre falso lanza en vez de guardarse');

  const [{ n: finales }] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(extractos)
    .where(eq(extractos.usuarioId, USUARIO));
  comprobar(finales === 1, 'la transacción se deshizo: no quedó extracto huérfano', {
    finales,
  });
  const [{ n: movsHuerfanos }] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(movimientos)
    .where(sql`${movimientos.usuarioId} = ${USUARIO}`);
  comprobar(
    movsHuerfanos === fixture.movimientos.length,
    'ni movimientos huérfanos',
    { movsHuerfanos },
  );

  // --- 6. Los hallazgos se guardan junto a los datos que auditan -----------
  const [{ n: nHallazgos }] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(hallazgos);
  comprobar(nHallazgos >= 1, 'el hallazgo de cuadre queda guardado', { nHallazgos });

  await limpiar();
  console.log(fallos === 0 ? '\n✅ ingesta: todo en verde' : `\n❌ ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
