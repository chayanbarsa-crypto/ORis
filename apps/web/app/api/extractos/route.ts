/**
 * Subida de un extracto: PDF, Excel o CSV → auditoría → base de datos.
 *
 * El orden de los pasos es el contrato de esta ruta, y no es arbitrario:
 *
 *   1. Hash del fichero y comprobación de duplicado. Antes de gastar una
 *      llamada al modelo, porque volver a subir el mismo PDF desde el móvil es
 *      lo más fácil del mundo.
 *   2. Lectura. Un PDF pasa por el modelo porque hay que *ver* la maquetación
 *      en columnas; un Excel o un CSV los lee el código, que es exacto,
 *      instantáneo y gratis.
 *   3. **Validación determinista.** Aquí se decide si esto se guarda. El modelo
 *      no vota.
 *   4. Categorización por reglas, sólo si lo anterior pasó.
 *   5. Ingesta transaccional: o entra todo, o no entra nada.
 *
 * Lo que esta ruta nunca hace: guardar una parte. Un extracto al que le falten
 * apuntes produce un panel con cifras plausibles y falsas, que es peor que un
 * panel vacío porque nadie lo pone en duda.
 */

import { NextResponse } from 'next/server';

import { hayBaseDeDatos } from '@/lib/db';
import { hashDocumento, ingerir, type ExtraccionJSON } from '@/lib/db/ingesta';
import { categorizar } from '@/lib/oris/categorizar';
import { ErrorExtraccion, MODELO, extraer, hayClaveIA } from '@/lib/oris/extraccion';
import { formatoDe, leerTabular } from '@/lib/oris/formatos';
import { ErrorTabular } from '@/lib/oris/tabular';
import { validar } from '@/lib/oris/validacion';

// Node, no Edge: hacen falta `crypto`, el driver de Postgres y Buffer.
export const runtime = 'nodejs';

/**
 * Un extracto de siete páginas tarda minutos en extraerse. El máximo del plan
 * gratuito de Vercel es 300 s; si un día no llega, la salida no es subir este
 * número sino trocear el trabajo, porque el límite duro está en el plan.
 */
export const maxDuration = 300;

const MAX_MB = 32;

/** Mientras no haya login, todo lo subido pertenece al mismo usuario. */
const USUARIO = 'jordy';

export async function POST(req: Request) {
  if (!hayBaseDeDatos) {
    return error(503, 'No hay base de datos configurada, así que no hay dónde guardar nada.');
  }
  let fichero: File | null = null;
  try {
    const form = await req.formData();
    const valor = form.get('extracto');
    if (valor instanceof File) fichero = valor;
  } catch {
    return error(400, 'No pude leer el fichero enviado.');
  }

  if (!fichero) return error(400, 'Falta el fichero. Adjúntalo en el campo «extracto».');

  const formato = formatoDe(fichero.name);
  if (!formato) {
    return error(
      415,
      `No sé leer «${fichero.name}».`,
      'Acepto PDF, Excel (.xlsx, .xls) y CSV. Si tu banco ofrece Excel o CSV, ' +
        'usa ése: los números vienen exactos y no hay que interpretarlos.',
    );
  }
  // La clave de IA sólo hace falta para el PDF. Un CSV o un Excel se leen con
  // código, así que exigirla aquí bloquearía subidas que no la necesitan.
  if (formato === 'pdf' && !hayClaveIA()) {
    return error(
      503,
      'No hay ANTHROPIC_API_KEY configurada, así que no puedo leer un PDF.',
      'Añádela en Vercel y vuelve a desplegar — o descarga el extracto en Excel ' +
        'o CSV desde tu banco, que no necesita clave.',
    );
  }

  const mb = fichero.size / (1024 * 1024);
  if (mb > MAX_MB) {
    return error(
      413,
      `El PDF pesa ${mb.toFixed(1)} MB y el máximo son ${MAX_MB} MB.`,
      'Súbelo partido por meses.',
    );
  }
  const datos = new Uint8Array(await fichero.arrayBuffer());

  try {
    const extraido =
      formato === 'pdf'
        ? await extraer(datos, fichero.name)
        : await leerTabular(datos, formato);
    const veredicto = validar(extraido);

    // El veredicto manda. Si no cuadra, se devuelve el porqué con su evidencia
    // y no se toca la base de datos.
    if (!veredicto.cuadra) {
      const critico = veredicto.hallazgos.find((h) => h.estado === 'No cumple');
      return NextResponse.json(
        {
          estado: 'rechazado',
          mensaje: critico?.descripcion ?? 'La extracción no cuadra.',
          evidencia: critico?.evidencia ?? '',
          sugerencia: critico?.sugerencia ?? '',
          hallazgos: veredicto.hallazgos,
          movimientos: extraido.movimientos.length,
        },
        { status: 422 },
      );
    }

    const categorias = categorizar(extraido.movimientos);

    const paraIngesta: ExtraccionJSON = {
      documento: fichero.name,
      banco: extraido.banco,
      iban: extraido.iban,
      periodo_inicio: extraido.periodo_inicio,
      periodo_fin: extraido.periodo_fin,
      saldo_inicial: extraido.saldo_inicial,
      saldo_final: extraido.saldo_final,
      cuadra: true,
      movimientos: extraido.movimientos.map((m, i) => ({
        fecha: m.fecha,
        fecha_valor: m.fecha_valor,
        concepto: m.concepto,
        importe: m.importe,
        saldo: m.saldo,
        posicion: i,
        categoria: categorias.categorias[i]?.categoria ?? null,
        origen: categorias.categorias[i]?.origen ?? null,
      })),
      hallazgos: veredicto.hallazgos.map((h) => ({
        regla: h.regla,
        severidad: h.severidad,
        estado: h.estado,
        descripcion: h.descripcion,
        evidencia: h.evidencia,
      })),
    };

    const resultado = await ingerir(paraIngesta, datos, USUARIO);

    if (resultado.estado === 'rechazado') {
      return NextResponse.json({ estado: 'rechazado', mensaje: resultado.motivo }, { status: 422 });
    }

    return NextResponse.json({
      estado: resultado.estado,
      extractoId: resultado.extractoId,
      movimientos: resultado.movimientos,
      banco: extraido.banco,
      periodo: { inicio: extraido.periodo_inicio, fin: extraido.periodo_fin },
      categorizados: categorias.categorizados,
      sinCategorizar: categorias.sinCategorizar,
      hallazgos: veredicto.hallazgos,
      formato,
      // Un tabular no pasa por el modelo, y decirlo importa: nadie tuvo que
      // interpretar esas cifras.
      modelo: formato === 'pdf' ? MODELO : null,
      hash: hashDocumento(datos),
    });
  } catch (e) {
    if (e instanceof ErrorExtraccion) {
      return error(502, e.message, e.sugerencia);
    }
    if (e instanceof ErrorTabular) {
      return error(422, e.message, e.sugerencia);
    }
    // Lo inesperado se registra entero en el servidor y sale resumido: el
    // mensaje de un error de driver puede llevar dentro la cadena de conexión.
    console.error('[extractos] fallo inesperado', e);
    return error(500, 'Algo falló al procesar el extracto y no se guardó nada.');
  }
}

function error(status: number, mensaje: string, sugerencia = '') {
  return NextResponse.json({ estado: 'error', mensaje, sugerencia }, { status });
}
