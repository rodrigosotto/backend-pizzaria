# Alerta de Estoque via WebSocket — Documentação Técnica

> Implementado em: 2026-05-24
> Branch: `fix/adjust-payment-cash-role-webshockets`

---

## Contexto

Ao finalizar um pedido, o sistema faz a **baixa automática de estoque** (RF76) para cada item que possui Ficha Técnica configurada (`ProductRecipe`). Antes desta implementação, essa baixa era silenciosa: mesmo que um item caísse abaixo do estoque mínimo, nenhuma notificação era exibida em tempo real. O operador só descobria o problema acessando a página de Relatórios.

---

## O que foi implementado

### 1. Evento WebSocket `stock:alert`

Adicionado o método `notifyStockAlert` ao `OrdersGateway`:

```typescript
// src/orders/orders.gateway.ts
notifyStockAlert(
  pizzeriaId: string,
  items: Array<{ id: string; name: string; quantity: string; minQuantity: string; unit: string }>,
) {
  this.server.to(`pizzaria:${pizzeriaId}`).emit('stock:alert', { items });
}
```

O evento é emitido para a sala `pizzaria:{pizzeriaId}` — somente os clientes daquela pizzaria recebem o alerta.

---

### 2. Emissão automática após baixa de estoque

O `OrdersService` passou a rastrear os `stockItemId` afetados durante a baixa automática e, após cada operação, verifica quais deles estão em ou abaixo do `minQuantity`.

#### Na criação do pedido (`create`)

```typescript
// src/orders/orders.service.ts — método create()
const debitedStockIds: string[] = [];

// dentro da transação, ao iterar as receitas:
debitedStockIds.push(recipe.stockItemId);

// após a transação:
this.emitStockAlerts(pizzeriaId, debitedStockIds).catch(() => {});
```

#### Na transição para `accepted` (`updateStatus`)

```typescript
// src/orders/orders.service.ts — método updateStatus()
const debitedStockIds: string[] = [];

// dentro da transação, ao iterar as receitas:
debitedStockIds.push(recipe.stockItemId);

// após a transação:
if (debitedStockIds.length > 0) {
  this.emitStockAlerts(pizzeriaId, debitedStockIds).catch(() => {});
}
```

#### Método privado `emitStockAlerts`

```typescript
private async emitStockAlerts(pizzeriaId: string, stockItemIds: string[]) {
  if (stockItemIds.length === 0) return;
  const items = await this.prisma.db.stockItem.findMany({
    where: { id: { in: stockItemIds } },
    select: { id: true, name: true, quantity: true, minQuantity: true, unit: true },
  });
  const alerts = items.filter((i) => i.quantity.lte(i.minQuantity));
  if (alerts.length > 0) {
    this.ordersGateway.notifyStockAlert(
      pizzeriaId,
      alerts.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity.toFixed(3),
        minQuantity: i.minQuantity.toFixed(3),
        unit: i.unit,
      })),
    );
  }
}
```

> Falhas neste método são silenciosas (`.catch(() => {})`): um erro na notificação nunca derruba a operação principal do pedido.

---

### 3. Listener no frontend

Adicionado o evento `stock:alert` ao hook `useOrdersRealtime`:

```typescript
// src/hooks/useOrdersRealtime.ts
const handleStockAlert = (data: { items: StockAlertItem[] }) => {
  data.items.forEach((item) => {
    const qty = parseFloat(item.quantity)
    const min = parseFloat(item.minQuantity)
    const label = qty <= 0
      ? `Estoque esgotado: ${item.name}`
      : `Estoque baixo: ${item.name} (${...} ${item.unit} — mín. ${...})`
    toast.warning(label, { duration: 8000 })
  })
  onStockAlertRef.current?.(data.items)
}

socket.on('stock:alert', handleStockAlert)
```

O hook expõe uma nova opção opcional `onStockAlert?: (items: StockAlertItem[]) => void` para que o componente pai possa reagir além do toast automático.

---

## Fluxo completo

```
Operador confirma pedido
        │
        ▼
POST /orders  (ou PATCH /orders/:id/status → accepted)
        │
        ▼
Transação Prisma:
  ├── Cria OrderItem(s)
  ├── Para cada ProductRecipe do produto:
  │     ├── Cria StockMovement (type = auto_debit)
  │     ├── Decrementa StockItem.quantity
  │     └── Registra o stockItemId em debitedStockIds[]
        │
        ▼
Após a transação:
  emitStockAlerts()
  ├── Busca StockItem WHERE id IN debitedStockIds
  ├── Filtra quantity <= minQuantity
  └── Se houver alertas:
        └── ordersGateway.notifyStockAlert()
              └── socket.emit('stock:alert', { items })
                        │
                        ▼
              Frontend (useOrdersRealtime)
              └── toast.warning("Estoque baixo: ...")
```

---

## Pré-requisito: Ficha Técnica (ProductRecipe)

A baixa automática **só ocorre** se o produto tiver uma Ficha Técnica configurada. Sem ela, o sistema não sabe qual item de estoque debitar e nenhum alerta é emitido.

### Como configurar

1. Acesse **Cardápio** no painel
2. Localize o produto (ex.: "Coca-Cola 350ml")
3. Clique no ícone de **Ficha Técnica**
4. Adicione o item de estoque correspondente com a quantidade consumida por unidade:

| Campo | Valor para bebidas |
|---|---|
| Item de estoque | Coca-Cola 350ml |
| Quantidade por unidade | `1` |

Para ingredientes de preparo (ex.: muçarela em uma pizza), a quantidade é fracionada (ex.: `0.15` kg por pizza).

### Modelo de dados

```
Product  ──(1:N)──  ProductRecipe  ──(N:1)──  StockItem
               { quantity: Decimal }
```

Ao criar um pedido com 120 unidades de Coca-Cola, o sistema calcula:

```
consumed = recipe.quantity × orderItem.quantity
         = 1 × 120
         = 120 unidades debitadas do estoque
```

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/orders/orders.gateway.ts` | Adicionado `notifyStockAlert()` |
| `src/orders/orders.service.ts` | Rastreamento de `debitedStockIds`, chamada a `emitStockAlerts()`, método privado `emitStockAlerts()` |
| `src/hooks/useOrdersRealtime.ts` (frontend) | Interface `StockAlertItem`, opção `onStockAlert`, listener `stock:alert` com toast automático |
