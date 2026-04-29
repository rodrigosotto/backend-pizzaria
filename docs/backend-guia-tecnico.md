# Backend Pizzaria — Guia Técnico Completo

> **Para quem é este documento?**
> Dev entrando no projeto agora. Aqui você vai entender o que foi construído até o momento, como rodar localmente, como funciona cada camada do código e o estado real do banco de dados. Leia do início ao fim antes de mexer em qualquer coisa.

---

## Sumário

1. [Stack e Versões](#1-stack-e-versões)
2. [Como rodar localmente](#2-como-rodar-localmente)
3. [Variáveis de ambiente](#3-variáveis-de-ambiente)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Fase 1 — Fundação e Infraestrutura](#5-fase-1--fundação-e-infraestrutura)
6. [Fase 2 — Autenticação e Usuários](#6-fase-2--autenticação-e-usuários)
7. [Fase 3 — Pizzerias e Hub](#7-fase-3--pizzerias-e-hub)
8. [Fase 4 — Cardápio](#8-fase-4--cardápio)
9. [Fase 5 — Clientes](#9-fase-5--clientes)
10. [Fase 6 — Pedidos](#10-fase-6--pedidos)
11. [Banco de dados — estado atual](#11-banco-de-dados--estado-atual)
12. [Endpoints disponíveis](#12-endpoints-disponíveis)
13. [Padrões de resposta da API](#13-padrões-de-resposta-da-api)
14. [O que ainda NÃO existe](#14-o-que-ainda-não-existe)

---

## 1. Stack e Versões

| Tecnologia | Versão | Por quê |
|---|---|---|
| Node.js | 22.x | LTS atual |
| NestJS | 11 | Framework principal |
| Fastify | via `@nestjs/platform-fastify` | Mais rápido que Express, usado no lugar do Express padrão |
| TypeScript | 5.7 | `module: "nodenext"` — compatibilidade máxima com ESM |
| Prisma | 7.8 | ORM — gerencia schema e queries |
| PostgreSQL | via Supabase | Banco de dados em produção |
| `@nestjs/jwt` | latest | Geração e validação de JWT sem Passport |
| `bcryptjs` | latest | Hash de senha (puro JS, sem compilação nativa) |

### Por que Fastify e não Express?

NestJS por padrão usa Express. Aqui trocamos pelo Fastify que é ~2x mais rápido. A troca é quase transparente no NestJS — a única diferença relevante é que o objeto `request`/`response` segue a API do Fastify, não do Express. Você raramente vai notar isso no dia a dia.

### Por que `module: "nodenext"` no TypeScript?

Isso habilita a resolução de módulos ESM nativa do Node.js. A consequência prática é que o `tsc` padrão do NestJS não funciona com essa configuração (ele só emite 1 arquivo JS em vez de todos). A solução foi usar **webpack** para o build:

```bash
nest build --webpack   # em vez de nest build
```

Todos os scripts já estão configurados corretamente no `package.json`.

---

## 2. Como rodar localmente

### Pré-requisitos

- Node.js 22+
- npm
- Conta no Supabase (ou acesso ao projeto já existente)
- Arquivo `.env` na raiz (copie de `.env.example`)

### Passo a passo

**1. Instale as dependências:**
```bash
npm install
```

**2. Configure o `.env`:**
```bash
cp .env.example .env
# Edite o .env com as credenciais reais (veja seção 3)
```

**3. Gere o Prisma Client:**
```bash
npm run prisma:generate
```
Este comando lê o `schema.prisma` e gera os tipos TypeScript do banco. Sempre rode isso depois de alterar o schema.

**4. Inicie o proxy local do Prisma Postgres (Terminal 1):**
```bash
npm run prisma:dev
```
Este comando abre um proxy local na porta `51213` que conecta ao Supabase. **Sem isso o servidor NÃO consegue fazer queries no banco.**

> O servidor ainda vai subir sem este proxy, mas qualquer endpoint que toque o banco vai retornar erro de conexão. Para desenvolvimento, mantenha este processo rodando em um terminal separado.

**5. Inicie o servidor (Terminal 2):**
```bash
npm run dev
```

O servidor vai subir em `http://localhost:3000`.

### URLs importantes

| URL | O que é |
|---|---|
| `http://localhost:3000/api/v1` | Base da API |
| `http://localhost:3000/docs` | Swagger — documentação interativa |
| `http://localhost:3000/api/v1/health` | Health check |

### Scripts disponíveis

```bash
npm run dev            # Modo desenvolvimento com hot reload (webpack watch)
npm run build          # Build de produção
npm run start          # Sobe o servidor sem watch (usa webpack)
npm run start:prod     # Sobe o dist/main.js gerado pelo build

npm run prisma:dev      # Proxy local Prisma Postgres (precisa estar rodando)
npm run prisma:migrate  # Cria/aplica migrations no banco (precisa do proxy ativo)
npm run prisma:generate # Regenera o Prisma Client a partir do schema

npm test               # Testes unitários
npm run test:e2e       # Testes end-to-end
```

---

## 3. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores:

```dotenv
# URL do Prisma Postgres — formato especial do Supabase/Prisma
# Para desenvolvimento local: prisma+postgres://localhost:51213/?api_key=SUA_CHAVE
# A chave de API aparece no dashboard do Supabase > Prisma Postgres
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=YOUR_KEY"

# Porta do servidor (padrão 3000)
PORT=3000
NODE_ENV=development

# Origem permitida pelo CORS — em produção coloque a URL do frontend
CORS_ORIGIN=*

# JWT — use uma string longa e aleatória em produção
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d   # Tempo de expiração do token (7d = 7 dias)

# Supabase (ainda não usado diretamente no código, reservado para fases futuras)
SUPABASE_URL=https://SEU_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=pizzaria-assets
```

> **Atenção:** nunca commite o arquivo `.env` real. Ele está no `.gitignore`.

---

## 4. Estrutura de pastas

```
backend-pizzaria/
├── docs/                          # Documentação (você está aqui)
├── prisma/
│   └── schema.prisma              # Schema do banco — 30 modelos, 14 enums
├── src/
│   ├── app.module.ts              # Módulo raiz — registra todos os módulos
│   ├── main.ts                    # Bootstrap — Fastify, CORS, Swagger, Guards globais
│   ├── core/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts   # Formata todos os erros da API
│   │   └── interceptors/
│   │       ├── transform.interceptor.ts   # Envolve todas as respostas em { data, statusCode, timestamp }
│   │       └── logging.interceptor.ts     # Loga METHOD /url STATUS +Xms no console
│   ├── infra/
│   │   └── database/
│   │       ├── prisma.service.ts          # Wrapper do Prisma Client com suporte a Accelerate
│   │       └── prisma.module.ts           # Módulo global — disponível em todos os módulos
│   └── modules/
│       ├── health/                # GET /health — status da API e do banco
│       ├── audit/                 # Serviço de auditoria (log de ações no banco)
│       ├── auth/                  # JWT, registro, login
│       │   ├── decorators/        # @Public(), @CurrentUser(), @Roles()
│       │   ├── dto/               # Validação de entrada (RegisterDto, LoginDto, etc.)
│       │   ├── guards/            # JwtAuthGuard, RolesGuard
│       │   ├── auth.service.ts
│       │   ├── auth.controller.ts
│       │   └── auth.module.ts
│       └── users/                 # CRUD de usuários
│           ├── dto/               # UpdateUserDto
│           ├── users.service.ts
│           ├── users.controller.ts
│           └── users.module.ts
│   ├── hub/                           # HubModule — painel multi-pizzaria
│   │   ├── hub.controller.ts
│   │   ├── hub.service.ts
│   │   └── hub.module.ts
│   ├── pizzeria/                      # PizzeriaModule — CRUD de pizzarias
│   │   ├── dto/                       # CreatePizzeriaDto, UpdatePizzeriaDto, InviteUserDto, etc.
│   │   ├── pizzeria.controller.ts
│   │   ├── pizzeria.service.ts
│   │   └── pizzeria.module.ts
│   ├── cardapio/                      # CardápioModule — cardápio completo
│   │   ├── dto/                       # DTOs de categoria, produto, tamanho, borda, combo
│   │   ├── categories.controller.ts
│   │   ├── products.controller.ts
│   │   ├── crusts.controller.ts
│   │   ├── combos.controller.ts
│   │   ├── public-menu.controller.ts  # Endpoint público para QR Code (sem JWT)
│   │   ├── cardapio.service.ts
│   │   └── cardapio.module.ts
│   └── customers/                     # CustomersModule — clientes e endereços
│       ├── dto/                       # CreateCustomerDto, UpdateCustomerDto, CreateAddressDto, etc.
│       ├── customers.controller.ts
│       ├── customers.service.ts
│       └── customers.module.ts
├── test/
│   └── app.e2e-spec.ts            # Teste E2E do AppController
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

---

## 5. Fase 1 — Fundação e Infraestrutura

### O que foi construído

A Fase 1 não entrega funcionalidades de negócio — ela monta a estrutura que tudo mais vai usar.

---

### 5.1 PrismaService (`src/infra/database/prisma.service.ts`)

O Prisma 7 com `prisma+postgres://` (protocolo do Supabase) exige uma extensão especial chamada `withAccelerate()`. Por causa disso, não podemos usar o padrão normal de `extends PrismaClient` — o tipo muda depois do `.$extends()`.

A solução foi criar um **wrapper**:

```typescript
// Acesse o banco sempre via: this.prisma.db.nomeDoModelo
// Exemplo: this.prisma.db.user.findMany()
//          this.prisma.db.order.create(...)
```

**Por que `.db` e não direto no service?**
Porque `$extends(withAccelerate())` retorna um tipo diferente de `PrismaClient`. Para preservar a tipagem completa, o client estendido fica no atributo `db` do service.

**Conexão lazy:** O `PrismaService` NÃO faz `$connect()` na inicialização. A conexão é estabelecida na primeira query. Isso permite o servidor subir mesmo sem o proxy rodando.

**PrismaModule é `@Global()`:** Uma vez importado no `AppModule`, o `PrismaService` fica disponível em qualquer módulo sem precisar importar o `PrismaModule` novamente. Você só injeta `PrismaService` no construtor do seu service.

---

### 5.2 Filtro global de erros (`src/core/filters/http-exception.filter.ts`)

Toda exceção não tratada passa por aqui. O filtro formata a resposta de erro num padrão consistente:

```json
{
  "statusCode": 404,
  "message": "Usuário não encontrado",
  "error": "Not Found",
  "path": "/api/v1/users/abc123",
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

Se você jogar um `throw new NotFoundException('Usuário não encontrado')` em qualquer lugar do código, o filtro captura e formata automaticamente.

---

### 5.3 Interceptors globais

**TransformInterceptor** — envolve toda resposta de sucesso:

```json
{
  "data": { ... },        // o que o seu controller retornou
  "statusCode": 200,
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

**LoggingInterceptor** — no console do servidor você vai ver:
```
GET /api/v1/auth/me 200 +42ms
POST /api/v1/auth/login 401 +8ms
```

---

### 5.4 AuditService (`src/modules/audit/audit.service.ts`)

Grava um registro na tabela `audit_logs` para rastrear ações importantes (login, criação de pedido, etc.).

```typescript
// Como usar em qualquer service:
await this.audit.log({
  action: 'USER_LOGIN',
  entity: 'User',
  entityId: user.id,
  userId: user.id,
  pizzeriaId: 'opcional',   // qual pizzaria estava ativa
  before: objetoAntes,      // estado antes da mudança (para updates)
  after: objetoDepois,      // estado depois
  ip: 'opcional',
});
```

**Importante:** Erros na auditoria são capturados silenciosamente — eles nunca derrubam a operação principal. Se o log falhar, o usuário não vê erro.

**AuditModule é `@Global()`:** Assim como o PrismaModule, basta injetar `AuditService` no construtor sem importar o módulo.

---

### 5.5 HealthController (`GET /api/v1/health`)

Verifica se a API está de pé e se o banco responde.

```json
// Banco conectado:
{
  "data": {
    "status": "ok",
    "database": "ok",
    "uptime": 142.5,
    "version": "0.0.1"
  },
  "statusCode": 200,
  "timestamp": "..."
}

// Banco sem resposta:
{
  "data": {
    "status": "degraded",
    "database": "error",
    "uptime": 142.5,
    "version": "0.0.1"
  }
}
```

---

### 5.6 Configurações globais (`src/main.ts`)

| Configuração | Valor |
|---|---|
| Prefixo global | `api/v1` |
| Swagger | `/docs` |
| CORS | Origem configurável via `CORS_ORIGIN` |
| Headers permitidos | `Content-Type`, `Authorization`, `X-Pizzeria-Id` |
| ValidationPipe | `whitelist: true` — campos extras no body são rejeitados |

O header `X-Pizzeria-Id` já está configurado no CORS. Ele será usado nas fases seguintes para identificar em qual pizzaria o usuário está operando.

---

## 6. Fase 2 — Autenticação e Usuários

### Como funciona o fluxo de autenticação

```
1. POST /auth/register  →  cria conta  →  retorna JWT
2. POST /auth/login     →  valida senha →  retorna JWT
3. Requisições seguintes: header  Authorization: Bearer <token>
4. JwtAuthGuard (global) valida o token automaticamente
5. @CurrentUser() injeta os dados do token no método do controller
```

O JWT é um **token de acesso** com duração configurável via `JWT_EXPIRES_IN` (padrão: 7 dias). Não há refresh token por enquanto — quando expirar, o usuário faz login novamente.

---

### 6.1 Guards globais

Os guards são registrados como `APP_GUARD` no `AuthModule`, o que os torna **globais automaticamente** — aplicam em todos os controllers de todos os módulos.

**JwtAuthGuard**
- Verifica se o header `Authorization: Bearer <token>` existe e é válido
- Se não tiver token → 401 Unauthorized
- Se o token expirou ou for inválido → 401 Unauthorized
- Após validar, injeta o payload do JWT em `request.user`

**RolesGuard**
- Roda depois do JwtAuthGuard
- Verifica se o `role` do usuário (presente no JWT) está na lista do decorator `@Roles()`
- Se não tiver `@Roles()` no endpoint → passa direto (sem restrição de role)
- Se o role não bater → 403 Forbidden

**Como marcar um endpoint como público (sem JWT):**
```typescript
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Post('alguma-rota')
minhaRotaPublica() { ... }
```

**Como restringir por role:**
```typescript
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Roles(UserRole.owner, UserRole.admin)
@Get('rota-restrita')
rotaRestrita() { ... }
```

---

### 6.2 Payload do JWT

O que fica gravado dentro do token:

```json
{
  "sub": "uuid-do-usuario",
  "email": "joao@email.com",
  "role": "owner",
  "iat": 1745700000,
  "exp": 1746304800
}
```

- `sub` → ID do usuário (padrão JWT para "subject")
- `role` → role global do usuário no sistema

---

### 6.3 Decorator `@CurrentUser()`

Em qualquer controller protegido por JWT, você pode pegar os dados do usuário logado assim:

```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Get('meu-endpoint')
meuEndpoint(@CurrentUser() user: JwtPayload) {
  console.log(user.sub);    // UUID do usuário
  console.log(user.email);
  console.log(user.role);
}
```

> **Por que `import type`?** Com `isolatedModules: true` no tsconfig, TypeScript exige `import type` para interfaces usadas em parâmetros de métodos decorados. Se você esquecer, o build vai reclamar com `TS1272`.

---

### 6.4 Roles do sistema

```
UserRole (role global do usuário na plataforma):
  owner       → dono da pizzaria, acesso total
  admin       → administrador operacional
  atendente   → atende pedidos
  cozinha     → visualiza e atualiza status de produção
  entregador  → acessa entregas atribuídas
  caixa       → opera o caixa
  cliente     → cliente final (app de pedidos)

PizzeriaUserRole (role do usuário dentro de uma pizzaria específica):
  admin | atendente | cozinha | entregador | caixa
```

Um usuário pode ser `owner` globalmente mas ter roles diferentes em cada pizzaria que gerencia. Essa relação fica na tabela `user_pizzeria_roles`.

---

### 6.5 Hash de senha

Senhas nunca são gravadas em texto puro. Usamos `bcryptjs` com `saltRounds: 12`:

```
Senha em texto: "minhaSenha123"
Hash no banco:  "$2a$12$abc...xyz"
```

O campo no banco é `password_hash` (mapeado para `passwordHash` no TypeScript via `@map("password_hash")`).

---

## 7. Fase 3 — Pizzerias e Hub

### O que foi construído

A Fase 3 entrega o gerenciamento de pizzarias e o painel centralizado (hub) para owners que operam múltiplos estabelecimentos. Também foi adicionado o suporte a upload de imagens via Supabase Storage.

---

### 7.1 PizzeriaModule (`src/pizzeria/`)

CRUD completo da entidade `Pizzeria` com gerenciamento de usuários vinculados.

**Regra de acesso:** todo endpoint valida se o usuário tem um `UserPizzeriaRole` ativo para aquela pizzaria (`assertAccess`). Sem vínculo ativo → 403 Forbidden.

**Transação atômica na criação:** ao criar uma pizzaria, o serviço usa `this.prisma.db.$transaction` para criar a `Pizzeria` e o `UserPizzeriaRole` (com role `admin`) do owner em uma única operação. Se qualquer parte falhar, o banco reverte tudo.

```typescript
// Exemplo de uso:
// O owner cria a pizzaria → automaticamente ganha role admin nela
// POST /api/v1/pizzerias  (body: CreatePizzeriaDto)
```

**Soft delete:** `DELETE /pizzerias/:id` não apaga o registro — apenas seta `status: 'inactive'`.

**Gerenciamento de usuários:**
- `POST /pizzerias/:id/users` → convida um usuário já cadastrado pelo e-mail, criando ou reativando o vínculo `UserPizzeriaRole`
- `PATCH /pizzerias/:id/users/:userId` → troca o role do usuário na pizzaria
- `DELETE /pizzerias/:id/users/:userId` → desativa o vínculo (soft delete, seta `isActive: false`)

**Auditoria:** todas as operações de escrita (create, update, delete, invite, role update, user remove, logo upload) chamam `this.audit.log(...)` explicitamente.

---

### 7.2 SupabaseStorageService (`src/infra/supabase/supabase-storage.service.ts`)

Serviço para upload de arquivos ao Supabase Storage.

```typescript
// Injetar via construtor:
constructor(private readonly storage: SupabaseStorageService) {}

// Fazer upload:
const publicUrl = await this.storage.uploadFile(
  'pizzeria-logos',   // nome do bucket
  'uuid/logo.jpg',    // path dentro do bucket
  buffer,             // Buffer do arquivo
  'image/jpeg',       // MIME type
);
```

O `SupabaseModule` é importado no `PizzeriaModule`. Se precisar de upload em outros módulos, importe o `SupabaseModule` neles também.

**Logo da pizzaria:** `POST /pizzerias/:id/logo` recebe `multipart/form-data`, faz upload para o bucket `pizzeria-logos` com path `{pizzeriaId}/logo{ext}` e atualiza o campo `logoUrl` na tabela `pizzerias`.

---

### 7.3 HubModule (`src/hub/`)

Painel centralizado para owners e admins que precisam operar em múltiplas pizzarias.

**GET /hub/summary**

Disponível apenas para `owner`. Consulta todas as pizzarias ativas do usuário e para cada uma monta um resumo com quatro métricas operacionais em paralelo (`Promise.all`):

| Campo | O que conta |
|---|---|
| `open_orders` | Orders com status diferente de `done` e `cancelled` |
| `revenue_today` | Soma do `total` dos Orders com `paymentStatus = paid` criados hoje |
| `cash_open` | Se existe uma `CashSession` sem `closedAt` aberta hoje |
| `stock_alerts` | Itens de estoque com `quantity <= min_quantity` |

Se qualquer métrica falhar (banco indisponível, tabela vazia), retorna `0`/`false` silenciosamente — o summary nunca quebra por falta de dados de uma métrica.

**GET /hub/pizzerias/:id/activate**

Ponto de entrada para o fluxo multi-tenant. Quando o usuário seleciona uma pizzaria no frontend:
1. Frontend chama este endpoint
2. Backend valida o vínculo `UserPizzeriaRole` (ativo e pizzaria não inativa)
3. Retorna `{ pizzeria_id, pizzeria_name, role }`
4. Frontend armazena o `pizzeria_id` e o envia como `X-Pizzeria-Id` em todas as requests seguintes

```json
// Resposta 200:
{
  "data": {
    "pizzeria_id": "uuid-da-pizzaria",
    "pizzeria_name": "Pizzaria do João",
    "role": "admin"
  },
  "statusCode": 200,
  "timestamp": "..."
}
```

---

---

---

## 8. Fase 4 — Cardápio

### O que foi construído

Módulo completo de gestão do cardápio: categorias, produtos, tamanhos, bordas, combos e cardápio público para clientes via QR Code.

---

### 8.1 CardápioModule (`src/cardapio/`)

Todos os endpoints exigem JWT + `X-Pizzeria-Id` (exceto o cardápio público). O `PizzeriaContextGuard` valida o header e garante que o usuário tem vínculo ativo na pizzaria.

---

### 8.2 Categorias (`/menu/categories`)

CRUD de categorias com controle de ordem de exibição e janela de disponibilidade por horário.

- **Slug único por pizzaria** — `ConflictException` ao duplicar dentro da mesma pizzaria
- **Remoção bloqueada** se a categoria possuir produtos vinculados
- **Campos de horário** (`availableFrom`, `availableTo` no formato `HH:MM`) implementam RF18 — ex: categoria "Pizzas" disponível apenas a partir das 18h

---

### 8.3 Produtos (`/menu/products`)

Produtos do cardápio com suporte a pizzas (sabores/bordas) e itens simples (bebidas, entradas).

**Campos relevantes:**

| Campo | Descrição |
|---|---|
| `isPizza` | Identifica pizzas — habilita lógica de sabores e bordas no frontend |
| `maxFlavors` | Máximo de sabores globais do produto |
| `flavorPriceRule` | **RN01** — regra de cálculo de preço para pizza fracionada |
| `isActive` | Ativar/desativar temporariamente sem excluir |

**Regra de preço fracionado (RN01):**

```
FlavorPriceRule:
  highest  → preço do sabor mais caro (padrão)
  average  → média dos preços dos sabores selecionados
  fixed    → preço fixo do tamanho, independente dos sabores
```

Essa configuração é por produto. O OrdersModule (Fase 6) usa esse valor ao calcular o total do pedido com múltiplos sabores.

**Tamanhos** são sub-recursos do produto (`/menu/products/:id/sizes`) e podem sobrescrever o `maxFlavors` por tamanho específico.

**Upload de imagem** via `POST /menu/products/:id/image` (multipart/form-data) → salva no bucket `product-images` no Supabase Storage.

---

### 8.4 Bordas (`/menu/crusts`)

Bordas recheadas com preço extra configurável por tamanho (P/M/G/GG). Os campos `extraPriceS/M/L/Xl` são `Decimal` com default `0`.

---

### 8.5 Combos (`/menu/combos`)

Agrupamento de produtos com preço especial (RF19).

- **Criação atômica** — combo + itens criados em `$transaction`
- **Mínimo 2 itens** — validado no DTO com `@ArrayMinSize(2)`
- **Validação de pertencimento** — cada produto é verificado como pertencente à pizzaria antes de criar
- **Vigência opcional** — `validFrom` / `validTo` para promoções com prazo
- **Gerenciamento de itens** separado: `POST /combos/:id/items` e `DELETE /combos/:id/items/:itemId`

---

### 8.6 Cardápio Público — QR Code (`GET /public/menu/:pizzeriaId`)

Endpoint sem autenticação (`@Public()`). Retorna o cardápio completo para exibição no app do cliente ao escanear o QR Code (RF17).

```json
// GET /api/v1/public/menu/:pizzeriaId
{
  "data": {
    "pizzeria": { "id", "tradeName", "logoUrl", "phone", "address" },
    "categories": [
      {
        "id", "name", "slug", "sortOrder", "availableFrom", "availableTo",
        "products": [
          {
            "id", "name", "description", "imageUrl",
            "isPizza", "maxFlavors", "flavorPriceRule", "preparationTime",
            "sizes": [{ "id", "sizeLabel", "price", "maxFlavors" }]
          }
        ]
      }
    ],
    "crusts": [{ "id", "name", "extraPriceS", "extraPriceM", "extraPriceL", "extraPriceXl" }],
    "combos": [{ "id", "name", "description", "imageUrl", "price", "validFrom", "validTo", "items": [...] }]
  }
}
```

Combos são filtrados pela vigência no momento da requisição (`validFrom <= now <= validTo`).

---

## 9. Fase 5 — Clientes

### O que foi construído

CRUD completo de clientes com múltiplos endereços, busca rápida por telefone, programa de fidelidade (selos) e blacklist.

---

### 9.1 CustomersModule (`src/customers/`)

Todos os endpoints exigem JWT + `X-Pizzeria-Id`. Clientes são isolados por pizzaria (`pizzeriaId`).

---

### 9.2 Clientes (`/customers`)

**Unicidade:** telefone único por pizzaria — `ConflictException` ao duplicar.

**Busca:** `GET /customers?search=...` filtra por nome, telefone ou CPF (case-insensitive).

**Busca rápida por telefone:** `GET /customers/by-phone/:phone` — endpoint dedicado para uso ao abrir um novo pedido sem precisar listar todos os clientes (RF54).

**Histórico:** `GET /customers/:id` retorna dados completos + últimos 20 pedidos.

**Fidelidade (RF52):** campo `loyaltyStamps` — atualizado via `PATCH /customers/:id` com `loyaltyStamps`. O OrdersModule (Fase 6) incrementa automaticamente ao finalizar um pedido.

**Blacklist (RF53):** campo `isBlacklisted` — bloqueio via `PATCH /customers/:id`. A remoção de clientes com pedidos é bloqueada; o sistema orienta usar `isBlacklisted`.

---

### 9.3 Endereços (`/customers/:id/addresses`)

- **Endereço padrão** gerenciado por transação — ao marcar `isDefault: true` em um endereço, todos os outros são desmarcados automaticamente na mesma operação
- Endereços são listados com o padrão primeiro (`orderBy: [{ isDefault: 'desc' }]`)
- O `CustomersModule` exporta `CustomersService` para uso pelo OrdersModule

---


## 10. Fase 6 — Pedidos

### O que foi construído

Módulo completo de criação e ciclo de vida de pedidos: delivery, mesa e balcão. Inclui cálculo de preço com suporte a pizzas fracionadas, validação de cupons, transições de status, cancelamento com motivo e registro de pagamento.

---

### 10.1 OrdersModule (`src/orders/`)

Todos os endpoints exigem JWT + `X-Pizzeria-Id`. Pedidos são isolados por pizzaria (`pizzeriaId`).

---

### 10.2 Criação de pedido (`POST /orders`)

**Tipos suportados:** `delivery` | `table` | `counter`

Ao criar um pedido o sistema:
1. Valida cada produto (ativo, pertence à pizzaria)
2. Calcula o preço de cada item (ver 10.3)
3. Valida o cupom se informado (RN06)
4. Atribui um `orderNumber` sequencial por pizzaria dentro de `$transaction`
5. Persiste pedido + itens + uso do cupom atomicamente

**Validações:**
- `delivery` exige `deliveryAddressId`
- `table` exige `tableId`
- Cliente na blacklist não pode fazer pedidos

---

### 10.3 Cálculo de preço (RN01)

**Itens simples:** `unitPrice = ProductSize.price`

**Pizzas fracionadas** (quando `flavors` é informado):

| `flavorPriceRule` | Lógica |
|---|---|
| `highest` (padrão) | Cobra o preço do sabor mais caro |
| `average` | Cobra a média dos preços dos sabores |
| `fixed` | Cobra o preço fixo do tamanho, ignora sabores |

O campo `flavors` no `OrderItem` armazena o snapshot dos sabores no momento do pedido:
```json
[
  { "productId": "uuid", "name": "Margherita", "price": 35.00 },
  { "productId": "uuid", "name": "Calabresa",  "price": 32.00 }
]
```

**Borda recheada:** `extraPrice` é somado ao `unitPrice` baseado no tamanho (P/M/G/GG).

---

### 10.4 Cupons (RN06)

Validações realizadas no servidor ao criar o pedido:

| Validação | Campo |
|---|---|
| Cupom ativo e não expirado | `isActive`, `expiresAt` |
| Valor mínimo do pedido | `minOrderValue` |
| Limite total de usos | `maxUsesTotal` |
| Limite por CPF do cliente | `maxUsesPerCpf` |

Tipos de desconto: `percentage` (ex: 10%) ou `fixed` (valor fixo em R$).

---

### 10.5 Ciclo de vida do pedido

```
new → accepted → preparing → ready → delivering → done
                                    ↘ done (balcão/mesa)
any non-terminal → cancelled
```

Timestamps são preenchidos automaticamente a cada transição:

| Status | Campo preenchido |
|---|---|
| `accepted` | `acceptedAt` |
| `ready` | `readyAt` |
| `done` | `deliveredAt` |
| `cancelled` | `cancelledAt` |

**`delivering`** é exclusivo de pedidos do tipo `delivery`.

**Fidelidade (RF52):** ao marcar como `done`, o sistema incrementa `customer.loyaltyStamps` em 1 automaticamente via `$transaction`.

---

### 10.6 Cancelamento (RF08 + RN05)

`PATCH /orders/:id/cancel` exige `reason` (mínimo 3 caracteres). O motivo é gravado em `cancelReason` e registrado em auditoria com o `paymentStatus` anterior. Pedidos nos status `done` ou `cancelled` não podem ser cancelados.

**RN05 — Cancelamento pós-pagamento:** se `paymentStatus === 'paid'`, apenas roles `owner` ou `admin` podem cancelar. Um atendente tentando cancelar um pedido já pago recebe `403 Forbidden`.

---

### 10.7 Horário de funcionamento — delivery (RN02)

Ao criar um pedido `delivery`, o sistema consulta `PizzeriaConfig.businessHours` e verifica se o horário atual está dentro da janela configurada para o dia da semana.

**Formato do JSON `businessHours`:**
```json
{
  "0": { "open": false },
  "1": { "open": true, "from": "18:00", "to": "23:30" },
  "5": { "open": true, "from": "18:00", "to": "00:30" },
  "6": { "open": true, "from": "12:00", "to": "00:30" }
}
```
Chaves `"0"`–`"6"` seguem `Date.getDay()` (0 = domingo). Janelas que cruzam meia-noite são suportadas. Se um dia não estiver configurado ou `businessHours` estiver vazio, o pedido é **permitido** (fail open).

Pedidos `table` e `counter` não são afetados por este bloqueio.

---

### 10.8 Edição de itens do pedido (RF09)

`PATCH /orders/:id/items` substitui todos os itens de um pedido. Só é permitido quando `status = accepted` (antes do preparo iniciar).

**O que acontece na edição:**
1. Todos os itens anteriores são removidos (`deleteMany`)
2. Os novos itens são criados com os mesmos cálculos de preço de `create()`
3. Subtotal, desconto do cupom original, taxa de serviço e total são recalculados
4. Tudo ocorre em uma única `$transaction`

O método privado `resolveItems()` é compartilhado entre `create()` e `updateItems()` para garantir consistência no cálculo.

---

### 10.9 Número do pedido

`orderNumber` é sequencial por pizzaria — começa em 1 e incrementa em cada pedido. Útil para exibição em KDS/cozinha e busca rápida via `GET /orders/number/:orderNumber`.

---


## 11. Banco de dados — estado atual

### Está gravando no Supabase?

**Depende.** O schema está definido (30 modelos), o Prisma Client foi gerado, mas **as tabelas só existem no banco se a migration tiver sido executada**.

Para verificar/criar as tabelas:

```bash
# Terminal 1 — proxy precisa estar ativo
npm run prisma:dev

# Terminal 2 — roda a migration
npm run prisma:migrate
```

Se as tabelas não existirem, qualquer endpoint que toque o banco retorna erro 500.

### Como saber se as tabelas existem?

Acesse `GET /api/v1/health` com o proxy ativo:
- `"database": "ok"` → banco respondendo (tabelas podem existir)
- `"database": "error"` → sem conexão ou erro de query

Ou acesse o Supabase dashboard → Table Editor e veja se as tabelas aparecem.

---

### Modelos do schema (30 no total)

| Modelo | Tabela | O que representa |
|---|---|---|
| `User` | `users` | Usuários da plataforma |
| `Pizzeria` | `pizzerias` | Pizzarias cadastradas |
| `UserPizzeriaRole` | `user_pizzeria_roles` | Qual role o usuário tem em cada pizzaria |
| `PizzeriaConfig` | `pizzeria_configs` | Configurações operacionais (horário, taxas, etc.) |
| `ProductCategory` | `product_categories` | Categorias (Pizza, Bebida, Sobremesa…) |
| `Product` | `products` | Produtos do cardápio |
| `ProductSize` | `product_sizes` | Tamanhos de cada produto |
| `Crust` | `crusts` | Tipos de borda |
| `Customer` | `customers` | Clientes cadastrados na pizzaria |
| `CustomerAddress` | `customer_addresses` | Endereços dos clientes |
| `Table` | `tables` | Mesas da pizzaria |
| `TableSession` | `table_sessions` | Sessões de atendimento em mesa |
| `TableReservation` | `table_reservations` | Reservas de mesa |
| `Deliverer` | `deliverers` | Entregadores vinculados |
| `DeliveryZone` | `delivery_zones` | Zonas de entrega (bairro ou raio) |
| `LoyaltyProgram` | `loyalty_programs` | Programa de fidelidade |
| `Coupon` | `coupons` | Cupons de desconto |
| `CouponUsage` | `coupon_usages` | Histórico de uso de cupons |
| `Order` | `orders` | Pedidos |
| `OrderItem` | `order_items` | Itens de cada pedido |
| `Supplier` | `suppliers` | Fornecedores |
| `StockItem` | `stock_items` | Itens do estoque |
| `StockMovement` | `stock_movements` | Entradas/saídas de estoque |
| `CashSession` | `cash_sessions` | Sessões de caixa |
| `CashWithdrawal` | `cash_withdrawals` | Retiradas de caixa |
| `ChatConversation` | `chat_conversations` | Conversas com clientes |
| `ChatMessage` | `chat_messages` | Mensagens das conversas |
| `ChatTemplate` | `chat_templates` | Templates de resposta rápida |
| `Printer` | `printers` | Impressoras configuradas |
| `AuditLog` | `audit_logs` | Log de auditoria de todas as ações |

---

## 12. Endpoints disponíveis

### Legenda

- Cadeado aberto = público (sem JWT)
- Cadeado fechado = requer `Authorization: Bearer <token>`
- Role indicada = requer aquela role no JWT

---

### Health

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/health` | Aberto | Status da API e do banco |

---

### Auth

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Aberto | Criar conta como `owner` |
| `POST` | `/api/v1/auth/login` | Aberto | Login, retorna JWT |
| `GET` | `/api/v1/auth/me` | JWT | Perfil do usuário logado |
| `PATCH` | `/api/v1/auth/change-password` | JWT | Alterar senha |

#### POST /auth/register

```json
// Body:
{
  "name": "João Silva",
  "email": "joao@pizzaria.com",
  "password": "minhasenha123",
  "phone": "11999999999"    // opcional
}

// Resposta 201:
{
  "data": {
    "user": {
      "id": "uuid",
      "name": "João Silva",
      "email": "joao@pizzaria.com",
      "role": "owner",
      "phone": "11999999999",
      "avatarUrl": null,
      "isActive": true,
      "createdAt": "2026-04-26T..."
    },
    "token": "eyJhbGci..."
  },
  "statusCode": 201,
  "timestamp": "..."
}
```

#### POST /auth/login

```json
// Body:
{
  "email": "joao@pizzaria.com",
  "password": "minhasenha123"
}

// Resposta 200:
{
  "data": {
    "user": {
      "id": "uuid",
      "name": "João Silva",
      "email": "joao@pizzaria.com",
      "role": "owner",
      "phone": "11999999999",
      "avatarUrl": null
    },
    "token": "eyJhbGci..."
  }
}
```

#### GET /auth/me

```
Header: Authorization: Bearer eyJhbGci...
```

```json
// Resposta 200:
{
  "data": {
    "id": "uuid",
    "name": "João Silva",
    "email": "joao@pizzaria.com",
    "role": "owner",
    "phone": "11999999999",
    "avatarUrl": null,
    "isActive": true,
    "createdAt": "...",
    "pizzeriaRoles": [
      {
        "role": "admin",
        "pizzeria": {
          "id": "uuid-pizzeria",
          "tradeName": "Pizzaria do João",
          "logoUrl": null,
          "status": "active"
        }
      }
    ]
  }
}
```

#### PATCH /auth/change-password

```json
// Body:
{
  "currentPassword": "senhaatual",
  "newPassword": "novasenha123"
}

// Resposta 200:
{
  "data": { "message": "Senha alterada com sucesso" }
}
```

---

### Users

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/users` | JWT + `owner` | Listar todos os usuários |
| `GET` | `/api/v1/users/:id` | JWT | Buscar usuário por ID |
| `PATCH` | `/api/v1/users/:id` | JWT + `owner` ou `admin` | Atualizar dados do usuário |
| `DELETE` | `/api/v1/users/:id` | JWT + `owner` | Desativar usuário (soft delete) |

---

### Pizzerias

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/api/v1/pizzerias` | JWT + `owner` | Criar nova pizzaria |
| `GET` | `/api/v1/pizzerias` | JWT + `owner` | Listar pizzarias do owner |
| `GET` | `/api/v1/pizzerias/:id` | JWT + `owner` ou `admin` | Buscar pizzaria por ID |
| `PATCH` | `/api/v1/pizzerias/:id` | JWT + `owner` ou `admin` | Atualizar dados da pizzaria |
| `DELETE` | `/api/v1/pizzerias/:id` | JWT + `owner` | Desativar pizzaria (soft delete) |
| `POST` | `/api/v1/pizzerias/:id/logo` | JWT + `owner` ou `admin` | Upload do logo (multipart/form-data) |
| `GET` | `/api/v1/pizzerias/:id/users` | JWT + `owner` ou `admin` | Listar usuários vinculados |
| `POST` | `/api/v1/pizzerias/:id/users` | JWT + `owner` ou `admin` | Convidar usuário por e-mail |
| `PATCH` | `/api/v1/pizzerias/:id/users/:userId` | JWT + `owner` ou `admin` | Alterar role do usuário |
| `DELETE` | `/api/v1/pizzerias/:id/users/:userId` | JWT + `owner` ou `admin` | Remover usuário da pizzaria |

---

### Hub

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/hub/summary` | JWT + `owner` | Resumo operacional de todas as pizzarias |
| `GET` | `/api/v1/hub/pizzerias/:id/activate` | JWT + `owner` ou `admin` | Ativar contexto de uma pizzaria |

---

### Cardápio — Categorias

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/menu/categories` | owner/admin/atendente | Listar categorias ordenadas |
| `POST` | `/api/v1/menu/categories` | owner/admin | Criar categoria |
| `PATCH` | `/api/v1/menu/categories/:id` | owner/admin | Atualizar categoria |
| `DELETE` | `/api/v1/menu/categories/:id` | owner/admin | Remover (bloqueado se tiver produtos) |

---

### Cardápio — Produtos

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/menu/products` | owner/admin/atendente | Listar com filtro opcional por `?categoryId=` |
| `GET` | `/api/v1/menu/products/:id` | owner/admin/atendente | Buscar produto com tamanhos |
| `POST` | `/api/v1/menu/products` | owner/admin | Criar produto |
| `PATCH` | `/api/v1/menu/products/:id` | owner/admin | Atualizar produto |
| `DELETE` | `/api/v1/menu/products/:id` | owner/admin | Remover produto |
| `POST` | `/api/v1/menu/products/:id/image` | owner/admin | Upload de imagem (multipart/form-data) |
| `GET` | `/api/v1/menu/products/:id/sizes` | owner/admin/atendente | Listar tamanhos |
| `POST` | `/api/v1/menu/products/:id/sizes` | owner/admin | Adicionar tamanho |
| `PATCH` | `/api/v1/menu/products/:id/sizes/:sizeId` | owner/admin | Atualizar tamanho |
| `DELETE` | `/api/v1/menu/products/:id/sizes/:sizeId` | owner/admin | Remover tamanho |

---

### Cardápio — Bordas

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/menu/crusts` | owner/admin/atendente | Listar bordas |
| `POST` | `/api/v1/menu/crusts` | owner/admin | Criar borda |
| `PATCH` | `/api/v1/menu/crusts/:id` | owner/admin | Atualizar borda |
| `DELETE` | `/api/v1/menu/crusts/:id` | owner/admin | Remover borda |

---

### Cardápio — Combos

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/menu/combos` | owner/admin/atendente | Listar combos com itens |
| `GET` | `/api/v1/menu/combos/:id` | owner/admin/atendente | Buscar combo por ID |
| `POST` | `/api/v1/menu/combos` | owner/admin | Criar combo (mín. 2 itens) |
| `PATCH` | `/api/v1/menu/combos/:id` | owner/admin | Atualizar dados do combo |
| `DELETE` | `/api/v1/menu/combos/:id` | owner/admin | Remover combo |
| `POST` | `/api/v1/menu/combos/:id/items` | owner/admin | Adicionar item ao combo |
| `DELETE` | `/api/v1/menu/combos/:id/items/:itemId` | owner/admin | Remover item do combo |

---

### Cardápio Público (sem autenticação)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/public/menu/:pizzeriaId` | Aberto | Cardápio completo para QR Code (RF17) |

---

### Clientes

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/customers` | owner/admin/atendente | Listar com `?search=` (nome, telefone, CPF) |
| `GET` | `/api/v1/customers/by-phone/:phone` | owner/admin/atendente | Busca rápida ao abrir pedido |
| `GET` | `/api/v1/customers/:id` | owner/admin/atendente | Perfil + últimos 20 pedidos |
| `POST` | `/api/v1/customers` | owner/admin/atendente | Cadastrar cliente |
| `PATCH` | `/api/v1/customers/:id` | owner/admin/atendente | Atualizar dados, blacklist e selos |
| `DELETE` | `/api/v1/customers/:id` | owner/admin | Remover (bloqueado se tiver pedidos) |
| `GET` | `/api/v1/customers/:id/addresses` | owner/admin/atendente | Listar endereços |
| `POST` | `/api/v1/customers/:id/addresses` | owner/admin/atendente | Adicionar endereço |
| `PATCH` | `/api/v1/customers/:id/addresses/:addressId` | owner/admin/atendente | Atualizar endereço |
| `DELETE` | `/api/v1/customers/:id/addresses/:addressId` | owner/admin/atendente | Remover endereço |

---

### Pedidos

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `POST` | `/api/v1/orders` | owner/admin/atendente | Criar pedido (delivery, mesa ou balcão) |
| `GET` | `/api/v1/orders` | owner/admin/atendente/cozinha/caixa | Listar com filtros: `?status=`, `?type=`, `?customerId=`, `?dateFrom=`, `?dateTo=`, `?page=`, `?limit=` |
| `GET` | `/api/v1/orders/number/:orderNumber` | owner/admin/atendente/cozinha/caixa | Busca rápida por número do pedido (RF05) |
| `GET` | `/api/v1/orders/:id` | owner/admin/atendente/cozinha/caixa | Detalhes completos com itens, sabores, cliente e cupom |
| `PATCH` | `/api/v1/orders/:id/status` | owner/admin/atendente/cozinha | Avançar status do pedido (RF06/RF07) |
| `PATCH` | `/api/v1/orders/:id/items` | owner/admin/atendente | Substituir itens do pedido — só status `accepted` (RF09) |
| `PATCH` | `/api/v1/orders/:id/cancel` | owner/admin/atendente | Cancelar com motivo obrigatório (RF08 + RN05) |
| `PATCH` | `/api/v1/orders/:id/payment` | owner/admin/atendente/caixa | Registrar forma de pagamento |

---

### Estoque — Fornecedores

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/suppliers` | owner/admin/atendente | Listar fornecedores. `?active=true/false` para filtrar por status |
| `GET` | `/api/v1/suppliers/:id` | owner/admin/atendente | Detalhes do fornecedor com lista de insumos vinculados |
| `GET` | `/api/v1/suppliers/:id/purchases` | owner/admin/atendente | Histórico de compras do fornecedor (RF84) — movimentos `entry` dos insumos vinculados, paginado. `?page=&limit=` |
| `POST` | `/api/v1/suppliers` | owner/admin | Cadastrar fornecedor (RF82) — campos: `companyName`, `tradeName?`, `cnpj?`, `contactName?`, `phone`, `email?`, `address?` (JSONB), `categories?` |
| `PATCH` | `/api/v1/suppliers/:id` | owner/admin | Atualizar fornecedor. Use `isActive: false` para desativar (RF83) |
| `DELETE` | `/api/v1/suppliers/:id` | owner/admin | Remover fornecedor — bloqueado se tiver insumos vinculados |

---

### Estoque — Insumos e Movimentações

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/stock` | owner/admin/atendente/cozinha | Listar insumos com flag `isAlert`. Filtros: `?category=`, `?supplierId=`, `?alertOnly=true` (RF72/RF73) |
| `GET` | `/api/v1/stock/alerts` | owner/admin/atendente | Insumos abaixo do mínimo, ordenados pelo mais crítico (RF74/RN04) |
| `GET` | `/api/v1/stock/:id` | owner/admin/atendente/cozinha | Detalhes do insumo + fornecedor + últimas 50 movimentações |
| `POST` | `/api/v1/stock` | owner/admin | Cadastrar insumo. Se `quantity > 0`, cria movimento de entrada "Estoque inicial" (RF72) |
| `PATCH` | `/api/v1/stock/:id` | owner/admin | Atualizar metadados — não altera quantidade diretamente |
| `DELETE` | `/api/v1/stock/:id` | owner/admin | Remover insumo — bloqueado se houver movimentações |
| `POST` | `/api/v1/stock/:id/movements` | owner/admin/atendente | Registrar movimentação (RF75/RF77). Tipos: `entry`, `withdrawal`, `loss`, `adjustment` |
| `GET` | `/api/v1/stock/:id/movements` | owner/admin/atendente/cozinha | Histórico paginado de movimentações (RF79). Filtro: `?type=` |

**Tipos de movimentação:**

| Tipo | Efeito | Observação |
|---|---|---|
| `entry` | +qty ao estoque | Nota fiscal, reposição |
| `withdrawal` | −qty do estoque | Retirada para uso. Bloqueado se qty > estoque atual |
| `loss` | −qty do estoque | Perda por vencimento/quebra. Bloqueado se qty > estoque atual |
| `adjustment` | seta estoque para qty informado | Inventário. `quantity` é o valor absoluto alvo |
| `auto_debit` | −qty do estoque | Gerado internamente por integração com pedidos (futuro) |

---

### Caixa

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`
>
> **RN03:** abertura, fechamento e sangrias são restritos a roles `owner`, `admin` e `caixa`.

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/cash/dashboard` | owner/admin/caixa | Dashboard financeiro: receita hoje/15d/30d, breakdown por pagamento, vendas por hora, taxa de serviço (RF64/RF65/RF70/RF71) |
| `POST` | `/api/v1/cash/sessions` | owner/admin/caixa | Abrir caixa com `initialAmount` (fundo de troco) — bloqueado se já houver sessão aberta (RF63) |
| `GET` | `/api/v1/cash/sessions/current` | owner/admin/caixa/atendente | Sessão de caixa aberta no momento com sangrias |
| `GET` | `/api/v1/cash/sessions` | owner/admin/caixa | Histórico de sessões. `?onlyOpen=true&page=&limit=` |
| `GET` | `/api/v1/cash/sessions/:id` | owner/admin/caixa | Detalhes de uma sessão com quem abriu/fechou e sangrias |
| `POST` | `/api/v1/cash/sessions/:id/close` | owner/admin/caixa | Fechar caixa: recebe `actualBalance`, calcula totais por método, saldo esperado e diferença (RF67/RF69) |
| `POST` | `/api/v1/cash/sessions/:id/withdrawals` | owner/admin/caixa | Registrar sangria com `amount` e `reason` — incrementa `totalWithdrawals` (RF66) |
| `GET` | `/api/v1/cash/sessions/:id/withdrawals` | owner/admin/caixa | Listar sangrias da sessão |

**Relatório de fechamento (resposta de `POST /cash/sessions/:id/close`):**

| Campo | Descrição |
|---|---|
| `totalCash` | Soma de pedidos pagos em dinheiro desde a abertura |
| `totalCredit` | Soma de pedidos pagos em crédito |
| `totalDebit` | Soma de pedidos pagos em débito |
| `totalPix` | Soma de pedidos pagos em PIX |
| `totalVoucher` | Soma de pedidos pagos em voucher |
| `totalWithdrawals` | Soma de todas as sangrias da sessão |
| `expectedBalance` | `initialAmount + totalCash − totalWithdrawals` |
| `actualBalance` | Valor físico informado pelo operador |
| `difference` | `actualBalance − expectedBalance` (negativo = falta, positivo = sobra) |
| `totalServiceFee` | Soma das taxas de serviço dos pedidos do período (RF71) |

---

### Chat — Conversas

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/chat/conversations` | owner/admin/atendente | Lista conversas ordenadas pela última mensagem (RF56). `?unreadOnly=true` filtra não lidas. Inclui preview da última mensagem |
| `POST` | `/api/v1/chat/conversations` | owner/admin/atendente | Iniciar ou retomar conversa com cliente (RF56). Idempotente: retorna a existente se já houver |
| `GET` | `/api/v1/chat/conversations/:id` | owner/admin/atendente | Detalhes da conversa com últimas 50 mensagens em ordem cronológica (RF60) |
| `PATCH` | `/api/v1/chat/conversations/:id/read` | owner/admin/atendente | Marcar conversa como lida — zera `unreadCount` |
| `POST` | `/api/v1/chat/conversations/:id/messages` | owner/admin/atendente | Enviar mensagem — texto + emojis (RF61). Suporta `senderType`: `attendant` / `customer` / `system` (RF57). RF59: envie link do cardápio no `content` |
| `POST` | `/api/v1/chat/conversations/:id/messages/template` | owner/admin/atendente | Enviar mensagem usando template (RF62) — `{ templateId }` |
| `GET` | `/api/v1/chat/conversations/:id/messages` | owner/admin/atendente | Histórico completo paginado (RF60). `?page=&limit=` (máx 200) |

**Lógica de `unreadCount`:**

| senderType | Efeito no unreadCount |
|---|---|
| `attendant` | Zera (staff está ativo na conversa) |
| `system` | Não altera (mensagem de saída automática) |
| `customer` | +1 (nova mensagem não lida pela equipe) |

---

### Chat — Templates

> Todos os endpoints exigem `Authorization: Bearer <token>` + `X-Pizzeria-Id: <id>`

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/chat/templates` | owner/admin/atendente | Listar templates ativos (RF62). `?activeOnly=false` inclui desativados |
| `POST` | `/api/v1/chat/templates` | owner/admin | Criar template com `title` e `content`. Suporta variáveis `{{ }}` no conteúdo (RF57/RF62) |
| `PATCH` | `/api/v1/chat/templates/:id` | owner/admin | Atualizar template ou desativar com `isActive: false` |
| `DELETE` | `/api/v1/chat/templates/:id` | owner/admin | Remover template permanentemente |

**Templates sugeridos para RF57 (mensagens automáticas de pedido):**

| Template | Conteúdo sugerido |
|---|---|
| Pedido confirmado | `Olá {{nome}}! Seu pedido foi confirmado. Tempo estimado: {{tempo}} min 🍕` |
| Saiu para entrega | `Seu pedido saiu para entrega com {{entregador}}! Em breve chegará. 🛵` |
| Pedido entregue | `Pedido entregue! Obrigado pela preferência. Avalie seu pedido 🌟` |
| Cardápio digital | `Veja nosso cardápio completo aqui: {{link}} 📲` |

> **Integração RF57 com OrdersModule:** o `ChatService` expõe o método `sendAutoMessage(pizzeriaId, customerId, content)` — exportado pelo `ChatModule` — para que outros módulos possam disparar mensagens automáticas ao mudar status de pedido.

---

#### PATCH /users/:id

```json
// Body (todos opcionais):
{
  "name": "João da Silva",
  "phone": "11988887777",
  "avatarUrl": "https://cdn.exemplo.com/avatar.jpg"
}
```

> `DELETE` não apaga o registro — apenas seta `isActive: false`. Para reativar um usuário, é necessário um endpoint futuro ou acesso direto ao banco.

---

### Swagger (documentação interativa)

Acesse `http://localhost:3000/docs` com o servidor rodando. Lá você pode:

- Ver todos os endpoints com seus schemas
- Fazer chamadas direto pelo navegador
- Autenticar com o JWT clicando em **Authorize** (ícone de cadeado)

---

## 13. Padrões de resposta da API

### Resposta de sucesso

Todo endpoint bem-sucedido retorna:

```json
{
  "data": <o que o controller retornou>,
  "statusCode": 200,
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

### Resposta de erro

Todo erro retorna:

```json
{
  "statusCode": 401,
  "message": "Token inválido ou expirado",
  "error": "Unauthorized",
  "path": "/api/v1/auth/me",
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

### Erros de validação (body inválido)

Quando o body não passa na validação do `ValidationPipe`:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 8 characters"],
  "error": "Bad Request",
  "path": "/api/v1/auth/register",
  "timestamp": "..."
}
```

---

## 14. O que ainda NÃO existe

As fases seguintes vão implementar:

| Fase | O que vem |
|---|---|
| ~~**4**~~ | ~~CardápioModule~~ ✅ Implementado |
| ~~**5**~~ | ~~CustomersModule~~ ✅ Implementado |
| ~~**6**~~ | ~~OrdersModule~~ ✅ Implementado |
| ~~**7**~~ | ~~EstoqueModule~~ ✅ Implementado _(RF76 baixa automática + RF80/RF81 relatórios → adiados para Fase 10 / ficha técnica futura)_ |
| ~~**8**~~ | ~~CaixaModule~~ ✅ Implementado |
| ~~**9**~~ | ~~ChatModule~~ ✅ Implementado |
| **10** | ReportsModule — relatórios, dashboard |

**O que está no schema mas sem endpoints ainda:**
- Todas as 28 tabelas além de `users` e `audit_logs`
- O campo `X-Pizzeria-Id` é validado pelo `PizzeriaContextGuard` em todos os endpoints com `@RequiresPizzeria()` (Fases 4, 5 em diante)

**Refresh token:**
- Não implementado. O token atual dura `JWT_EXPIRES_IN` (padrão 7 dias). Quando expirar, o usuário faz login novamente.

**Upload de avatar:**
- O campo `avatarUrl` existe no `User` mas o upload de imagem para o Supabase Storage não está implementado ainda.

---

## Dicas para novos devs

**Ao criar um novo módulo:**
1. Injete `PrismaService` e `AuditService` diretamente — não precisa importar os módulos deles
2. Use `@Public()` para endpoints que não precisam de JWT
3. Use `@Roles(UserRole.owner)` para restringir por role
4. Use `@CurrentUser()` para pegar dados do usuário logado
5. Lance exceções do NestJS (`NotFoundException`, `BadRequestException`, etc.) — o filtro global formata automaticamente

**Ao alterar o schema.prisma:**
1. Edite o `prisma/schema.prisma`
2. Rode `npm run prisma:generate` para atualizar os tipos TypeScript
3. Com o proxy ativo, rode `npm run prisma:migrate` para aplicar no banco
4. Depois do migrate, o Supabase já tem as novas colunas/tabelas

**Se o build quebrar com `TS5103 ignoreDeprecations`:**
Abra o `tsconfig.json` e verifique se `"ignoreDeprecations"` está como `"5.0"` (não `"6.0"`). O NestJS CLI às vezes reverte esse valor.

**Se o servidor não conectar ao banco:**
Verifique se `npm run prisma:dev` está rodando em outro terminal. Sem o proxy na porta 51213, nenhuma query funciona.
