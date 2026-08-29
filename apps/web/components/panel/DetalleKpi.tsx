'use client';

/**
 * Lo que se abre al pulsar una cifra del resumen.
 *
 * Un KPI dice «cuánto». Al abrirlo nadie quiere el mismo número más grande:
 * quiere **de qué está hecho** y **contra qué se compara**. Esas son las dos
 * secciones fijas de cada detalle, y por eso los cuatro se parecen entre sí
 * aunque contengan cosas distintas — aprendido uno, se leen los cuatro.
 *
 * Se abre debajo de la fila, no en un modal. Un modal tapa las otras tres
 * cifras justo cuando se está comparando con ellas, y en móvil se come la
 * pantalla entera para enseñar cinco líneas.
 *
 * Sobre el color: los netos mensuales van todos del mismo tono, creciendo
 * arriba o abajo desde una línea central. El signo lo lleva la posición, que se
 * lee sin leyenda y funciona igual en escala de grises. Pintar los negativos de
 * otro color exigiría una pareja divergente validada, y el ámbar que hay está
 * reservado para «sin categorizar»: reusarlo aquí rompería su significado.
 */

import { useMemo, type ReactNode } from 'react';

import { aCentimos, formatear, nombreMes, type Centimos } from '@/lib/oris/dinero';
import {
  desglosarGasto,
  type MovimientoVista,
  type ResumenMes,
} from '@/lib/oris/agregados';
import {
  cobertura,
  compararConAnterior,
  ingresosPorOrigen,
  mayores,
  medidaGastos,
  medidaIngresos,
  medidaNeto,
  tasaDeAhorro,
  traspasosDelMes,
  type LineaDetalle,
  type Variacion,
} from '@/lib/oris/detalle';
import { serieMensual } from '@/lib/oris/series';
import { BARRA } from '@/lib/oris/paleta';

export type TipoKpi = 'ingresos' | 'gastos' | 'neto' | 'traspasos';

/** Alto en píxeles de cada mitad del gráfico de netos: arriba y abajo del cero. */
const ALTO_MINI = 40;

const MESES_MINI = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface DetalleKpiProps {
  tipo: TipoKpi;
  movimientos: readonly MovimientoVista[];
  mes: string;
  resumen: ResumenMes;
  onCerrar: () => void;
  id: string;
}

export function DetalleKpi({ tipo, movimientos, mes, resumen, onCerrar, id }: DetalleKpiProps) {
  return (
    <section
      id={id}
      className="mb-6 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-4 sm:px-5"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-light text-white/80">{TITULOS[tipo]}</h3>
          <p className="mt-0.5 text-[0.7rem] text-white/35">{nombreMes(mes)}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-[0.7rem] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/75 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
        >
          Cerrar
        </button>
      </div>

      {tipo === 'ingresos' ? <Ingresos movimientos={movimientos} mes={mes} resumen={resumen} /> : null}
      {tipo === 'gastos' ? <Gastos movimientos={movimientos} mes={mes} resumen={resumen} /> : null}
      {tipo === 'neto' ? <Neto movimientos={movimientos} mes={mes} resumen={resumen} /> : null}
      {tipo === 'traspasos' ? <Traspasos movimientos={movimientos} mes={mes} /> : null}
    </section>
  );
}

const TITULOS: Record<TipoKpi, string> = {
  ingresos: 'De dónde viene el dinero',
  gastos: 'En qué se va',
  neto: 'Qué queda al final del mes',
  traspasos: 'Dinero que sólo cambió de sitio',
};

// --- ingresos ---------------------------------------------------------------

