-- ============================================================
-- Seed: usuário owner
-- Executar no SQL Editor do Supabase
--
-- Senha: 123123
-- ============================================================

DO $$
DECLARE
  uid_owner   UUID := gen_random_uuid();
  senha_hash  TEXT := crypt('123123', gen_salt('bf'));
  now_ts      TIMESTAMPTZ := now();
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
  ) VALUES (
    uid_owner,
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'proprietario@pizzaria.test', senha_hash,
    now_ts, now_ts, now_ts,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    false, '', '', '', ''
  );

  -- ── 2. Identidade (necessário para login por e-mail funcionar) ───────────────
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), uid_owner, uid_owner::text, 'email',
    jsonb_build_object('sub', uid_owner::text, 'email', 'proprietario@pizzaria.test'),
    now_ts, now_ts, now_ts
  );

  -- ── 3. Tabela users com password_hash (para login local POST /auth/login) ────
  INSERT INTO users (id, name, email, password_hash, role, is_active, created_at)
  VALUES (
    uid_owner,
    'Jefferson',
    'proprietario@pizzaria.test',
    senha_hash,
    'owner',
    true,
    now_ts
  )
  ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    email         = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role          = EXCLUDED.role,
    is_active     = EXCLUDED.is_active;

  RAISE NOTICE 'Owner criado com sucesso:';
  RAISE NOTICE '  email: proprietario@pizzaria.test';
  RAISE NOTICE '  id: %', uid_owner;
END $$;
