# Módulos Implementados — RecipeModule e KdsModule

## RecipeModule — Ficha Técnica de Produtos

### O que foi feito

**Contexto:** O schema já possuía o modelo `ProductRecipe` (usado pelo `CardapioModule` para gestão ingrediente a ingrediente). O `RecipeModule` foi construído sobre esse mesmo modelo, adicionando o campo `unit` via migração, e expondo uma interface de gestão em lote (bulk replace) necessária para a baixa automática de estoque (RF76).

**Migração aplicada:** `20260523000000_add_recipe_unit`
- Adicionou coluna `unit VARCHAR(10) NOT NULL DEFAULT 'un'` em `product_recipes`
- Ajustou precisão de `quantity` de `Decimal(10,3)` para `Decimal(10,4)`

**Arquivos criados:**
- `src/recipes/dto/upsert-recipe.dto.ts` — `RecipeIngredientDto` + `UpsertRecipeDto`
- `src/recipes/recipes.service.ts`
- `src/recipes/recipes.controller.ts`
- `src/recipes/recipes.module.ts`

### Endpoints

| Método | Rota | Roles | Descrição |
|--------|------|-------|-----------|
| `GET` | `/api/v1/recipes/:productId` | owner, admin, atendente | Retorna ficha técnica completa com dados do insumo |
| `PUT` | `/api/v1/recipes/:productId` | owner, admin | Cria ou substitui todos os ingredientes (delete + insert atômico) |
| `DELETE` | `/api/v1/recipes/:productId` | owner, admin | Remove toda a ficha técnica do produto |

### Método utilitário para pedidos

```typescript
// Usado pelo OrdersService para calcular a baixa de estoque (RF76)
const deductions = await recipesService.calculateStockDeduction(productId, quantity);
// Retorna: [{ stockItemId, quantityToDeduct, unit }]
```

### Payload do PUT

```json
{
  "ingredients": [
    { "stockItemId": "uuid-farinha", "quantity": 0.25, "unit": "kg" },
    { "stockItemId": "uuid-molho",   "quantity": 0.08, "unit": "kg" },
    { "stockItemId": "uuid-queijo",  "quantity": 0.15, "unit": "kg" }
  ]
}
```

---

## KdsModule — Kitchen Display System

### O que foi feito

**Contexto:** Módulo criado do zero — schema, migração, gateway WebSocket, service e controller. Integrado ao `OrdersService`: quando um pedido muda para status `accepted`, os itens que requerem cozinha são automaticamente adicionados à fila do KDS.

**Migração aplicada:** `20260523000001_add_kds`
- Criou enum `KdsItemStatus` (`pending | preparing | done`)
- Criou tabela `kds_items` com índices em `(pizzeria_id, status)` e `(pizzeria_id, created_at)`
- Modelo denormalizado: `productName` e `orderNumber` são copiados no momento da criação, eliminando joins em tempo real

**Arquivos criados:**
- `src/kds/dto/kds.dto.ts`
- `src/kds/kds.gateway.ts` — WebSocket namespace `/kds`
- `src/kds/kds.service.ts`
- `src/kds/kds.controller.ts`
- `src/kds/kds.module.ts`

**Arquivos modificados:**
- `src/orders/orders.service.ts` — hook no `accepted` que chama `kdsService.addItemsToQueue`
- `src/orders/orders.module.ts` — importa `KdsModule`
- `src/app.module.ts` — registra `KdsModule`

### Endpoints REST

| Método | Rota | Roles | Descrição |
|--------|------|-------|-----------|
| `GET` | `/api/v1/kds/queue` | cozinha, admin, owner | Fila da cozinha (filtro: `?status=pending\|preparing\|done`) |
| `PATCH` | `/api/v1/kds/items/:itemId/status` | cozinha | Avança status do item (`pending → preparing → done`) |
| `GET` | `/api/v1/kds/metrics` | cozinha, admin, owner | Métricas do turno: tempo médio, contagens, itens atrasados |
| `DELETE` | `/api/v1/kds/queue/done` | admin, owner | Remove itens DONE com mais de 2 horas |

### WebSocket — namespace `/kds`

**Autenticação:** JWT obrigatório no handshake — clientes sem token válido são desconectados.

**Conexão do cliente:**
```js
const socket = io('http://localhost:3000/kds', {
  auth: { token: 'Bearer eyJ...' }
});

// Entrar na sala da pizzaria
socket.emit('join:pizzeria', { pizzariaId: 'uuid-da-pizzaria' });

// Eventos recebidos
socket.on('kds:item:new',     (items) => { /* novo(s) item(ns) na fila */ });
socket.on('kds:item:updated', ({ itemId, status, updatedAt }) => { /* status mudou */ });
socket.on('kds:queue:cleared',({ pizzariaId, removed }) => { /* fila DONE limpa */ });
```

### Métricas — resposta de exemplo

```json
{
  "avgPrepTime": 8.5,
  "pendingCount": 3,
  "preparingCount": 2,
  "doneCount": 12,
  "lateItems": [
    { "id": "uuid", "productName": "Pizza Margherita", "orderNumber": 42, "waitingMinutes": 18 }
  ]
}
```

**Regras de negócio:**
- Item "atrasado" (`lateItems`): PENDING há mais de **15 minutos**
- Limpeza automática: remove itens DONE com `completedAt` há mais de **2 horas**
- Apenas produtos de categorias com `requiresKitchen = true` entram na fila

---

## Diagrama de fluxo

```
Pedido confirmado (status: accepted)
        │
        ▼
OrdersService.updateStatus()
        │
        ├─► StockMovement (baixa de estoque — RF76)
        │
        └─► KdsService.addItemsToQueue()
                │
                ├─► INSERT kds_items (apenas produtos requiresKitchen)
                │
                └─► KdsGateway.notifyItemNew()
                        │
                        └─► WebSocket → kds:item:new → Display da cozinha
```
