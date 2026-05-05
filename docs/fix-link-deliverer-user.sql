-- ============================================================
-- Fix: vincula user_id ao registro de entregador existente
-- e cria o registro se ainda não existir.
--
-- Execute se já rodou seed-test-users.sql mas o entregador
-- ainda recebe 404 em GET /orders/my-deliveries.
--
-- ⚠️  Confirme o pizzeria_id antes de executar:
--     SELECT id, trade_name FROM pizzerias LIMIT 5;
-- ============================================================

DO $$
DECLARE
  v_pizzeria_id  TEXT := 'e89ec9b5-2d7b-44ee-bc2b-5e44e75f7c6e'; -- <-- confirme
  v_user_id      TEXT;
BEGIN

  -- Pega o UUID do usuário pelo e-mail
  SELECT id::text INTO v_user_id FROM users WHERE email = 'entregador@pizzaria.test';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário entregador@pizzaria.test não encontrado. Execute seed-test-users.sql primeiro.';
  END IF;

  -- Se já existe um deliverer sem user_id vinculado, atualiza
  UPDATE deliverers
  SET user_id = v_user_id
  WHERE pizzeria_id = v_pizzeria_id
    AND user_id IS NULL
    AND name = 'Entregador Teste';

  -- Se não existe nenhum deliverer vinculado, cria
  INSERT INTO deliverers (id, pizzeria_id, user_id, name, phone, vehicle, is_active, created_at)
  SELECT
    gen_random_uuid(),
    v_pizzeria_id,
    v_user_id,
    'Entregador Teste',
    '(11) 99999-0001',
    'Moto',
    true,
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM deliverers
    WHERE pizzeria_id = v_pizzeria_id AND user_id = v_user_id
  );

  RAISE NOTICE 'Entregador vinculado: user_id=% na pizzaria=%', v_user_id, v_pizzeria_id;
END $$;
