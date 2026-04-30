-- ============================================================
-- Seed: Clientes de teste com endereços
-- Execute no SQL Editor do Supabase (Project > SQL Editor > New query)
-- ============================================================

DO $$
DECLARE
  v_pizzeria_id UUID := '91f3243c-ffa0-4228-8f3d-0d2a5e2d99ad';

  -- Clientes
  v_c1 UUID := gen_random_uuid();
  v_c2 UUID := gen_random_uuid();
  v_c3 UUID := gen_random_uuid();
  v_c4 UUID := gen_random_uuid();
  v_c5 UUID := gen_random_uuid();
  v_c6 UUID := gen_random_uuid();

BEGIN

  -- ============================================================
  -- CLIENTES
  -- ============================================================
  INSERT INTO customers (id, pizzeria_id, name, phone, cpf, email, loyalty_stamps, is_blacklisted, created_at)
  VALUES
    (v_c1, v_pizzeria_id, 'Ana Paula Ferreira',    '41991112222', '111.222.333-44', 'ana@email.com',    5,  false, now() - interval '60 days'),
    (v_c2, v_pizzeria_id, 'Carlos Eduardo Lima',   '41933334444', '222.333.444-55', 'carlos@email.com', 2,  false, now() - interval '30 days'),
    (v_c3, v_pizzeria_id, 'Fernanda Costa',        '41955556666', '333.444.555-66', null,               8,  false, now() - interval '15 days'),
    (v_c4, v_pizzeria_id, 'Roberto Alves Santos',  '41977778888', '444.555.666-77', 'roberto@email.com',0,  false, now() - interval '7 days'),
    (v_c5, v_pizzeria_id, 'Juliana Marques',       '41999990000', null,             null,               12, false, now() - interval '90 days'),
    (v_c6, v_pizzeria_id, 'Pedro Henrique Souza',  '41911112222', '666.777.888-99', 'pedro@email.com',  0,  true,  now() - interval '45 days')
  ON CONFLICT (pizzeria_id, phone) DO NOTHING;

  -- ============================================================
  -- ENDEREÇOS
  -- ============================================================
  INSERT INTO customer_addresses (id, customer_id, label, street, number, complement, neighborhood, city, zip_code, is_default)
  VALUES
    -- Ana Paula: 2 endereços
    (gen_random_uuid(), v_c1, 'Casa',      'Rua das Araucárias',   '123',  null,       'Batel',         'Curitiba', '80420-090', true),
    (gen_random_uuid(), v_c1, 'Trabalho',  'Av. Sete de Setembro', '4567', 'Sala 210', 'Centro',        'Curitiba', '80230-901', false),

    -- Carlos: 1 endereço
    (gen_random_uuid(), v_c2, 'Casa',      'Rua Comendador Araújo','89',   'Apto 3',   'Centro',        'Curitiba', '80420-000', true),

    -- Fernanda: 2 endereços
    (gen_random_uuid(), v_c3, 'Casa',      'Rua Padre Agostinho',  '2001', null,       'Mercês',        'Curitiba', '80410-090', true),
    (gen_random_uuid(), v_c3, 'Mãe',       'Rua Vicente Machado',  '55',   null,       'Batel',         'Curitiba', '80420-010', false),

    -- Roberto: 1 endereço
    (gen_random_uuid(), v_c4, 'Casa',      'Rua Mateus Leme',      '300',  'Casa 2',   'São Francisco', 'Curitiba', '80520-080', true),

    -- Juliana: 3 endereços
    (gen_random_uuid(), v_c5, 'Casa',      'Av. Água Verde',       '1100', null,       'Água Verde',    'Curitiba', '80610-100', true),
    (gen_random_uuid(), v_c5, 'Trabalho',  'Rua XV de Novembro',   '700',  '4º andar', 'Centro',        'Curitiba', '80020-310', false),
    (gen_random_uuid(), v_c5, 'Academia',  'Rua Desembargador Motta','180', null,       'Batel',         'Curitiba', '80420-180', false),

    -- Pedro (bloqueado): 1 endereço
    (gen_random_uuid(), v_c6, 'Casa',      'Rua Ébano Pereira',    '44',   null,       'Centro',        'Curitiba', '80410-240', true)
  ON CONFLICT DO NOTHING;

END $$;