function Ingresos({
  movimientos,
  mes,
  resumen,
}: {
  movimientos: readonly MovimientoVista[];
  mes: string;
  resumen: ResumenMes;
}) {
  const origenes = useMemo(() => ingresosPorOrigen(movimientos, mes), [movimientos, mes]);
  const variacion = useMemo(
    () => compararConAnterior(movimientos, mes, medidaIngresos),
    [movimientos, mes],
  );

  if (resumen.ingresos === 0) {
    return <Vacio texto="Este mes no entró nada que no fuera un traspaso entre cuentas tuyas." />;
  }

  // La dependencia de la fuente principal: si una sola cosa trae más de la
  // mitad de lo que entra, eso es la respuesta a «qué pasa si se cae».
  const principal = origenes[0];

  return (
    <div className="space-y-5">
      <Cabecera valor={resumen.ingresos} variacion={variacion} />

      <Barras lineas={origenes} etiqueta="Por origen" />

      <Nota>
        {origenes.length === 1
          ? 'Todo lo que entró vino del mismo sitio.'
          : `${origenes.length} orígenes distintos. El mayor, ${principal.clave}, trae ${Math.round(
              principal.proporcion * 100,
            )} % de lo que entra${principal.proporcion > 0.6 ? ' — si eso falla, falla el mes' : ''}.`}{' '}
        Los nombres salen del concepto del banco: agrupan para leerlos de un
        vistazo, y alguno puede quedar raro. Las cifras salen de los
        movimientos, no de los grupos.
      </Nota>
    </div>
  );
}

// --- gastos -----------------------------------------------------------------

