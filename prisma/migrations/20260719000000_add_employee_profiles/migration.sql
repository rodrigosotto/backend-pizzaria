-- Dados cadastrais de colaboradores. As colunas permanecem opcionais no banco
-- porque a tabela users também atende owners e clientes, que não são empregados.
ALTER TABLE "users"
  ADD COLUMN "cpf" VARCHAR(11),
  ADD COLUMN "street" VARCHAR(150),
  ADD COLUMN "address_number" VARCHAR(20),
  ADD COLUMN "neighborhood" VARCHAR(100),
  ADD COLUMN "zip_code" VARCHAR(8),
  ADD COLUMN "city" VARCHAR(100),
  ADD COLUMN "state" VARCHAR(2),
  ADD COLUMN "country" VARCHAR(100);

CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- Preenche a base atual exclusivamente com dados de demonstração. Os CPFs são
-- sequenciais e passam pelo algoritmo de dígitos verificadores, mas não devem
-- ser utilizados como dados pessoais reais.
WITH numbered_users AS (
  SELECT
    "id",
    lpad((700000000 + row_number() OVER (ORDER BY "id"))::text, 9, '0') AS base,
    (100 + row_number() OVER (ORDER BY "id"))::text AS demo_address_number
  FROM "users"
  WHERE "cpf" IS NULL
),
first_digit AS (
  SELECT
    "id",
    base,
    demo_address_number,
    CASE
      WHEN (sum((substring(base FROM position FOR 1))::int * (11 - position)) % 11) < 2 THEN 0
      ELSE 11 - (sum((substring(base FROM position FOR 1))::int * (11 - position)) % 11)
    END AS digit_one
  FROM numbered_users
  CROSS JOIN generate_series(1, 9) AS position
  GROUP BY "id", base, demo_address_number
),
valid_cpf AS (
  SELECT
    "id",
    base,
    demo_address_number,
    digit_one,
    CASE
      WHEN ((sum((substring(base FROM position FOR 1))::int * (12 - position)) + digit_one * 2) % 11) < 2 THEN 0
      ELSE 11 - ((sum((substring(base FROM position FOR 1))::int * (12 - position)) + digit_one * 2) % 11)
    END AS digit_two
  FROM first_digit
  CROSS JOIN generate_series(1, 9) AS position
  GROUP BY "id", base, demo_address_number, digit_one
)
UPDATE "users" AS app_user
SET
  "cpf" = valid_cpf.base || valid_cpf.digit_one::text || valid_cpf.digit_two::text,
  "street" = COALESCE(app_user."street", 'Rua Demonstração'),
  "address_number" = COALESCE(app_user."address_number", valid_cpf.demo_address_number),
  "neighborhood" = COALESCE(app_user."neighborhood", 'Centro'),
  "zip_code" = COALESCE(app_user."zip_code", '01001000'),
  "city" = COALESCE(app_user."city", 'São Paulo'),
  "state" = COALESCE(app_user."state", 'SP'),
  "country" = COALESCE(app_user."country", 'Brasil')
FROM valid_cpf
WHERE app_user."id" = valid_cpf."id";
