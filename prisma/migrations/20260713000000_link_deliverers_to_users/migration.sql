-- Cria os perfis operacionais que estavam ausentes para vínculos ativos já
-- existentes. Usuários sem telefone ficam de fora para não persistir dados
-- operacionais inválidos e deverão ser corrigidos antes de assumir a role.
INSERT INTO "deliverers" (
  "id",
  "pizzeria_id",
  "user_id",
  "name",
  "phone",
  "is_active",
  "created_at"
)
SELECT
  gen_random_uuid()::text,
  membership."pizzeria_id",
  membership."user_id",
  app_user."name",
  app_user."phone",
  true,
  CURRENT_TIMESTAMP
FROM "user_pizzeria_roles" AS membership
JOIN "users" AS app_user ON app_user."id" = membership."user_id"
WHERE membership."role" = 'entregador'
  AND membership."is_active" = true
  AND app_user."phone" IS NOT NULL
  AND btrim(app_user."phone") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "deliverers" AS deliverer
    WHERE deliverer."pizzeria_id" = membership."pizzeria_id"
      AND deliverer."user_id" = membership."user_id"
  );

-- Impede que a mesma conta de usuário tenha mais de um perfil de entregador
-- na mesma pizzaria, mantendo permitidos entregadores sem conta vinculada.
CREATE UNIQUE INDEX "deliverers_pizzeria_id_user_id_key"
ON "deliverers"("pizzeria_id", "user_id");

ALTER TABLE "deliverers"
ADD CONSTRAINT "deliverers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
