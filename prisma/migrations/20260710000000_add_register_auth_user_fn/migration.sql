-- Stored procedure: register_auth_user
-- Creates a user in Supabase auth.users + auth.identities.
-- The existing trigger handle_new_user() auto-inserts into public.users.
-- This bypasses GoTrue's phone UNIQUE constraint issue on the Free plan.

CREATE OR REPLACE FUNCTION public.register_auth_user(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'owner'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_encrypted_pw TEXT := crypt(p_password, gen_salt('bf'));
  v_now TIMESTAMPTZ := now();
  v_meta JSONB;
BEGIN
  v_meta := jsonb_build_object(
    'name', COALESCE(p_name, split_part(p_email, '@', 1)),
    'role', p_role
  );
  IF p_phone IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('phone', p_phone);
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    p_email, v_encrypted_pw,
    v_now, v_now, v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    v_meta,
    false, '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    v_now, v_now, v_now
  );

  RETURN v_user_id;
END;
$$;
