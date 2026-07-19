-- Exclusão definitiva da pizzaria duplicada e de todos os seus dados de negócio.
-- Execute no Supabase SQL Editor somente após revisar o SELECT inicial.
-- Usuários globais (public.users/auth.users) são preservados.

begin;

create temporary table target_pizzeria on commit drop as
select id, trade_name
from public.pizzerias
where id = '91f3243c-ffa0-4228-8f3d-0d2a5e2d99ad'
for update;

do $$
begin
  if (select count(*) from target_pizzeria) <> 1 then
    raise exception 'Pizzaria alvo não encontrada; nenhuma exclusão foi realizada';
  end if;
end
$$;

-- Confira no resultado do SQL Editor antes de prosseguir.
select * from target_pizzeria;

-- Dependências de terceiro nível.
delete from public.chat_messages
where conversation_id in (
  select id from public.chat_conversations
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.cash_withdrawals
where cash_session_id in (
  select id from public.cash_sessions
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.coupon_usages
where coupon_id in (
  select id from public.coupons
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.product_recipes
where product_id in (
    select id from public.products
    where pizzeria_id in (select id from target_pizzeria)
  )
  or stock_item_id in (
    select id from public.stock_items
    where pizzeria_id in (select id from target_pizzeria)
  );

delete from public.stock_movements
where stock_item_id in (
  select id from public.stock_items
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.table_reservations
where table_id in (
  select id from public.tables
  where pizzeria_id in (select id from target_pizzeria)
);

-- Pedidos precisam sair antes de clientes, mesas, produtos e entregadores.
delete from public.kds_items
where pizzeria_id in (select id from target_pizzeria);

delete from public.order_items
where order_id in (
  select id from public.orders
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.orders
where pizzeria_id in (select id from target_pizzeria);

delete from public.table_sessions
where table_id in (
  select id from public.tables
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.customer_addresses
where customer_id in (
  select id from public.customers
  where pizzeria_id in (select id from target_pizzeria)
);

delete from public.combo_items
where combo_id in (
    select id from public.combos
    where pizzeria_id in (select id from target_pizzeria)
  )
  or product_id in (
    select id from public.products
    where pizzeria_id in (select id from target_pizzeria)
  );

delete from public.product_sizes
where product_id in (
  select id from public.products
  where pizzeria_id in (select id from target_pizzeria)
);

-- Dependências diretas da pizzaria.
delete from public.audit_logs where pizzeria_id in (select id from target_pizzeria);
delete from public.chat_conversations where pizzeria_id in (select id from target_pizzeria);
delete from public.chat_templates where pizzeria_id in (select id from target_pizzeria);
delete from public.cash_sessions where pizzeria_id in (select id from target_pizzeria);
delete from public.coupons where pizzeria_id in (select id from target_pizzeria);
delete from public.combos where pizzeria_id in (select id from target_pizzeria);
delete from public.crusts where pizzeria_id in (select id from target_pizzeria);
delete from public.customers where pizzeria_id in (select id from target_pizzeria);
delete from public.deliverers where pizzeria_id in (select id from target_pizzeria);
delete from public.delivery_zones where pizzeria_id in (select id from target_pizzeria);
delete from public.loyalty_programs where pizzeria_id in (select id from target_pizzeria);
delete from public.printers where pizzeria_id in (select id from target_pizzeria);
delete from public.products where pizzeria_id in (select id from target_pizzeria);
delete from public.product_categories where pizzeria_id in (select id from target_pizzeria);
delete from public.stock_items where pizzeria_id in (select id from target_pizzeria);
delete from public.suppliers where pizzeria_id in (select id from target_pizzeria);
delete from public.tables where pizzeria_id in (select id from target_pizzeria);
delete from public.pizzeria_configs where pizzeria_id in (select id from target_pizzeria);
delete from public.user_pizzeria_roles where pizzeria_id in (select id from target_pizzeria);

delete from public.pizzerias
where id in (select id from target_pizzeria);

-- Deve retornar zero.
select count(*) as remaining_pizzerias
from public.pizzerias
where id = '91f3243c-ffa0-4228-8f3d-0d2a5e2d99ad';

commit;

-- Para testar sem excluir, troque o COMMIT acima por ROLLBACK.
