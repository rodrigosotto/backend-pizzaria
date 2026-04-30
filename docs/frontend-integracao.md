# Frontend — Guia de Integração com o Backend

> Documentação técnica para desenvolvedores que trabalham no projeto `pizzaria-app` (React/TypeScript).
> Consulte também `docs/backend-guia-tecnico.md` para entender os endpoints que o frontend consome.

---

## Índice

1. [Stack e estrutura](#1-stack-e-estrutura)
2. [Configuração do ambiente](#2-configuração-do-ambiente)
3. [Camada de API (Axios)](#3-camada-de-api-axios)
4. [Autenticação](#4-autenticação)
5. [Estado global (Zustand)](#5-estado-global-zustand)
6. [Serviços implementados](#6-serviços-implementados)
7. [Fase 1 — Dashboard integrado](#7-fase-1--dashboard-integrado)
8. [Fase 2 — Tela de Pedidos](#8-fase-2--tela-de-pedidos)
9. [Fase 3 — Cardápio](#9-fase-3--cardápio)
10. [Fase 4 — Clientes](#10-fase-4--clientes)
11. [Fase 5 — Caixa](#11-fase-5--caixa)
12. [Padrão de resposta da API](#12-padrão-de-resposta-da-api)
13. [Como testar](#13-como-testar)
14. [Checklist de integração por módulo](#14-checklist-de-integração-por-módulo)

---

## 1. Stack e estrutura

```
pizzaria-app/
├── src/
│   ├── lib/
│   │   ├── axios.ts          ← instância Axios configurada (auth + pizzeria headers)
│   │   └── supabase.ts       ← cliente Supabase Auth
│   ├── stores/
│   │   ├── auth.store.ts     ← usuário logado (Zustand + localStorage)
│   │   └── pizzeria.store.ts ← pizzaria ativa (Zustand + localStorage)
│   ├── services/             ← uma função por módulo do backend
│   │   ├── auth.service.ts
│   │   ├── hub.service.ts
│   │   ├── pizzerias.service.ts
│   │   ├── dashboard.service.ts  ← Fase 1
│   │   ├── orders.service.ts     ← Fase 2
│   │   ├── stock.service.ts      ← Fase 1 (alertas)
│   │   ├── suppliers.service.ts
│   │   ├── cardapio.service.ts   ← Fase 3
│   │   ├── customers.service.ts  ← Fase 4
│   │   └── cash.service.ts       ← Fase 5
│   ├── types/                ← interfaces TypeScript espelhando o backend
│   │   ├── auth.types.ts
│   │   ├── pizzeria.types.ts
│   │   ├── dashboard.types.ts    ← Fase 1
│   │   ├── order.types.ts        ← Fase 2
│   │   ├── stock.types.ts        ← Fase 1
│   │   ├── cardapio.types.ts     ← Fase 3
│   │   ├── customers.types.ts    ← Fase 4
│   │   └── cash.types.ts         ← Fase 5
│   └── pages/
│       ├── owner/            ← telas do dono (multi-pizzaria)
│       ├── pizzeria/         ← telas operacionais da pizzaria ativa
│       ├── cardapio/         ← Fase 3
│       ├── clientes/         ← Fase 4
│       └── cash/             ← Fase 5
```

**Frameworks principais:**
| Lib | Versão | Uso |
|---|---|---|
| React | 19 | UI |
| TypeScript | 5 | Tipagem |
| Vite | 8 | Build |
| React Router | 7 | Rotas |
| Axios | 1.15 | HTTP client |
| Zustand | 5 | State management |
| Supabase JS | — | Auth |
| Recharts | 3 | Gráficos |
| React Hook Form + Zod | 7 + 4 | Formulários e validação |
| Sonner | 2 | Toasts de notificação |

---

## 2. Configuração do ambiente

Crie o arquivo `.env` na raiz do projeto `pizzaria-app` com base no `.env.example`:

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_SUPABASE_URL=https://SEU_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

> **Onde encontrar as chaves Supabase:** Dashboard → Settings → API

Para rodar localmente:

```bash
# Terminal 1 — backend
cd backend-pizzaria
npm run dev

# Terminal 2 — frontend
cd pizzaria-app
npm run dev
```

O frontend sobe em `http://localhost:5173` e se conecta ao backend em `http://localhost:3000/api/v1`.

---

## 3. Camada de API (Axios)

**Arquivo:** `src/lib/axios.ts`

Toda requisição ao backend passa pela instância `api`. Ela cuida automaticamente de:

### Headers injetados em toda requisição

| Header | Valor | Origem |
|---|---|---|
| `Authorization` | `Bearer <token>` | Sessão Supabase (`supabase.auth.getSession()`) |
| `X-Pizzeria-Id` | UUID da pizzaria ativa | `usePizzeriaStore` |

> **Importante para devs:** Nunca adicione esses headers manualmente nos serviços. A instância `api` já cuida disso.

### Refresh automático de token

Se o backend retornar `401`, o interceptor de resposta:
1. Chama `supabase.auth.refreshSession()` para obter novo token
2. Refaz a requisição original com o novo token
3. Se o refresh falhar, limpa o estado e redireciona para `/auth`

### Como usar nos serviços

```typescript
import api from '../lib/axios'

// Sempre importe como default — NÃO importe axios direto
const res = await api.get('/meu-endpoint')
const res = await api.post('/meu-endpoint', { dado: 'valor' })
```

---

## 4. Autenticação

O fluxo de auth usa **Supabase Auth** para login/registro e sincroniza o usuário com o backend via `POST /auth/sync`.

### Fluxo completo

```
1. Usuário se registra → Supabase envia e-mail de confirmação
2. Usuário clica no link → /auth/confirm → POST /auth/sync → usuário criado no banco
3. Login: Supabase valida senha → POST /auth/sync → dados do usuário no Zustand
4. Toda requisição: token JWT injetado pelo interceptor Axios
5. Token expirado (1h): interceptor faz refresh automático
6. Logout: Supabase.signOut() + clear Zustand
```

### Endpoint de refresh manual

```
POST /auth/refresh
Body: { "refreshToken": "..." }
Response: { "accessToken": "...", "refreshToken": "...", "expiresAt": 0000 }
```

> O interceptor Axios já usa o Supabase SDK para refresh automático. O endpoint acima é para uso direto pelo cliente quando necessário.

---

## 5. Estado global (Zustand)

### `useAuthStore` — usuário logado

```typescript
import { useAuthStore } from '../stores/auth.store'

const user = useAuthStore((s) => s.user)       // AuthUser | null
const setUser = useAuthStore((s) => s.setUser) // persiste no localStorage
```

**Interface `AuthUser`:**
```typescript
{
  id: string
  name: string
  email: string
  role: string          // 'owner' | 'admin' | 'atendente' | 'caixa' | 'cozinha' | 'entregador'
  phone?: string | null
  avatarUrl?: string | null
  isActive: boolean
  createdAt: string
}
```

### `usePizzeriaStore` — pizzaria ativa

```typescript
import { usePizzeriaStore } from '../stores/pizzeria.store'

const pizzeriaId = usePizzeriaStore((s) => s.activePizzeriaId) // string | null
```

> O `activePizzeriaId` é enviado automaticamente como `X-Pizzeria-Id` em toda requisição. As telas operacionais dependem dele — sempre verifique se não é `null` antes de buscar dados.

---

## 6. Serviços implementados

Cada serviço é um objeto com métodos `async`. Todos retornam os dados já desembrulhados do envelope `{ data, statusCode, timestamp }`.

### `auth.service.ts`
```typescript
authService.register(name, email, password, phone)
authService.login(email, password)
authService.logout()
authService.forgotPassword(email)
authService.syncAfterConfirmation()
```

### `hub.service.ts`
```typescript
hubService.getSummary()               // GET /hub/summary → PizzeriaSummaryItem[]
hubService.activatePizzeria(id)       // GET /hub/pizzerias/:id/activate → seta store
```

### `pizzerias.service.ts`
```typescript
pizzeriasService.list()
pizzeriasService.getById(id)
pizzeriasService.create(dto)
pizzeriasService.update(id, dto)
pizzeriasService.remove(id)
pizzeriasService.uploadLogo(id, file)        // multipart/form-data
pizzeriasService.listUsers(id)
pizzeriasService.inviteUser(id, dto)
pizzeriasService.updateUserRole(id, userId, dto)
pizzeriasService.removeUser(id, userId)
```

### `dashboard.service.ts` *(Fase 1)*
```typescript
dashboardService.get()   // GET /cash/dashboard → DashboardData
```

### `orders.service.ts` *(Fase 2)*
```typescript
ordersService.list(filters)                         // GET /orders
ordersService.getById(id)                           // GET /orders/:id
ordersService.updateStatus(id, status, estimatedTime?)  // PATCH /orders/:id/status
ordersService.registerPayment(id, dto)              // POST /orders/:id/payment
ordersService.cancel(id, reason)                    // POST /orders/:id/cancel
```

### `stock.service.ts` *(Fase 1)*
```typescript
stockService.listAlerts()  // GET /stock/items?alertOnly=true → StockItem[]
```

### `cardapio.service.ts` *(Fase 3)*
```typescript
// Categorias
cardapioService.listCategories()
cardapioService.createCategory(dto)
cardapioService.updateCategory(id, dto)
cardapioService.deleteCategory(id)

// Produtos
cardapioService.listProducts(categoryId?)
cardapioService.getProduct(id)
cardapioService.createProduct(dto)
cardapioService.updateProduct(id, dto)
cardapioService.deleteProduct(id)
cardapioService.uploadProductImage(id, file)  // multipart/form-data

// Tamanhos
cardapioService.listSizes(productId)
cardapioService.createSize(productId, dto)
cardapioService.updateSize(productId, sizeId, dto)
cardapioService.deleteSize(productId, sizeId)

// Bordas
cardapioService.listCrusts()
cardapioService.createCrust(dto)
cardapioService.updateCrust(id, dto)
cardapioService.deleteCrust(id)

// Combos
cardapioService.listCombos()
cardapioService.createCombo(dto)
cardapioService.updateCombo(id, dto)
cardapioService.deleteCombo(id)
cardapioService.addComboItem(comboId, dto)
cardapioService.removeComboItem(comboId, itemId)
```

### `customers.service.ts` *(Fase 4)*
```typescript
// Compatibilidade com PedidosPage (busca rápida inline)
customersService.search(q)                    // → CustomerOption[]

// CRUD completo
customersService.list(search?)                // GET /customers?search=
customersService.findByPhone(phone)           // GET /customers/by-phone/:phone
customersService.findById(id)                 // GET /customers/:id
customersService.create(dto)                  // POST /customers
customersService.update(id, dto)              // PATCH /customers/:id
customersService.remove(id)                   // DELETE /customers/:id

// Endereços
customersService.listAddresses(customerId)
customersService.createAddress(customerId, dto)
customersService.updateAddress(customerId, addressId, dto)
customersService.removeAddress(customerId, addressId)
```

### `cash.service.ts` *(Fase 5)*
```typescript
cashService.getDashboard()                    // GET /cash/dashboard
cashService.openSession(dto)                  // POST /cash/sessions
cashService.getCurrentSession()               // GET /cash/sessions/current
cashService.listSessions(params?)             // GET /cash/sessions
cashService.getSession(id)                    // GET /cash/sessions/:id
cashService.closeSession(id, dto)             // POST /cash/sessions/:id/close
cashService.createWithdrawal(sessionId, dto)  // POST /cash/sessions/:id/withdrawals
cashService.listWithdrawals(sessionId)        // GET /cash/sessions/:id/withdrawals
```

---

## 7. Fase 1 — Dashboard integrado

**Arquivo:** `src/pages/pizzeria/PizzeriaDashboard.tsx`

### O que é exibido e de onde vem

| Componente | Dado | Endpoint |
|---|---|---|
| KPI — Receita de Hoje | `revenue.today.total` | `GET /cash/dashboard` |
| KPI — Pedidos Hoje | `revenue.today.orders` | `GET /cash/dashboard` |
| KPI — Ticket Médio | `today.total / today.orders` | Calculado no frontend |
| KPI — Caixa | `currentSession !== null` | `GET /cash/dashboard` |
| Variação da receita | Hoje vs média dos últimos 15d | `GET /cash/dashboard` |
| Gráfico de vendas por hora | `salesByHour[]` (média 30d) | `GET /cash/dashboard` |
| Alertas de estoque | Items com `isAlert: true` | `GET /stock/items?alertOnly=true` |
| Pedidos recentes | 5 mais recentes | `GET /orders?limit=5` |

### Loading states

- KPIs: placeholder `div` cinza animado enquanto `loadingDash = true`
- Pedidos: 4 linhas skeleton enquanto `loadingOrders = true`
- Gráfico: bloco cinza sólido enquanto carrega

### Atualização

O botão **Atualizar** (ícone `RefreshCw`) chama `fetchAll()` que dispara os 3 requests em paralelo com `Promise.allSettled`. O uso de `allSettled` (em vez de `all`) garante que uma falha em um serviço não impede os outros de renderizar.

---

## 8. Fase 2 — Tela de Pedidos

**Arquivo:** `src/pages/pizzeria/PedidosPage.tsx`

**Rota:** `/pizzeria/pedidos`

### Funcionalidades

| Feature | Endpoint backend |
|---|---|
| Listar pedidos com filtros | `GET /orders?status=&type=&page=&limit=` |
| Ver detalhes de um pedido | `GET /orders/:id` |
| Avançar status (aceitar, preparar, pronto, entregar, concluir) | `PATCH /orders/:id/status` |
| Cancelar pedido | `POST /orders/:id/cancel` |
| Registrar pagamento | `POST /orders/:id/payment` |
| Paginação | `page` e `limit` na query |

### Status de pedido — fluxo visual

```
NOVO → ACEITO → NA COZINHA → PRONTO → SAIU P/ ENTREGA → ENTREGUE
                                    ↘ (balcão/mesa) ENTREGUE
Qualquer status → CANCELADO
```

### Tipos e filtros disponíveis

**Status:** `new`, `accepted`, `preparing`, `ready`, `delivering`, `done`, `cancelled`

**Tipo:** `delivery`, `table`, `counter`

---

## 9. Fase 3 — Cardápio

> Implementado em 2026-04-29

**Arquivo:** `src/pages/cardapio/CardapioPage.tsx`

**Rota:** `/pizzeria/menu` — roles: `owner`, `admin`, `atendente`

### Abas disponíveis

| Aba | Descrição |
|---|---|
| Produtos | Lista com filtro por categoria, thumbnail, criar/editar com upload de imagem e gestão de tamanhos inline |
| Categorias | Nome, slug auto-gerado, ordenação, horário de disponibilidade |
| Bordas | Nome + preços por tamanho (P / M / G / GG) |
| Combos | Itens compostos (produto + tamanho + quantidade), validade com datas |

### Endpoints consumidos

| Feature | Endpoint |
|---|---|
| Listar / criar / editar categorias | `GET /menu/categories`, `POST`, `PATCH /:id` |
| Listar / criar / editar produtos | `GET /menu/products`, `POST`, `PATCH /:id` |
| Upload de imagem do produto | `POST /menu/products/:id/image` (multipart) |
| Tamanhos por produto | `GET /menu/products/:id/sizes`, `POST`, `PATCH /:sizeId`, `DELETE` |
| Listar / criar / editar bordas | `GET /menu/crusts`, `POST`, `PATCH /:id` |
| Combos completos | `GET /menu/combos`, `POST`, `PATCH /:id`, `DELETE` |
| Itens de combo | `POST /menu/combos/:id/items`, `DELETE /menu/combos/:id/items/:itemId` |

### Validações críticas (Combo 400)

- `productId` de item não pode ser string vazia — valide antes de salvar
- `price` deve ser um número válido — `parseFloat` pode retornar `NaN` se o campo estiver vazio
- Filtre itens inválidos antes de submeter: `items.filter(i => i.productId !== \'\' && !isNaN(i.price))`

---

## 10. Fase 4 — Clientes

> Implementado em 2026-04-30

**Arquivos criados:**
- `src/types/customers.types.ts`
- `src/services/customers.service.ts`
- `src/pages/clientes/ClientesPage.tsx`

**Rota:** `/pizzeria/clientes` — roles: `owner`, `admin`

> O backend também aceita `atendente`, mas a rota no frontend foi restrita a `owner` e `admin` por decisão de produto.

### Funcionalidades

| Feature | Detalhe |
|---|---|
| Busca rápida por telefone | Barra dedicada no topo — chama `GET /customers/by-phone/:phone`, retorna cliente ou "não encontrado" |
| Busca geral | Input com debounce 350ms — server-side via `GET /customers?search=` (nome, telefone ou CPF) |
| Lista de clientes | Avatar com iniciais, nome, telefone, CPF, selos de fidelidade, badge de bloqueado |
| Cadastrar cliente | Modal com nome, telefone, CPF, e-mail — `POST /customers` |
| Editar cliente | Mesma modal pré-preenchida — `PATCH /customers/:id` |
| Bloquear / desbloquear | Botão por linha — `PATCH /customers/:id` com `{ isBlacklisted: true/false }` |
| Remover cliente | Apenas `owner`/`admin` — bloqueado pelo backend se houver pedidos vinculados |
| Gerenciar endereços | Modal dedicada por cliente — lista, add, edit, delete com marcação de padrão |

### Tipos principais (`customers.types.ts`)

```typescript
interface Customer {
  id, pizzeriaId, name, phone, cpf, email,
  loyaltyStamps, isBlacklisted, createdAt,
  addresses: CustomerAddress[]
  orders?: CustomerOrder[]   // presente apenas em findById
}

interface CustomerAddress {
  id, customerId, label, street, number,
  complement, neighborhood, city, zipCode, isDefault
}
```

### Compatibilidade com PedidosPage

O método `customersService.search(q)` foi mantido com a mesma assinatura anterior. Ele chama `GET /customers?search=` e converte o resultado para `CustomerOption[]`. Nenhuma alteração necessária em `PedidosPage.tsx`.

---

## 11. Fase 5 — Caixa

> Implementado em 2026-04-30

**Arquivos criados:**
- `src/types/cash.types.ts`
- `src/services/cash.service.ts`
- `src/pages/cash/CaixaPage.tsx`

**Rota:** `/pizzeria/caixa` — roles: `owner`, `admin`, `caixa`

### Views da página

| View | Acesso | Descrição |
|---|---|---|
| Principal | todos | Status da sessão ativa + dashboard financeiro |
| Histórico | todos | Lista de sessões com clique para detalhes |

### Funcionalidades

| Feature | Roles | Endpoint |
|---|---|---|
| Abrir caixa | owner, admin, caixa | `POST /cash/sessions` — requer fundo de troco inicial |
| Registrar sangria | owner, admin, caixa | `POST /cash/sessions/:id/withdrawals` — valor + motivo obrigatório |
| Fechar caixa | owner, admin, caixa | `POST /cash/sessions/:id/close` — informa saldo físico |
| Relatório de fechamento | — | Exibido automaticamente pós-fechamento — breakdown por pagamento, saldo esperado vs real, diferença |
| Ver sessão ativa | todos | `GET /cash/sessions/current` — quem abriu, fundo, sangrias expansíveis |
| Histórico de sessões | owner, admin, caixa | `GET /cash/sessions` |
| Detalhe de sessão histórica | owner, admin, caixa | `GET /cash/sessions/:id` |

### Dashboard financeiro (`GET /cash/dashboard`)

| Dado | Descrição |
|---|---|
| `revenue.today` | Total vendido hoje + número de pedidos |
| `revenue.last15d` | Idem para 15 dias |
| `revenue.last30d` | Idem para 30 dias |
| `serviceFeesToday` | Total de taxa de serviço do dia |
| `paymentBreakdown` | Breakdown por forma de pagamento nos últimos 30 dias com barra de percentual |
| `salesByHour` | Gráfico de barras de pico de demanda por hora (últimos 30 dias) |
| `currentSession` | Dados da sessão aberta, ou `null` |

### Conciliação de fechamento

```
Saldo esperado = fundo inicial + total dinheiro recebido − total sangrias
Diferença      = saldo informado pelo operador − saldo esperado
```

A diferença é exibida em verde (sobra ou exato) ou vermelho (falta).

### Tipos principais (`cash.types.ts`)

```typescript
interface CashSession {
  id, pizzeriaId, openedBy, closedBy,
  initialAmount, totalCash, totalCredit, totalDebit, totalPix, totalVoucher,
  totalWithdrawals, expectedBalance, actualBalance, difference,
  openedAt, closedAt,
  opener?: { id, name }
  closer?: { id, name } | null
  withdrawals?: CashWithdrawal[]
}

interface CashDashboard {
  revenue: { today, last15d, last30d }  // { total, orders }
  paymentBreakdown: { method, total, orders }[]
  serviceFeesToday: number
  salesByHour: { hour, total, orders }[]
  currentSession: CashSession | null
}
```

---

## 12. Padrão de resposta da API

Todo endpoint bem-sucedido retorna:

```json
{
  "data": <payload>,
  "statusCode": 200,
  "timestamp": "2026-04-29T12:00:00.000Z"
}
```

**Nos serviços, sempre desembrulhe assim:**

```typescript
const res = await api.get<{ data: MeuTipo }>('/meu-endpoint')
return res.data.data   // ← note o .data.data
```

O primeiro `.data` é o Axios (body da resposta HTTP). O segundo `.data` é o campo do envelope do backend.

**Erros** retornam:

```json
{
  "statusCode": 404,
  "message": "Recurso não encontrado",
  "error": "Not Found",
  "path": "/api/v1/orders/123",
  "timestamp": "..."
}
```

Capture com `try/catch` e use `sonner` para exibir mensagens ao usuário:

```typescript
import { toast } from 'sonner'

try {
  await ordersService.updateStatus(id, 'accepted')
  toast.success('Pedido aceito!')
} catch (err: any) {
  toast.error(err?.response?.data?.message ?? 'Erro ao atualizar pedido')
}
```

---

## 13. Como testar

### Pré-requisitos

1. Backend rodando em `http://localhost:3000` com `npm run dev` no diretório `backend-pizzaria`
2. Banco Supabase conectado (variável `DATABASE_URL` no `.env` do backend)
3. `.env` do frontend preenchido (veja seção 2)

### Testando o Dashboard

1. Faça login com um usuário `owner`
2. Ative uma pizzaria no hub
3. Acesse `/pizzeria/dashboard`
4. **Verifique:** KPIs mostram valores reais (podem ser zero se não há pedidos)
5. **Verifique:** Gráfico aparece vazio com mensagem se não há dados históricos
6. **Verifique:** Alertas de estoque mostram "Nenhum alerta" se não há itens críticos
7. **Verifique:** Tabela de pedidos mostra "Nenhum pedido ainda" se não há pedidos
8. Clique em **Atualizar** — os dados devem recarregar sem tela branca

### Testando os serviços manualmente (console do browser)

```javascript
// Abra o DevTools → Console e teste:

// Ver dashboard
fetch('/api/v1/cash/dashboard', {
  headers: {
    'Authorization': 'Bearer SEU_TOKEN',
    'X-Pizzeria-Id': 'UUID_DA_PIZZARIA'
  }
}).then(r => r.json()).then(console.log)
```

Ou use o **Swagger** do backend em `http://localhost:3000/docs` para testar os endpoints diretamente.

### Estados a verificar no Dashboard

| Cenário | Comportamento esperado |
|---|---|
| Sem pedidos | KPIs zerados, tabela com mensagem "Nenhum pedido" |
| Sem caixa aberto | KPI "Caixa" mostra FECHADO em vermelho |
| Caixa aberto | KPI "Caixa" mostra ABERTO em verde com nome do operador |
| Sem alertas de estoque | Seção de alertas mostra ícone verde "Nenhum alerta" |
| Com alertas | Lista itens críticos com quantidade atual vs mínima |
| Erro de rede | Cada seção falha independentemente (Promise.allSettled) |

### Testando a tela de Pedidos

1. Crie alguns pedidos via Swagger (`POST /orders`) ou pelo frontend quando disponível
2. Acesse `/pizzeria/pedidos`
3. Verifique filtros por status e tipo
4. Avance um pedido pelo fluxo: `new → accepted → preparing → ready → done`
5. Teste o cancelamento
6. Teste o registro de pagamento

---

## 14. Checklist de integração por módulo

| Módulo | Backend pronto | Frontend (serviço) | Frontend (tela) |
|---|---|---|---|
| Auth | ✅ | ✅ `auth.service.ts` | ✅ `/auth` |
| Hub | ✅ | ✅ `hub.service.ts` | ✅ `/owner/dashboard` |
| Pizzerias | ✅ | ✅ `pizzerias.service.ts` | ✅ `/owner/units` |
| Dashboard | ✅ | ✅ `dashboard.service.ts` | ✅ `/pizzeria/dashboard` |
| Pedidos | ✅ | ✅ `orders.service.ts` | ✅ `/pizzeria/pedidos` |
| Cardápio | ✅ | ✅ `cardapio.service.ts` | ✅ `/pizzeria/menu` |
| Clientes | ✅ | ✅ `customers.service.ts` | ✅ `/pizzeria/clientes` |
| Caixa | ✅ | ✅ `cash.service.ts` | ✅ `/pizzeria/caixa` |
| Estoque | ✅ | ✅ `stock.service.ts` | ✅ `/pizzeria/estoque` |
| Fornecedores | ✅ | ✅ `suppliers.service.ts` | ✅ `/pizzeria/fornecedores` |
| Chat | ✅ | ⏳ a criar | ⏳ `/pizzeria/chat` |
| Relatórios | ✅ | ⏳ a criar | ⏳ `/pizzeria/relatorios` |
| Configurações | ✅ | ⏳ a criar | ⏳ `/pizzeria/configuracoes` |
| Fidelidade | ⏳ endpoints | ⏳ a criar | ⏳ `/pizzeria/fidelidade` |

> **Legenda:** ✅ Implementado · ⏳ Pendente · ❌ Bloqueado por dependência

---

## Dicas para novos devs

**Ao criar uma nova tela integrada:**

1. Crie os tipos em `src/types/nome-modulo.types.ts` — espelhe a resposta do backend
2. Crie o serviço em `src/services/nome-modulo.service.ts` — use `api` da lib/axios
3. Crie a página em `src/pages/pizzeria/NomePagina.tsx`
4. Registre a rota em `src/App.tsx` substituindo o `<ComingSoon />`
5. Sempre use `Promise.allSettled` para múltiplas chamadas paralelas
6. Sempre trate loading e erro separadamente por seção (não uma tela de loading global)
7. Use `toast.success` / `toast.error` do `sonner` para feedback de ações

**Nunca faça:**
- `import axios from 'axios'` — sempre use `import api from '../lib/axios'`
- Esquecer o `try/catch` em operações de escrita (POST, PATCH, DELETE)
- Passar `pizzeriaId` manualmente — o interceptor já faz isso via header `X-Pizzeria-Id`
