-- ============================================================
-- Seed: Pizzaria Demo — categorias, bordas, produtos, combos, insumos, fornecedores
-- Execute no SQL Editor do Supabase (Project > SQL Editor > New query)
-- ============================================================

DO $$
DECLARE
  -- Pizzaria (ajuste para o ID real da sua pizzaria)
  v_pizzeria_id UUID := 'e89ec9b5-2d7b-44ee-bc2b-5e44e75f7c6e';

  -- Categorias
  v_cat_pizzas      UUID := gen_random_uuid();
  v_cat_bebidas     UUID := gen_random_uuid();
  v_cat_entradas    UUID := gen_random_uuid();
  v_cat_sobremesas  UUID := gen_random_uuid();

  -- Bordas
  v_borda_catupiry  UUID := gen_random_uuid();
  v_borda_cheddar   UUID := gen_random_uuid();
  v_borda_chocolate UUID := gen_random_uuid();
  v_borda_sem       UUID := gen_random_uuid();

  -- Produtos
  v_prod_margherita UUID := gen_random_uuid();
  v_prod_calabresa  UUID := gen_random_uuid();
  v_prod_frango     UUID := gen_random_uuid();
  v_prod_pepperoni  UUID := gen_random_uuid();
  v_prod_coca       UUID := gen_random_uuid();
  v_prod_suco       UUID := gen_random_uuid();
  v_prod_pao_alho   UUID := gen_random_uuid();
  v_prod_petit      UUID := gen_random_uuid();

  -- Tamanhos referenciados por combo_items (product_size_id = UUID)
  v_size_margherita_p UUID := gen_random_uuid();
  v_size_margherita_g UUID := gen_random_uuid();
  v_size_calabresa_m  UUID := gen_random_uuid();
  v_size_coca_m       UUID := gen_random_uuid();
  v_size_suco_m       UUID := gen_random_uuid();
  v_size_pao_alho_m   UUID := gen_random_uuid();

  -- Combos
  v_combo_familia   UUID := gen_random_uuid();
  v_combo_casal     UUID := gen_random_uuid();
  v_combo_promo     UUID := gen_random_uuid();

  -- Fornecedores
  v_forn_lacticinios   UUID := gen_random_uuid();
  v_forn_distribuidora UUID := gen_random_uuid();

  -- Insumos
  v_ins_farinha   UUID := gen_random_uuid();
  v_ins_queijo    UUID := gen_random_uuid();
  v_ins_molho     UUID := gen_random_uuid();
  v_ins_calabresa UUID := gen_random_uuid();
  v_ins_frango    UUID := gen_random_uuid();
  v_ins_coca      UUID := gen_random_uuid();

