-- ============================================================
-- Seed: usuários de teste por role (entregador, atendente, cozinha)
-- Executar no SQL Editor do Supabase
--
-- ⚠️  Confirme o pizzeria_id antes de executar:
--     SELECT id, trade_name FROM pizzerias LIMIT 5;
--
-- Senha padrão de todos: Senha@123
-- ============================================================

DO $$
DECLARE
  pizzeria_id     UUID := 'e89ec9b5-2d7b-44ee-bc2b-5e44e75f7c6e'; -- <-- confirme

  uid_entregador  UUID := gen_random_uuid();
  uid_atendente   UUID := gen_random_uuid();
  uid_cozinha     UUID := gen_random_uuid();

  senha_hash      TEXT := crypt('Senha@123', gen_salt('bf'));
  now_ts          TIMESTAMPTZ := now();
BEGIN

  -- ── 1. Supabase Auth ─────────────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES
    (uid_entregador,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'entregador@pizzaria.test', senha_hash,
     now_ts, now_ts, now_ts,
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     false, '', '', '', ''),
    (uid_atendente,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'atendente@pizzaria.test', senha_hash,
     now_ts, now_ts, now_ts,
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     false, '', '', '', ''),
    (uid_cozinha,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cozinha@pizzaria.test', senha_hash,
     now_ts, now_ts, now_ts,
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     false, '', '', '', '');

  -- ── 2. Identidades (necessário para login por e-mail funcionar) ───────────────
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), uid_entregador, uid_entregador::text, 'email',
     jsonb_build_object('sub', uid_entregador::text, 'email', 'entregador@pizzaria.test'),
     now_ts, now_ts, now_ts),
    (gen_random_uuid(), uid_atendente, uid_atendente::text, 'email',
     jsonb_build_object('sub', uid_atendente::text, 'email', 'atendente@pizzaria.test'),
     now_ts, now_ts, now_ts),
    (gen_random_uuid(), uid_cozinha, uid_cozinha::text, 'email',
     jsonb_build_object('sub', uid_cozinha::text, 'email', 'cozinha@pizzaria.test'),
     now_ts, now_ts, now_ts);

  -- ── 3. Tabela users — UPSERT (trigger pode ter criado o registro antes) ───────
  INSERT INTO users (id, name, email, role, is_active, created_at)
  VALUES
    (uid_entregador, 'Entregador Teste', 'entregador@pizzaria.test', 'entregador', true, now_ts),
    (uid_atendente,  'Atendente Teste',  'atendente@pizzaria.test',  'atendente',  true, now_ts),
    (uid_cozinha,    'Cozinha Teste',    'cozinha@pizzaria.test',    'cozinha',    true, now_ts)
  ON CONFLICT (id) DO UPDATE SET
    name      = EXCLUDED.name,
    email     = EXCLUDED.email,
    role      = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

  -- ── 4. Vincular à pizzaria ────────────────────────────────────────────────────
  INSERT INTO user_pizzeria_roles (id, user_id, pizzeria_id, role, is_active, invited_at, accepted_at)
  VALUES
    (gen_random_uuid(), uid_entregador, pizzeria_id, 'entregador', true, now_ts, now_ts),
    (gen_random_uuid(), uid_atendente,  pizzeria_id, 'atendente',  true, now_ts, now_ts),
    (gen_random_uuid(), uid_cozinha,    pizzeria_id, 'cozinha',    true, now_ts, now_ts);

  -- ── 5. Criar registro de entregador e vincular ao usuário ─────────────────────
  -- O endpoint GET /orders/my-deliveries busca deliverers.user_id = :userId
  -- Se não existir o registro ou user_id não estiver preenchido, retorna 404.
  INSERT INTO deliverers (id, pizzeria_id, user_id, name, phone, vehicle, is_active, created_at)
  VALUES (
    gen_random_uuid()::text,
    pizzeria_id,
    uid_entregador,
    'Entregador Teste',
    '(11) 99999-0001',
    'Moto',
    true,
    now_ts
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Usuários criados com sucesso:';
  RAISE NOTICE '  entregador@pizzaria.test  id=%', uid_entregador;
  RAISE NOTICE '  atendente@pizzaria.test   id=%', uid_atendente;
  RAISE NOTICE '  cozinha@pizzaria.test     id=%', uid_cozinha;
END $$;
