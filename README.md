<div align="center">

# 🍕 Pizza SaaS — Backend API

**Plataforma SaaS multi-tenant para gestão completa de pizzarias**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7.8-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql)](https://supabase.com)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify)](https://fastify.dev)

</div>

---

## O que é este projeto?

O **Pizza SaaS** é uma API REST completa para empresas que querem digitalizar e escalar a operação de pizzarias. A plataforma permite que um único proprietário gerencie múltiplas unidades a partir de um painel centralizado, com controle total de cardápio, pedidos, estoque, caixa, entregas e atendimento ao cliente.

A arquitetura é **multi-tenant**: cada pizzaria tem seu próprio espaço isolado de dados, enquanto o proprietário tem visibilidade sobre todas as unidades que gerencia.

---

## Para quem é?

| Perfil | O que a plataforma resolve |
|--------|---------------------------|
| **Proprietário de pizzaria única** | Digitaliza o negócio — pedidos, cardápio, caixa, entregas tudo em um lugar |
| **Redes de pizzarias** | Gestão centralizada de múltiplas unidades com dashboards unificados |
| **Franqueadoras** | Controle de cardápio padrão por unidade, relatórios consolidados |
| **Desenvolvedor de app de delivery** | API pronta para integrar com frontend web ou mobile |

---

## Funcionalidades (roadmap)

### ✅ Implementado

- [x] **Autenticação JWT** — Registro, login, troca de senha
- [x] **Multi-tenant** — Arquitetura pronta para múltiplas pizzarias por conta
- [x] **Gestão de usuários** — Perfis com roles globais e por pizzaria
- [x] **Auditoria** — Log automático de todas as ações críticas
- [x] **Health check** — Monitoramento de status da API e banco de dados
- [x] **Swagger** — Documentação interativa completa em `/docs`

### 🔜 Em desenvolvimento

- [ ] **Gestão de pizzarias** — Cadastro, configuração, múltiplas unidades
- [ ] **Cardápio** — Categorias, produtos, tamanhos, bordas, preços
- [ ] **Clientes** — Cadastro, endereços, histórico de pedidos
- [ ] **Pedidos** — Delivery, mesa e balcão com ciclo de vida completo
- [ ] **Estoque** — Controle de insumos, fornecedores, movimentações
- [ ] **Caixa** — Abertura/fechamento, sangrias, conferência
- [ ] **Chat** — Atendimento ao cliente com templates de resposta
- [ ] **Relatórios** — Dashboard financeiro, vendas, performance

---

## Stack técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | NestJS + Fastify | 11 + 5 |
| Linguagem | TypeScript | 5.7 |
| ORM | Prisma | 7.8 |
| Banco de dados | PostgreSQL (Supabase) | — |
| Autenticação | JWT (`@nestjs/jwt`) | — |
| Criptografia | bcryptjs | — |
| Validação | class-validator + class-transformer | — |
| Documentação | Swagger / OpenAPI 3 | — |
| Build | Webpack (via NestJS CLI) | 5 |
| Testes | Jest + Supertest | — |

### Por que Fastify?

O adaptador Fastify substitui o Express padrão do NestJS. Em benchmarks, o Fastify processa **~2x mais requisições por segundo** que o Express. Para uma API de pedidos onde picos de tráfego são comuns (horário do jantar, fins de semana), essa diferença é relevante.

### Por que Prisma 7?

O Prisma 7 introduziu o **Query Compiler** — as queries SQL são geradas em tempo de compilação em vez de runtime, o que reduz latência e elimina uma categoria de erros em produção. A conexão com o Supabase usa o adaptador `@prisma/adapter-pg` com connection pooling via PgBouncer.

---

## Arquitetura

```
src/
├── core/                          # Camada transversal
│   ├── filters/                   # Tratamento padronizado de erros
│   └── interceptors/              # Transform de respostas + logging
├── infra/
│   └── database/                  # Prisma Service (global)
├── common/
│   └── swagger/                   # DTOs de resposta para documentação
└── modules/
    ├── auth/                      # JWT, guards, decorators
    ├── users/                     # CRUD de usuários
    ├── health/                    # Health check
    └── audit/                     # Auditoria de ações (global)
```

### Padrão de resposta

Todas as respostas de sucesso seguem o envelope:

```json
{
  "data": { },
  "statusCode": 200,
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

Erros seguem o padrão:

```json
{
  "statusCode": 404,
  "message": "Usuário não encontrado",
  "error": "Not Found",
  "path": "/api/v1/users/abc",
  "timestamp": "2026-04-26T21:00:00.000Z"
}
```

### Sistema de roles

```
UserRole (global na plataforma)
  owner       → proprietário, acesso total
  admin       → administrador operacional
  atendente   → atendimento de pedidos
  cozinha     → produção
  entregador  → entregas
  caixa       → operação financeira
  cliente     → app de pedidos

PizzeriaUserRole (por pizzaria)
  admin | atendente | cozinha | entregador | caixa
```

Um usuário pode ser `owner` na plataforma e ter roles distintas em cada pizzaria que gerencia. A tabela `user_pizzeria_roles` centraliza esses vínculos.

---

## Banco de dados

O schema possui **30 modelos** e **12 enums** cobrindo toda a operação de uma pizzaria:

<details>
<summary>Ver todos os modelos</summary>

| Modelo | Tabela | Descrição |
|--------|--------|-----------|
| `User` | `users` | Usuários da plataforma |
| `Pizzeria` | `pizzerias` | Pizzarias cadastradas |
| `UserPizzeriaRole` | `user_pizzeria_roles` | Vínculo usuário ↔ pizzaria |
| `PizzeriaConfig` | `pizzeria_configs` | Configurações operacionais |
| `ProductCategory` | `product_categories` | Categorias do cardápio |
| `Product` | `products` | Produtos |
| `ProductSize` | `product_sizes` | Tamanhos e preços |
| `Crust` | `crusts` | Tipos de borda |
| `Customer` | `customers` | Clientes da pizzaria |
| `CustomerAddress` | `customer_addresses` | Endereços dos clientes |
| `Table` | `tables` | Mesas |
| `TableSession` | `table_sessions` | Sessões de atendimento em mesa |
| `TableReservation` | `table_reservations` | Reservas |
| `Deliverer` | `deliverers` | Entregadores |
| `DeliveryZone` | `delivery_zones` | Zonas de entrega |
| `LoyaltyProgram` | `loyalty_programs` | Programa de fidelidade |
| `Coupon` | `coupons` | Cupons de desconto |
| `CouponUsage` | `coupon_usages` | Uso de cupons |
| `Order` | `orders` | Pedidos |
| `OrderItem` | `order_items` | Itens dos pedidos |
| `Supplier` | `suppliers` | Fornecedores |
| `StockItem` | `stock_items` | Itens do estoque |
| `StockMovement` | `stock_movements` | Movimentações de estoque |
| `CashSession` | `cash_sessions` | Sessões de caixa |
| `CashWithdrawal` | `cash_withdrawals` | Retiradas de caixa |
| `ChatConversation` | `chat_conversations` | Conversas com clientes |
| `ChatMessage` | `chat_messages` | Mensagens |
| `ChatTemplate` | `chat_templates` | Templates de resposta rápida |
| `Printer` | `printers` | Impressoras configuradas |
| `AuditLog` | `audit_logs` | Log de auditoria |

</details>

---

## Como rodar localmente

### Pré-requisitos

- Node.js 22+
- npm
- Conta no [Supabase](https://supabase.com) com um projeto PostgreSQL

### 1. Clone e instale

```bash
git clone <url-do-repositorio>
cd backend-pizzaria
npm install
```

### 2. Configure o ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais do Supabase:

```dotenv
# Pooler (pgbouncer) — usado pela aplicação em runtime
DATABASE_URL="postgresql://postgres.SEU_REF:SENHA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Conexão direta — usada pelo Prisma CLI para migrations
DIRECT_URL="postgresql://postgres:SENHA@db.SEU_REF.supabase.co:5432/postgres"

JWT_SECRET="uma-chave-longa-e-aleatoria"
JWT_EXPIRES_IN="7d"
PORT=3000
```

> As URLs estão disponíveis no dashboard do Supabase em **Settings → Database**.

### 3. Crie as tabelas no banco

```bash
npx prisma migrate dev --name init
```

### 4. Gere o Prisma Client

```bash
npm run prisma:generate
```

### 5. Inicie o servidor

```bash
npm run dev
```

```
🍕 Pizza API running on http://localhost:3000/api/v1
📖 Swagger docs at http://localhost:3000/docs
```

---

## Endpoints disponíveis

### Auth — `/api/v1/auth`

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `POST` | `/auth/register` | Público | Criar conta (retorna JWT) |
| `POST` | `/auth/login` | Público | Login (retorna JWT) |
| `GET` | `/auth/me` | JWT | Perfil do usuário autenticado |
| `PATCH` | `/auth/change-password` | JWT | Alterar senha |

### Users — `/api/v1/users`

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/users` | JWT + `owner` | Listar todos os usuários |
| `GET` | `/users/:id` | JWT | Buscar usuário por ID |
| `PATCH` | `/users/:id` | JWT + `owner/admin` | Atualizar dados |
| `DELETE` | `/users/:id` | JWT + `owner` | Desativar usuário |

### Health — `/api/v1/health`

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/health` | Público | Status da API e do banco |

> Documentação interativa completa em `http://localhost:3000/docs`

---

## Autenticação

A API usa **JWT Bearer Token**. Após o login ou registro, inclua o token em todas as requisições:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Para autenticar no Swagger, clique em **Authorize** (ícone de cadeado) e cole o token.

---

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL do PostgreSQL com pgbouncer (port 6543) |
| `DIRECT_URL` | Sim | URL direta do PostgreSQL para migrations (port 5432) |
| `JWT_SECRET` | Sim | Chave secreta para assinar os tokens JWT |
| `JWT_EXPIRES_IN` | Não | Expiração do token (padrão: `7d`) |
| `PORT` | Não | Porta do servidor (padrão: `3000`) |
| `NODE_ENV` | Não | Ambiente (`development` / `production`) |
| `CORS_ORIGIN` | Não | Origem permitida pelo CORS (padrão: `*`) |

---

## Scripts

```bash
npm run dev              # Desenvolvimento com hot reload
npm run build            # Build de produção (webpack)
npm run start            # Inicia a build de produção

npm run prisma:migrate   # Cria e aplica migrations
npm run prisma:generate  # Regenera o Prisma Client
npm run prisma:dev       # Proxy local Prisma (legado — não usar com Prisma 7.8+)

npm test                 # Testes unitários
npm run test:e2e         # Testes end-to-end
npm run test:cov         # Cobertura de testes
```

---

## Testes

```bash
# Unitários
npm test

# E2E
npm run test:e2e

# Cobertura
npm run test:cov
```

Os testes E2E usam mocks do `PrismaService` para não depender de conexão com o banco.

---

## Estrutura de pastas completa

```
backend-pizzaria/
├── docs/                          # Documentação técnica detalhada
│   └── backend-guia-tecnico.md    # Guia completo para novos devs
├── prisma/
│   ├── schema.prisma              # Schema do banco (30 modelos, 12 enums)
│   └── prisma.config.ts           # Configuração do Prisma CLI (URL, adapter)
├── src/
│   ├── app.module.ts
│   ├── main.ts                    # Bootstrap — Fastify, CORS, Swagger, pipes globais
│   ├── common/
│   │   └── swagger/               # DTOs de resposta para documentação Swagger
│   ├── core/
│   │   ├── filters/               # HttpExceptionFilter
│   │   └── interceptors/          # TransformInterceptor + LoggingInterceptor
│   ├── infra/
│   │   └── database/              # PrismaService (global, pg adapter)
│   └── modules/
│       ├── auth/                  # Autenticação JWT
│       │   ├── decorators/        # @Public, @CurrentUser, @Roles
│       │   ├── dto/               # RegisterDto, LoginDto, responses
│       │   └── guards/            # JwtAuthGuard, RolesGuard
│       ├── users/                 # CRUD de usuários
│       ├── health/                # Health check
│       └── audit/                 # Serviço de auditoria (global)
├── test/
│   └── app.e2e-spec.ts
├── .env.example
├── nest-cli.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## Contribuindo

1. Crie uma branch a partir de `master`: `git checkout -b feature/nome-da-feature`
2. Implemente as alterações seguindo os padrões do projeto
3. Rode os testes: `npm test && npm run test:e2e`
4. Abra um Pull Request descrevendo o que foi feito

### Padrões de código

- **DTOs de entrada**: sempre com `class-validator` e `@ApiProperty`
- **Guards**: rotas públicas usam `@Public()`, restrição de role usa `@Roles()`
- **Auditoria**: ações críticas devem chamar `this.audit.log()` no service
- **Errors**: use sempre as exceções do NestJS (`NotFoundException`, `BadRequestException`, etc.)
- **Prisma**: acesse sempre via `this.prisma.db.modelName` — nunca importe `PrismaClient` diretamente

---

## Licença

Proprietário — todos os direitos reservados.

---

<div align="center">
Feito com NestJS, Prisma e PostgreSQL
</div>