BEGIN

  -- ============================================================
  -- CATEGORIAS  (tabela: product_categories)
  -- ============================================================
  INSERT INTO product_categories (id, pizzeria_id, name, slug, sort_order, is_active)
  VALUES
    (v_cat_pizzas,     v_pizzeria_id, 'Pizzas',     'pizzas',     1, true),
    (v_cat_bebidas,    v_pizzeria_id, 'Bebidas',    'bebidas',    2, true),
    (v_cat_entradas,   v_pizzeria_id, 'Entradas',   'entradas',   3, true),
    (v_cat_sobremesas, v_pizzeria_id, 'Sobremesas', 'sobremesas', 4, true)
  ON CONFLICT (pizzeria_id, slug) DO NOTHING;

  -- ============================================================
  -- BORDAS  (tabela: crusts — preços são colunas diretas, não tabela separada)
  -- extra_price_s = P, extra_price_m = M, extra_price_l = G, extra_price_xl = GG
  -- ============================================================
  INSERT INTO crusts (id, pizzeria_id, name, extra_price_s, extra_price_m, extra_price_l, extra_price_xl, is_active)
  VALUES
    (v_borda_catupiry,  v_pizzeria_id, 'Catupiry',  5.00, 6.00, 7.00, 8.00, true),
    (v_borda_cheddar,   v_pizzeria_id, 'Cheddar',   5.00, 6.00, 7.00, 8.00, true),
    (v_borda_chocolate, v_pizzeria_id, 'Chocolate', 6.00, 7.00, 8.00, 9.00, true),
    (v_borda_sem,       v_pizzeria_id, 'Sem Borda', 0.00, 0.00, 0.00, 0.00, true)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- PRODUTOS  (tabela: products)
  -- ============================================================
  INSERT INTO products (id, pizzeria_id, category_id, name, description, is_active, is_pizza, created_at)
  VALUES
    (v_prod_margherita, v_pizzeria_id, v_cat_pizzas,     'Margherita',          'Molho de tomate, mussarela e manjericão fresco', true, true,  now()),
    (v_prod_calabresa,  v_pizzeria_id, v_cat_pizzas,     'Calabresa',           'Molho de tomate, mussarela e calabresa fatiada', true, true,  now()),
    (v_prod_frango,     v_pizzeria_id, v_cat_pizzas,     'Frango c/ Requeijão', 'Frango desfiado, requeijão cremoso e catupiry',  true, true,  now()),
    (v_prod_pepperoni,  v_pizzeria_id, v_cat_pizzas,     'Pepperoni',           'Molho de tomate, mussarela e pepperoni',         true, true,  now()),
    (v_prod_coca,       v_pizzeria_id, v_cat_bebidas,    'Coca-Cola',           'Coca-Cola gelada 350ml',                         true, false, now()),
    (v_prod_suco,       v_pizzeria_id, v_cat_bebidas,    'Suco Natural',        'Suco de laranja ou limão feito na hora',          true, false, now()),
    (v_prod_pao_alho,   v_pizzeria_id, v_cat_entradas,   'Pão de Alho',         'Pão de alho com manteiga e ervas finas',          true, false, now()),
    (v_prod_petit,      v_pizzeria_id, v_cat_sobremesas, 'Petit Gâteau',        'Bolinho de chocolate quente com sorvete de creme', true, false, now())
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- TAMANHOS  (tabela: product_sizes — coluna size_label, não size)
  -- ============================================================
  INSERT INTO product_sizes (id, product_id, size_label, price, is_active)
  VALUES
    -- Margherita (IDs nomeados para reuso nos combos)
    (v_size_margherita_p, v_prod_margherita, 'P',  35.00, true),
    (gen_random_uuid(),   v_prod_margherita, 'M',  45.00, true),
    (v_size_margherita_g, v_prod_margherita, 'G',  55.00, true),
    (gen_random_uuid(),   v_prod_margherita, 'GG', 65.00, true),
    -- Calabresa
    (gen_random_uuid(),   v_prod_calabresa,  'P',  37.00, true),
    (v_size_calabresa_m,  v_prod_calabresa,  'M',  47.00, true),
    (gen_random_uuid(),   v_prod_calabresa,  'G',  57.00, true),
    (gen_random_uuid(),   v_prod_calabresa,  'GG', 67.00, true),
    -- Frango
    (gen_random_uuid(),   v_prod_frango,     'P',  40.00, true),
    (gen_random_uuid(),   v_prod_frango,     'M',  50.00, true),
    (gen_random_uuid(),   v_prod_frango,     'G',  60.00, true),
    (gen_random_uuid(),   v_prod_frango,     'GG', 70.00, true),
    -- Pepperoni
    (gen_random_uuid(),   v_prod_pepperoni,  'P',  42.00, true),
    (gen_random_uuid(),   v_prod_pepperoni,  'M',  52.00, true),
    (gen_random_uuid(),   v_prod_pepperoni,  'G',  62.00, true),
    (gen_random_uuid(),   v_prod_pepperoni,  'GG', 72.00, true),
    -- Bebidas
    (v_size_coca_m,       v_prod_coca,       'M',   8.00, true),
    (v_size_suco_m,       v_prod_suco,       'M',  12.00, true),
    -- Entradas e sobremesas
    (v_size_pao_alho_m,   v_prod_pao_alho,   'M',  18.00, true),
    (gen_random_uuid(),   v_prod_petit,       'M',  25.00, true)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- COMBOS  (tabela: combos — coluna valid_to, não valid_until)
  -- ============================================================
  INSERT INTO combos (id, pizzeria_id, name, description, price, is_active, valid_from, valid_to, created_at)
  VALUES
    (v_combo_familia, v_pizzeria_id, 'Combo Família',
     '2 pizzas G + 2 Coca-Cola com desconto especial',
     99.00, true, now(), now() + interval '90 days', now()),

    (v_combo_casal, v_pizzeria_id, 'Combo Casal',
     '1 pizza M + 2 sucos naturais',
     65.00, true, now(), now() + interval '90 days', now()),

    (v_combo_promo, v_pizzeria_id, 'Combo Econômico',
     '1 pizza P + 1 Coca-Cola + 1 pão de alho',
     55.00, true, now(), now() + interval '30 days', now())
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- ITENS DOS COMBOS  (tabela: combo_items — usa product_size_id UUID, não size string)
  -- ============================================================
  INSERT INTO combo_items (id, combo_id, product_id, product_size_id, quantity)
  VALUES
    -- Combo Família: 2x Margherita G + 2x Coca M
    (gen_random_uuid(), v_combo_familia, v_prod_margherita, v_size_margherita_g, 2),
    (gen_random_uuid(), v_combo_familia, v_prod_coca,       v_size_coca_m,       2),

    -- Combo Casal: 1x Calabresa M + 2x Suco M
    (gen_random_uuid(), v_combo_casal,   v_prod_calabresa,  v_size_calabresa_m,  1),
    (gen_random_uuid(), v_combo_casal,   v_prod_suco,       v_size_suco_m,       2),

    -- Combo Econômico: 1x Margherita P + 1x Coca M + 1x Pão de Alho M
    (gen_random_uuid(), v_combo_promo,   v_prod_margherita, v_size_margherita_p, 1),
    (gen_random_uuid(), v_combo_promo,   v_prod_coca,       v_size_coca_m,       1),
    (gen_random_uuid(), v_combo_promo,   v_prod_pao_alho,   v_size_pao_alho_m,   1)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FORNECEDORES  (tabela: suppliers — coluna company_name, não name)
  -- ============================================================
  INSERT INTO suppliers (id, pizzeria_id, company_name, contact_name, phone, email, is_active, categories)
  VALUES
    (v_forn_lacticinios,   v_pizzeria_id, 'Laticínios São João', 'João Carlos', '(41) 99111-2222', 'joao@laticinios.com',   true, ARRAY['frios']),
    (v_forn_distribuidora, v_pizzeria_id, 'Distribuidora Norte', 'Ana Paula',   '(41) 99333-4444', 'ana@distribuidora.com', true, ARRAY['outros'])
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- INSUMOS  (tabela: stock_items)
  -- unit enum: kg | unit | liter | package
  -- category enum: frios | frutas | oleo | verduras | legumes | fritos | outros
  -- ============================================================
  INSERT INTO stock_items (id, pizzeria_id, supplier_id, name, category, unit, quantity, min_quantity, updated_at)
  VALUES
    (v_ins_farinha,   v_pizzeria_id, v_forn_distribuidora, 'Farinha de Trigo',  'outros'::"StockCategory", 'kg'::"StockUnit",      50.000, 10.000, now()),
    (v_ins_queijo,    v_pizzeria_id, v_forn_lacticinios,   'Queijo Mussarela',  'frios'::"StockCategory",  'kg'::"StockUnit",      20.000,  5.000, now()),
    (v_ins_molho,     v_pizzeria_id, v_forn_distribuidora, 'Molho de Tomate',   'outros'::"StockCategory", 'liter'::"StockUnit",   30.000,  8.000, now()),
    (v_ins_calabresa, v_pizzeria_id, v_forn_distribuidora, 'Calabresa Fatiada', 'frios'::"StockCategory",  'kg'::"StockUnit",      15.000,  3.000, now()),
    (v_ins_frango,    v_pizzeria_id, v_forn_distribuidora, 'Frango Desfiado',   'frios'::"StockCategory",  'kg'::"StockUnit",      12.000,  3.000, now()),
    (v_ins_coca,      v_pizzeria_id, v_forn_distribuidora, 'Coca-Cola 350ml',   'outros'::"StockCategory", 'unit'::"StockUnit",   120.000, 24.000, now())
  ON CONFLICT DO NOTHING;

END $$;
