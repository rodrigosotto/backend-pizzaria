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
9. [Padrão de resposta da API](#9-padrão-de-resposta-da-api)
10. [Como testar](#10-como-testar)
11. [Checklist de integração por módulo](#11-checklist-de-integração-por-módulo)

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
│   │   └── stock.service.ts      ← Fase 1 (alertas)
│   ├── types/                ← interfaces TypeScript espelhando o backend
│   │   ├── auth.types.ts
│   │   ├── pizzeria.types.ts
│   │   ├── dashboard.types.ts    ← Fase 1
│   │   ├── order.types.ts        ← Fase 2
│   │   └── stock.types.ts        ← Fase 1
│   └── pages/
│       ├── owner/            ← telas do dono (multi-pizzaria)
│       └── pizzeria/         ← telas operacionais da pizzaria ativa
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

## 9. Padrão de resposta da API

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

## 10. Como testar

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

## 11. Checklist de integração por módulo

| Módulo | Backend pronto | Frontend (serviço) | Frontend (tela) |
|---|---|---|---|
| Auth | ✅ | ✅ `auth.service.ts` | ✅ `/auth` |
| Hub | ✅ | ✅ `hub.service.ts` | ✅ `/owner/dashboard` |
| Pizzerias | ✅ | ✅ `pizzerias.service.ts` | ✅ `/owner/units` |
| Dashboard | ✅ | ✅ `dashboard.service.ts` | ✅ `/pizzeria/dashboard` |
| Pedidos | ✅ | ✅ `orders.service.ts` | ✅ `/pizzeria/pedidos` |
| Cardápio | ✅ | ⏳ a criar | ⏳ `/pizzeria/menu` |
| Clientes | ✅ | ⏳ a criar | ⏳ `/pizzeria/clientes` |
| Estoque | ✅ | ⏳ `stock.service.ts` (parcial) | ⏳ `/pizzeria/estoque` |
| Fornecedores | ✅ | ⏳ a criar | ⏳ `/pizzeria/fornecedores` |
| Caixa | ✅ | ⏳ a criar | ⏳ `/pizzeria/caixa` |
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