function Gastos({
  movimientos,
  mes,
  resumen,
}: {
  movimientos: readonly MovimientoVista[];
  mes: string;
  resumen: ResumenMes;
}) {
  const caros = useMemo(() => mayores(movimientos, mes, 'gasto', 5), [movimientos, mes]);
  const categorias = useMemo(() => desglosarGasto(movimientos, mes), [movimientos, mes]);
  const variacion = useMemo(
    () => compararConAnterior(movimientos, mes, medidaGastos),
    [movimientos, mes],
  );
  const tramo = useMemo(() => cobertura(movimientos, mes), [movimientos, mes]);

  if (resumen.gastos === 0) {
    return <Vacio texto="No hay ningún cargo registrado en este mes." />;
  }

  const media = tramo ? Math.round(resumen.gastos / tramo.dias) : null;
  // `aCentimos` y no `Number(...) * 100`: el importe llega como cadena de
  // `numeric(14,2)` y multiplicar en coma flotante lo estropea antes de sumarlo.
  const cinco = caros.reduce((acc, m) => acc + Math.abs(aCentimos(m.importe) ?? 0), 0);

  return (
    <div className="space-y-5">
      <Cabecera valor={resumen.gastos} variacion={variacion} />

      <div className="grid grid-cols-2 gap-3">
        <Dato
          titulo="Al día"
          valor={media === null ? '—' : formatear(media)}
          pie={tramo ? `entre el ${tramo.desde} y el ${tramo.hasta}, que es lo que cubren los datos` : ''}
        />
        <Dato
          titulo="Los cinco mayores"
          valor={`${Math.round((cinco / resumen.gastos) * 100)} %`}
          pie={`de todo el gasto del mes, en ${caros.length} movimiento${caros.length === 1 ? '' : 's'}`}
        />
      </div>

      <div>
        <Titulo>Lo más caro</Titulo>
        <ul className="mt-2 space-y-1.5">
          {caros.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 text-[0.78rem]">
              <span className="min-w-0 truncate text-white/70">
                <span className="mr-2 tabular-nums text-white/30">{m.fecha.slice(8, 10)}</span>
                {m.concepto}
              </span>
              <span className="shrink-0 tabular-nums text-white/60">
                {formatear(Math.abs(aCentimos(m.importe) ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Nota>
        Una categoría de mil euros puede ser una compra o cuarenta cafés, y no se
        decide lo mismo en un caso que en el otro. Por eso aquí van los
        movimientos sueltos y no otro reparto por categoría — ese está abajo
        {categorias.length > 0
          ? `, con ${categorias.length} categoría${categorias.length === 1 ? '' : 's'}`
          : ''}.
      </Nota>
    </div>
  );
}

// --- neto -------------------------------------------------------------------

function Neto({
  movimientos,
  mes,
  resumen,
}: {
  movimientos: readonly MovimientoVista[];
  mes: string;
  resumen: ResumenMes;
}) {
  const variacion = useMemo(
    () => compararConAnterior(movimientos, mes, medidaNeto),
    [movimientos, mes],
  );
  const serie = useMemo(() => serieMensual(movimientos).slice(-6), [movimientos]);
  const tasa = tasaDeAhorro(resumen.ingresos, resumen.neto);

  const tope = Math.max(1, ...serie.map((p) => Math.abs(p.neto)));

  return (
    <div className="space-y-5">
      <Cabecera valor={resumen.neto} variacion={variacion} conSigno />

      {/* La resta, escrita. Es la única forma de que nadie tenga que fiarse de
          que el número de arriba está bien: se ve de dónde sale. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.82rem] tabular-nums text-white/55">
        <span>{formatear(resumen.ingresos)} que entran</span>
        <span className="text-white/25">−</span>
        <span>{formatear(resumen.gastos)} que salen</span>
        <span className="text-white/25">=</span>
        <span className="text-white/85">{formatear(resumen.neto, { signo: true })}</span>
      </div>

      {tasa !== null ? (
        <Dato
          titulo="Tasa de ahorro"
          valor={`${Math.round(tasa * 100)} %`}
          pie={
            tasa < 0
              ? 'de lo que entró; en negativo significa que el mes se pagó con dinero de antes'
              : 'de lo que entró se quedó sin gastar'
          }
        />
      ) : null}

      {serie.length > 1 ? (
        <div>
          <Titulo>Los últimos meses</Titulo>
          {/* La línea de cero cruza entera por detrás de las columnas. Un
              trocito de línea bajo cada una no es una referencia: es un
              subrayado, y no se puede comparar contra él. */}
          <div className="relative mt-3 flex items-stretch gap-2">
            <span
              className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
              style={{ background: 'rgba(255,255,255,0.14)' }}
            />
            {serie.map((p) => {
              const alto = Math.max(3, (Math.abs(p.neto) / tope) * ALTO_MINI);
              const actual = p.mes === mes;
              return (
                <div
                  key={p.mes}
                  className="flex flex-1 flex-col items-center"
                  title={`${nombreMes(p.mes)}: ${formatear(p.neto, { signo: true })}`}
                >
                  <div className="flex w-full items-end justify-center" style={{ height: ALTO_MINI }}>
                    {p.neto > 0 ? (
                      <span
                        className="w-full max-w-[38px] rounded-t-[3px]"
                        style={{ height: alto, background: BARRA, opacity: actual ? 1 : 0.5 }}
                      />
                    ) : null}
                  </div>
                  <div className="flex w-full items-start justify-center" style={{ height: ALTO_MINI }}>
                    {p.neto < 0 ? (
                      <span
                        className="w-full max-w-[38px] rounded-b-[3px]"
                        style={{ height: alto, background: BARRA, opacity: actual ? 1 : 0.5 }}
                      />
                    ) : null}
                  </div>
                  <span
                    className={`mt-1 text-[0.62rem] tabular-nums ${
                      actual ? 'text-white/65' : 'text-white/30'
                    }`}
                  >
                    {MESES_MINI[Number(p.mes.slice(5)) - 1]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[0.68rem] text-white/30">
            Arriba de la línea, meses que cerraron en positivo; abajo, los que no.
            El más alto son {formatear(tope)}.
          </p>
        </div>
      ) : null}

      <Nota>
        El neto no es el saldo de la cuenta. Es lo que este mes ha sumado o
        restado a lo que ya hubiera: con cuánto empezaste lo dice el extracto, y
        muchos no lo dicen.
      </Nota>
    </div>
  );
}

// --- traspasos --------------------------------------------------------------

function Traspasos({ movimientos, mes }: { movimientos: readonly MovimientoVista[]; mes: string }) {
  const t = useMemo(() => traspasosDelMes(movimientos, mes), [movimientos, mes]);

  if (t.lista.length === 0) {
    return <Vacio texto="Este mes no hay ningún movimiento marcado como traspaso entre cuentas tuyas." />;
  }

  const descuadre = t.entradas - t.salidas;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Dato titulo="Ha entrado" valor={formatear(t.entradas)} pie="desde otra cuenta tuya" />
        <Dato titulo="Ha salido" valor={formatear(t.salidas)} pie="hacia otra cuenta tuya" />
      </div>

      <div>
        <Titulo>Los movimientos</Titulo>
        <ul className="mt-2 space-y-1.5">
          {t.lista.map((m) => {
            const centimos = aCentimos(m.importe) ?? 0;
            return (
              <li key={m.id} className="flex items-baseline justify-between gap-3 text-[0.78rem]">
                <span className="min-w-0 truncate text-white/70">
                  <span className="mr-2 tabular-nums text-white/30">{m.fecha.slice(8, 10)}</span>
                  {m.concepto}
                </span>
                <span className="shrink-0 tabular-nums text-white/60">
                  {centimos >= 0 ? 'entra ' : 'sale '}
                  {formatear(Math.abs(centimos))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <Nota>
        Nada de esto es ingreso ni gasto: mover dinero de una cuenta tuya a otra
        no te hace más rico ni más pobre. Se cuenta aparte porque en el extracto
        de referencia 8 de 15 «ingresos» eran esto, y sumarlos inflaba el mes en
        cientos de euros.
        {descuadre !== 0 ? (
          <>
            {' '}
            Aquí entradas y salidas no cuadran por {formatear(Math.abs(descuadre))}: lo
            normal es que la otra cuenta no esté cargada, y entonces sólo se ve
            media vuelta del viaje.
          </>
        ) : null}
      </Nota>
    </div>
  );
}

// --- piezas comunes ---------------------------------------------------------

function Cabecera({
  valor,
  variacion,
  conSigno,
}: {
  valor: Centimos;
  variacion: Variacion | null;
  conSigno?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="whitespace-nowrap text-2xl font-light tabular-nums text-white/90">
        {formatear(valor, { signo: conSigno })}
      </span>
      {variacion ? (
        <span className="text-[0.75rem] text-white/45">
          {textoVariacion(variacion)}
        </span>
      ) : (
        <span className="text-[0.72rem] text-white/30">
          Sin el mes anterior cargado no hay con qué comparar
        </span>
      )}
    </div>
  );
}

/**
 * La comparación, en palabras.
 *
 * No lleva flecha verde ni roja: «gastas más» no siempre es malo —puede ser una
 * mudanza— y una flecha roja lo juzga sin saber. Se dice cuánto ha cambiado y
 * el usuario decide si eso está bien.
 */
function textoVariacion(v: Variacion): string {
  if (v.diferencia === 0) return `Igual que en ${nombreMes(v.mes)}`;
  const verbo = v.diferencia > 0 ? 'más' : 'menos';
  const pct = v.relativa === null ? '' : ` (${Math.abs(Math.round(v.relativa * 100))} %)`;
  return `${formatear(Math.abs(v.diferencia))} ${verbo}${pct} que en ${nombreMes(v.mes)}`;
}

function Barras({ lineas, etiqueta }: { lineas: readonly LineaDetalle[]; etiqueta: string }) {
  const mayor = lineas[0]?.total || 1;
  return (
    <div>
      <Titulo>{etiqueta}</Titulo>
      <ul className="mt-2 space-y-2">
        {lineas.map((l) => (
          <li key={l.clave}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.78rem]">
              <span className="min-w-0 truncate text-white/75">{l.clave}</span>
              <span className="shrink-0 tabular-nums text-white/55">
                {formatear(l.total)}
                <span className="ml-2 text-white/30">{Math.round(l.proporcion * 100)} %</span>
              </span>
            </div>
            <div
              className="h-[6px] w-full overflow-hidden rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              role="img"
              aria-label={`${l.clave}: ${formatear(l.total)}, ${l.movimientos} movimiento${
                l.movimientos === 1 ? '' : 's'
              }`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, (l.total / mayor) * 100)}%`, background: BARRA, opacity: 0.85 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[0.6rem] uppercase tracking-[0.18em] text-white/35">{titulo}</p>
      <p className="mt-1 whitespace-nowrap text-base font-light tabular-nums text-white/80">{valor}</p>
      {pie ? <p className="mt-0.5 text-[0.66rem] leading-snug text-white/30">{pie}</p> : null}
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h4 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/40">{children}</h4>;
}

function Nota({ children }: { children: ReactNode }) {
  return <p className="text-[0.7rem] leading-relaxed text-white/30">{children}</p>;
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-2 text-[0.8rem] text-white/40">{texto}</p>;
}
