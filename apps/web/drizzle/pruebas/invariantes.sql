-- Comprobación de las invariantes del modelo contra un Postgres real.
--
--   createdb oris && psql -d oris -f drizzle/0000_modelo_inicial.sql
--   psql -v ON_ERROR_STOP=1 -d oris -f drizzle/pruebas/invariantes.sql
--
-- Si alguna falla, el ASSERT aborta el script.

BEGIN;

INSERT INTO extractos (usuario_id, nombre_fichero, hash, saldo_inicial, saldo_final)
VALUES ('u1', 'enero.pdf', 'sha256:aaa', 1000.00, 1000.30);

-- 1. Deduplicación: el mismo PDF, dos veces, para el mismo usuario.
DO $$
BEGIN
  BEGIN
    INSERT INTO extractos (usuario_id, nombre_fichero, hash)
    VALUES ('u1', 'enero-copia.pdf', 'sha256:aaa');
    RAISE EXCEPTION 'FALLO: se admitió un extracto duplicado';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK  duplicado rechazado por el índice único';
  END;
END $$;

-- 2. El mismo hash para OTRO usuario sí debe entrar.
INSERT INTO extractos (usuario_id, nombre_fichero, hash)
VALUES ('u2', 'enero.pdf', 'sha256:aaa');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM extractos WHERE hash = 'sha256:aaa') = 2,
    'FALLO: el hash debe poder repetirse entre usuarios distintos';
  RAISE NOTICE 'OK  el mismo hash convive entre usuarios distintos';
END $$;

-- 3. Aritmética exacta: con numeric, 0,10 + 0,20 = 0,30 clavado.
--    Con doble precisión daría 0,30000000000000004 y el cuadre del auditor
--    ("saldo inicial + movimientos = saldo final") fallaría por céntimos fantasma.
INSERT INTO movimientos (extracto_id, usuario_id, fecha, concepto, importe, posicion)
SELECT id, 'u1', DATE '2026-01-05', 'Café', 0.10, 1 FROM extractos WHERE usuario_id='u1'
UNION ALL
SELECT id, 'u1', DATE '2026-01-06', 'Pan',  0.20, 2 FROM extractos WHERE usuario_id='u1';

DO $$
DECLARE
  suma numeric;
  inicial numeric;
  final numeric;
BEGIN
  SELECT sum(importe) INTO suma FROM movimientos WHERE usuario_id = 'u1';
  ASSERT suma = 0.30, format('FALLO: suma exacta rota, salió %s', suma);
  RAISE NOTICE 'OK  0,10 + 0,20 = 0,30 exacto';

  SELECT saldo_inicial, saldo_final INTO inicial, final
  FROM extractos WHERE usuario_id = 'u1';
  ASSERT inicial + suma = final,
    format('FALLO: el cuadre no da; %s + %s <> %s', inicial, suma, final);
  RAISE NOTICE 'OK  saldo inicial + movimientos = saldo final';
END $$;

-- 4. Borrar el extracto arrastra sus movimientos y hallazgos.
INSERT INTO hallazgos (extracto_id, regla, pagina, severidad, estado, descripcion, evidencia)
SELECT id, 'Validación de Importes', 1, 'Crítica', 'No cumple',
       'El total no cuadra', 'Se lee «TOTAL 1.310,00 €»'
FROM extractos WHERE usuario_id = 'u1';

DELETE FROM extractos WHERE usuario_id = 'u1';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM movimientos) = 0, 'FALLO: movimientos huérfanos';
  ASSERT (SELECT count(*) FROM hallazgos)   = 0, 'FALLO: hallazgos huérfanos';
  RAISE NOTICE 'OK  el borrado en cascada no deja huérfanos';
END $$;

-- 5. Borrar una categoría NO borra el movimiento: lo deja sin categorizar.
INSERT INTO categorias (id, usuario_id, nombre)
VALUES ('11111111-1111-1111-1111-111111111111', 'u2', 'Alimentación');
INSERT INTO movimientos (extracto_id, usuario_id, fecha, concepto, importe, categoria_id, origen)
SELECT id, 'u2', DATE '2026-01-07', 'Mercadona', -42.10,
       '11111111-1111-1111-1111-111111111111', 'manual'
FROM extractos WHERE usuario_id = 'u2';

DELETE FROM categorias WHERE id = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM movimientos WHERE usuario_id = 'u2') = 1,
    'FALLO: borrar la categoría se llevó el movimiento por delante';
  ASSERT (SELECT categoria_id IS NULL FROM movimientos WHERE usuario_id = 'u2'),
    'FALLO: la referencia debería quedar a NULL';
  RAISE NOTICE 'OK  borrar una categoría descategoriza, no destruye el apunte';
END $$;

ROLLBACK;
