# 🍕 Sistema de Gestão de Pizzarias

**Documento de Requisitos e Regras de Negócio**

**Versão 4.0 | 2026**

**Jefferson Rodrigo Sotto — Senior Software Engineer**

| Stack Frontend | React + Zustand + TypeScript |
|---|---|
| Stack Backend | NestJS + Node.js |
| Banco de Dados | PostgreSQL (Supabase) |
| Realtime | Supabase Realtime / WebSockets |

---

## 📋 Changelog: v3.0 → v4.0

- Plataforma evoluída de gestão de **UMA** pizzaria para **MÚLTIPLAS** pizzarias por conta de usuário.
- Adicionado **Hub do Proprietário**: tela principal pós-login com cards de cada pizzaria gerenciada.
- Novo role: **Proprietário (owner)** – pode possuir e gerenciar N pizzarias.
- Nova tabela `pizzerias` como entidade central; todas as demais tabelas passam a ter chave `pizzeria_id`.
- Novos módulos NestJS: `PizzeriaModule` e `HubModule`.
- Novo Zustand store: `usePizzeriaStore` (contexto de pizzaria ativa).
- Requisitos RF103–RF113 adicionados para o hub de gestão.
- Regras de negócio RN15–RN18 adicionadas.
- Seção 0 (Hub do Proprietário) inserida antes dos módulos existentes.
- Sprint 0 adicionado ao roadmap de MVP.
- Todo conteúdo da v3.0 preservado sem alterações.

---

## 0. Hub do Proprietário – Gestão Multi-Pizzarias v4.0

A partir da versão 4.0, o sistema deixa de ser voltado para uma única pizzaria e passa a ser uma plataforma de gestão multi-unidade. Um usuário com perfil Proprietário pode cadastrar e gerenciar múltiplas pizzarias em uma única conta. Após o login, o Proprietário é direcionado ao Hub — uma dashboard central que lista todas as pizzarias vinculadas à sua conta — e, a partir daí, seleciona qual pizzaria deseja operar.

### 0.1 Fluxo de Navegação Pós-Login

1. Usuário acessa a tela de Login e autentica com e-mail e senha.
2. Sistema identifica o role do usuário:
   - → **Proprietário**: redirecionado ao Hub (dashboard multi-pizzaria).
   - → **Demais roles** (Admin, Atendente, Cozinha, Entregador, Caixa): redirecionados diretamente ao painel da pizzaria à qual estão vinculados.
3. No Hub, o Proprietário visualiza cards representando cada pizzaria gerenciada.
4. Ao clicar em um card, o Proprietário entra no sistema completo daquela pizzaria (mantendo contexto "pizzaria ativa").
5. O Proprietário pode retornar ao Hub a qualquer momento pelo menu superior.

### 0.2 Hub Dashboard – Layout e Funcionalidades

O Hub é a primeira tela que o Proprietário visualiza após o login. Ele apresenta uma visão consolidada de todas as pizzarias gerenciadas e oferece as ações globais da conta.

**Elementos do Hub:**

- **Header global:** logotipo do sistema, nome do usuário, avatar, botão de Perfil e botão de Logout.
- **Grid de Cards:** cada pizzaria é representada por um card contendo: logotipo/foto da pizzaria, nome fantasia, endereço resumido (bairro/cidade), status operacional (Aberta | Fechada | Pausada), indicadores rápidos do dia (pedidos em aberto, faturamento do dia, alertas de estoque).
- **Botão "Nova Pizzaria":** abre formulário de cadastro de nova pizzaria (nome, CNPJ, endereço, logotipo).
- **Botão "Perfil do Usuário":** abre modal/página de edição dos dados pessoais do Proprietário.
- **Botão "Configurações da Conta":** gerenciamento de assinatura/plano, notificações globais, segurança da conta.
- **Indicador de plano ativo:** exibe o plano contratado e o limite de pizzarias permitidas.

### 0.3 Perfil do Usuário (Proprietário)

Acessível a partir do Hub, permite ao Proprietário editar seus dados pessoais sem precisar entrar em nenhuma pizzaria específica.

- Nome completo
- E-mail (com confirmação por e-mail ao alterar)
- Telefone / WhatsApp
- Foto de perfil (upload)
- Senha (fluxo: senha atual → nova senha → confirmação)
- Preferências de notificação (push, e-mail)
- Idioma da interface (PT-BR padrão)

### 0.4 Configurações da Conta

- **Plano ativo:** exibição do plano atual, data de renovação, limite de pizzarias e usuários.
- **Faturamento:** histórico de faturas e forma de pagamento do plano.
- **Segurança:** autenticação em dois fatores (2FA), sessões ativas.
- **Notificações globais:** alertas de estoque crítico, novos pedidos, fechamento de caixa — configuráveis por e-mail ou push para todas as pizzarias de uma vez.
- **Exclusão de conta:** fluxo seguro com confirmação e exportação de dados.

### 0.5 Requisitos Funcionais – Hub do Proprietário

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF103 | Hub | Tela de Hub pós-login com grid de cards de pizzarias gerenciadas pelo Proprietário. | Alta |
| RF104 | Hub | Card de pizzaria exibe: logotipo, nome, endereço resumido, status operacional e indicadores do dia (pedidos abertos, faturamento, alertas). | Alta |
| RF105 | Hub | Botão "Nova Pizzaria": formulário de cadastro com nome fantasia, razão social, CNPJ, endereço completo, logotipo e horários de funcionamento. | Alta |
| RF106 | Hub | Seleção de pizzaria: ao clicar no card, o sistema carrega o contexto (pizzeria_id) e redireciona para o painel operacional da pizzaria selecionada. | Alta |
| RF107 | Hub | Botão "Voltar ao Hub" visível no painel operacional para retornar ao hub sem fazer logout. | Alta |
| RF108 | Perfil | Página de Perfil do Usuário: edição de nome, e-mail, telefone, foto e senha. | Alta |
| RF109 | Perfil | Fluxo de alteração de e-mail com confirmação via link enviado ao novo endereço. | Alta |
| RF110 | Perfil | Fluxo de alteração de senha com validação da senha atual. | Alta |
| RF111 | Config. | Página de Configurações da Conta: plano ativo, limite de pizzarias, histórico de faturamento. | Alta |
| RF112 | Config. | Configuração global de notificações (push/e-mail) aplicável a todas as pizzarias da conta. | Média |
| RF113 | Hub | Indicador visual no card da pizzaria para alertas críticos (estoque mínimo atingido, caixa não aberto, pedidos acumulados sem aceite). | Média |

---

## 1. Visão Geral do Sistema

O Sistema de Gestão de Pizzarias é uma plataforma SaaS completa, multi-tenant e em tempo real, projetada para digitalizar e automatizar todas as operações de uma ou múltiplas pizzarias — do atendimento ao cliente até o controle financeiro e de estoque. Um único Proprietário pode cadastrar e gerenciar N pizzarias dentro da mesma conta, acessando cada uma de forma independente a partir do Hub central.

### 1.1 Objetivos Estratégicos

- Permitir que proprietários de redes de pizzarias gerenciem todas as unidades em uma única plataforma.
- Centralizar a gestão de pedidos (delivery, mesa e balcão) em um único painel operacional por unidade.
- Oferecer painéis dedicados e em tempo real para cozinha, entregadores e caixa.
- Reduzir erros de pedido e tempo de preparo com o KDS (Kitchen Display System).
- Aumentar retenção de clientes via programa de fidelidade e cupons.
- Fornecer visibilidade financeira completa com relatórios de caixa e consolidação de estoque.
- Integrar chat interno para comunicação via WhatsApp (app-to-app sem custos externos).

### 1.2 Perfis de Usuário (Roles)

| Role | Capacidades e Acessos |
|---|---|
| Proprietário | Acesso ao Hub multi-pizzaria. Pode cadastrar novas pizzarias, gerenciar a conta e acessar qualquer pizzaria como Admin. Visualiza indicadores consolidados de todas as unidades. |
| Admin | Acesso total dentro de uma pizzaria: configurações, relatórios, usuários, cardápio, fornecedores, estoque e caixa. |
| Atendente | Cadastro de pedidos (delivery/mesa/balcão), cadastro de clientes, chat, impressão de comanda. |
| Cozinha | Painel KDS: visualização e atualização de status de pedidos. Sem acesso financeiro. |
| Entregador | Painel de rotas, aceitar/finalizar entregas, atualizar status de entrega em tempo real. |
| Caixa | Abertura/fechamento de caixa, consolidação de pagamentos, relatórios do dia. |
| Cliente (App) | Fazer pedidos via cardápio digital/QR Code, acompanhar status, programa de fidelidade. |

---

## 2. Requisitos Funcionais por Módulo

### 2.1 Módulo de Pedidos

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF01 | Pedidos | Kanban com colunas: Novo → Aceito → Em Preparo → Pronto → Em Entrega → Finalizado. | Alta |
| RF02 | Pedidos | Alerta sonoro e notificação push para novos pedidos recebidos. | Alta |
| RF03 | Pedidos | Impressão automática de comanda (térmica 80mm) ao aceitar pedido. | Alta |
| RF04 | Pedidos | Pedidos por tipo: Delivery, Mesa, Balcão (Take Away). | Alta |
| RF05 | Pedidos | Detalhamento: sabores fracionados (1/2, 1/3), bordas, observações. | Alta |
| RF06 | Pedidos | Cálculo automático do tempo estimado de preparo/entrega. | Média |
| RF07 | Pedidos | Histórico completo de pedidos com filtros por data, status e cliente. | Alta |
| RF08 | Pedidos | Cancelamento de pedido com registro de motivo (apenas Admin/Atendente). | Alta |
| RF09 | Pedidos | Edição de pedido em status "Aceito" (antes do preparo iniciar). | Média |
| RF10 | Pedidos | Integração Realtime: todos os painéis atualizam automaticamente via WebSocket. | Alta |

### 2.2 Módulo de Cardápio

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF11 | Cardápio | Categorias configuráveis: Pizzas, Bebidas, Entradas, Sobremesas, Outros. | Alta |
| RF12 | Cardápio | Cadastro de pizzas com tamanhos (P, M, G, GG/Família) e qtd. de sabores por tamanho. | Alta |
| RF13 | Cardápio | Cadastro de bordas recheadas com preços adicionais por tamanho. | Alta |
| RF14 | Cardápio | Cadastro de bebidas e refrigerantes (com e sem variações de tamanho). | Alta |
| RF15 | Cardápio | Upload de imagem por produto com otimização automática (Supabase Storage). | Média |
| RF16 | Cardápio | Ativar/desativar produto temporariamente sem excluir do cadastro. | Alta |
| RF17 | Cardápio | Visualização do cardápio digital (web/mobile) para autoatendimento via QR Code. | Alta |
| RF18 | Cardápio | Configuração de horário de disponibilidade por categoria (ex: pizzas só a partir das 18h). | Média |
| RF19 | Cardápio | Combos e promoções: agrupamento de itens com preço especial. | Média |

### 2.3 Painel da Cozinha (KDS – Kitchen Display System)

O KDS substitui comandas impressas e exibe em tempo real o que deve ser preparado, otimizando o fluxo da cozinha.

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF20 | Cozinha | Exibição de cards de pedidos divididos por status: A Fazer │ Em Preparo │ Prontos. | Alta |
| RF21 | Cozinha | Cada card exibe: número do pedido, tipo (delivery/mesa), itens, sabores e obs. | Alta |
| RF22 | Cozinha | Temporizador visual em cada card mostrando tempo decorrido desde a entrada. | Alta |
| RF23 | Cozinha | Card muda de cor conforme tempo: verde → amarelo (10min) → vermelho (20min). | Alta |
| RF24 | Cozinha | Botão de ação: "Iniciar Preparo" e "Marcar como Pronto" por card. | Alta |
| RF25 | Cozinha | Painel de controle: quantas pizzas estão em preparo, prontas e aguardando entrega. | Média |
| RF26 | Cozinha | Suporte a múltiplas telas/estações na cozinha (ex: uma para pizzas, uma para fritos). | Baixa |
| RF27 | Cozinha | Filtro por categoria de produto na tela da cozinha. | Média |

### 2.4 Painel do Entregador

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF28 | Entregador | Painel mobile-first com lista de entregas atribuídas ao motoboy logado. | Alta |
| RF29 | Entregador | Status de entrega: Pendente → Saiu para Entrega → Entregue. | Alta |
| RF30 | Entregador | Endereço do cliente com botão de abertura direta no Google Maps / Waze. | Alta |
| RF31 | Entregador | Visualização do valor e forma de pagamento da entrega (troco necessário). | Alta |
| RF32 | Entregador | Registro de comprovante de entrega (foto opcional via câmera do celular). | Baixa |
| RF33 | Entregador | Histórico de entregas do dia com total percorrido e comissões. | Média |
| RF34 | Entregador | Atribuição manual de motoboy ao pedido pelo Atendente/Admin. | Alta |
| RF35 | Entregador | Cadastro completo do motoboy: nome, CPF, telefone, moto, placa, PIX para pagamento. | Alta |

### 2.5 Módulo de Mesas

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF36 | Mesas | Grade visual de mesas com status: Livre (verde) │ Ocupada (vermelho) │ Reservada (amarelo). | Alta |
| RF37 | Mesas | Abertura de mesa com vínculo de nome, telefone e CPF (opcional). | Alta |
| RF38 | Mesas | Geração de QR Code único por mesa para autoatendimento pelo cliente. | Alta |
| RF39 | Mesas | Múltiplos pedidos por mesa (rodadas) com consolidação na conta. | Alta |
| RF40 | Mesas | Divisão de conta: por pessoa ou por item. | Média |
| RF41 | Mesas | Taxa de serviço configurável (padrão 10%) com opção de isentar por mesa. | Alta |
| RF42 | Mesas | Transferência de mesa (mover itens de uma mesa para outra). | Baixa |
| RF43 | Mesas | Reserva de mesa com data, hora e dados do cliente. | Baixa |

### 2.6 Módulo de Delivery

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF44 | Delivery | Cadastro de taxas de entrega por bairro ou por raio (km) a partir do endereço do estabelecimento. | Alta |
| RF45 | Delivery | Frete grátis automático para pedidos acima de valor configurável. | Média |
| RF46 | Delivery | Integração com API de CEP para preenchimento automático de endereço. | Alta |
| RF47 | Delivery | Cálculo automático de tempo estimado baseado na fila de pedidos + distância. | Média |
| RF48 | Delivery | Status de entrega visível para o cliente no cardápio digital (rastreamento simples). | Média |
| RF49 | Delivery | Bloqueio de pedidos delivery fora do horário de funcionamento configurado. | Alta |

### 2.7 Cadastro de Clientes

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF50 | Clientes | Cadastro completo: nome, CPF, telefone, e-mail, múltiplos endereços de entrega. | Alta |
| RF51 | Clientes | Histórico de pedidos do cliente com valor total gasto. | Alta |
| RF52 | Clientes | Programa de fidelidade: acúmulo de selos por pedido, recompensas configuráveis. | Alta |
| RF53 | Clientes | Blacklist de clientes (bloquear pedidos de cliente problemático). | Baixa |
| RF54 | Clientes | Busca rápida por telefone ou nome ao cadastrar novo pedido. | Alta |
| RF55 | Clientes | Exportação de lista de clientes (CSV/XLSX) para campanhas de marketing. | Baixa |

### 2.8 Chat Interno / WhatsApp

O chat interno simula a experiência do WhatsApp, com conversas organizadas por cliente, sem depender de API paga do WhatsApp Business.

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF56 | Chat | Interface de chat estilo WhatsApp com lista de conversas por cliente. | Alta |
| RF57 | Chat | Mensagens automáticas configuráveis: confirmação de pedido, saída para entrega, entrega realizada. | Alta |
| RF58 | Chat | Notificações push no app do atendente para novas mensagens. | Média |
| RF59 | Chat | Envio de cardápio digital (link) pelo chat. | Média |
| RF60 | Chat | Histórico completo de conversas por cliente. | Alta |
| RF61 | Chat | Suporte a texto e emojis. Imagens como opcional (fase 2). | Média |
| RF62 | Chat | Templates de mensagem rápida (respostas predefinidas com um clique). | Média |

### 2.9 Módulo de Caixa

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF63 | Caixa | Abertura de caixa com registro de valor inicial (fundo de troco). | Alta |
| RF64 | Caixa | Dashboard do caixa com total vendido em: Hoje │ 15 dias │ 30 dias. | Alta |
| RF65 | Caixa | Breakdown por forma de pagamento: Dinheiro, Crédito, Débito, PIX, Voucher. | Alta |
| RF66 | Caixa | Registro de sangrias (retirada de dinheiro) com motivo e responsável. | Alta |
| RF67 | Caixa | Fechamento de caixa com relatório consolidado: entradas, saídas, saldo final. | Alta |
| RF68 | Caixa | Impressão do relatório de fechamento de caixa. | Média |
| RF69 | Caixa | Conciliação de pagamentos: comparativo entre total em sistema e valor físico informado. | Alta |
| RF70 | Caixa | Gráfico de vendas por hora do dia (identificar pico de demanda). | Média |
| RF71 | Caixa | Taxa de serviço: cálculo automático e destaque no relatório. | Média |

### 2.10 Controle de Estoque

Sugestão de expansão: o módulo de estoque controla insumos da pizzaria categorizados por tipo, com alertas de reposição e vínculo com fornecedores.

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF72 | Estoque | Cadastro de produtos de estoque por categoria: Frios, Frutas, Óleos, Verduras, Legumes, Fritos (peixe, calabresa, batata). | Alta |
| RF73 | Estoque | Controle de quantidade em estoque com unidade de medida (kg, unidade, litro, pacote). | Alta |
| RF74 | Estoque | Alerta automático de estoque mínimo configurável por produto. | Alta |
| RF75 | Estoque | Registro de entrada de estoque (nota fiscal) com vínculo ao fornecedor. | Alta |
| RF76 | Estoque | Baixa automática de estoque ao confirmar pedido (vinculada à receita do produto). | Média |
| RF77 | Estoque | Baixa manual de estoque (perdas, consumo interno). | Alta |
| RF78 | Estoque | Inventário periódico: comparativo entre estoque teórico e real contado. | Média |
| RF79 | Estoque | Histórico de movimentações (entradas, saídas, perdas) com rastreabilidade. | Alta |
| RF80 | Estoque | Relatório de consumo por período por ingrediente. | Média |
| RF81 | Estoque | Consolidação de produtos: relatório de insumos necessários baseado nos pedidos do período. | Alta |

### 2.11 Cadastro de Fornecedores

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF82 | Fornecedores | Cadastro completo: razão social, CNPJ, representante, telefone, e-mail, endereço. | Alta |
| RF83 | Fornecedores | Vínculo de fornecedor a categorias de produtos que ele fornece. | Alta |
| RF84 | Fornecedores | Histórico de compras realizadas com o fornecedor. | Média |
| RF85 | Fornecedores | Registro de cotações e comparativo de preços entre fornecedores. | Baixa |
| RF86 | Fornecedores | Geração de pedido de compra para o fornecedor (PDF). | Baixa |

### 2.12 Programa de Fidelidade e Cupons

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF87 | Fidelidade | Configuração de meta de selos: X pedidos = 1 recompensa (ex: pizza grátis). | Alta |
| RF88 | Fidelidade | Validade configurável dos selos acumulados (ex: 90 dias). | Alta |
| RF89 | Fidelidade | Exibição no checkout de quantos selos faltam para o prêmio. | Alta |
| RF90 | Fidelidade | Múltiplos programas de fidelidade com recompensas diferentes. | Baixa |
| RF91 | Cupons | Criação de cupons de desconto: porcentagem (%) ou valor fixo (R$). | Alta |
| RF92 | Cupons | Valor mínimo de pedido para aplicação do cupom. | Alta |
| RF93 | Cupons | Limite de uso por CPF e/ou data de expiração. | Alta |
| RF94 | Cupons | Relatório de cupons utilizados com impacto no faturamento. | Média |

### 2.13 Configurações do Estabelecimento

| ID | Módulo | Descrição | Prioridade |
|---|---|---|---|
| RF95 | Config. | Dados do perfil: nome fantasia, CNPJ, endereço, redes sociais, logotipo. | Alta |
| RF96 | Config. | Horários de funcionamento por dia da semana com abertura/fechamento. | Alta |
| RF97 | Config. | Chave mestre on/off para aceitar pedidos online. | Alta |
| RF98 | Config. | Tempo estimado de entrega/retirada: automático (por fila) ou manual. | Alta |
| RF99 | Config. | Formas de pagamento habilitadas: PIX, Cartão Crédito/Débito, Dinheiro, Voucher. | Alta |
| RF100 | Config. | Templates de mensagens automáticas (confirmação, saída, entrega). | Alta |
| RF101 | Config. | Configuração de impressoras (nome, IP, modelo) para cada setor. | Média |
| RF102 | Config. | Taxa de serviço global (%) e regra de aplicação (mesas/delivery/todos). | Alta |

---

## 3. Regras de Negócio

| ID – Regra | Descrição Detalhada |
|---|---|
| RN01 – Preço Pizza Fracionada | Em pizzas de múltiplos sabores: Admin configura a lógica: (A) Preço do sabor mais caro, (B) Média dos sabores ou (C) Preço fixo por tamanho. Padrão: opção A. |
| RN02 – Horário de Delivery | Pedidos delivery só são aceitos dentro do intervalo configurado no painel de administração. Fora do horário: exibir mensagem e desabilitar botão de pedido. |
| RN03 – Segurança do Caixa | Somente roles Admin e Caixa podem abrir, fechar ou realizar sangrias. Atendentes podem apenas registrar pagamentos. |
| RN04 – Estoque Mínimo | Ao atingir o ponto de pedido (estoque mínimo), o sistema gera alerta no painel do Admin e envia notificação push ao responsável. |
| RN05 – Cancelamento com Estorno | Cancelamentos após confirmação de pagamento exigem registro do motivo e aprovação do Admin. O estoque é revertido automaticamente. |
| RN06 – Cupom Único | Um cupom não pode ser aplicado junto com outro cupom no mesmo pedido. Desconto de fidelidade e cupom podem coexistir, configurável. |
| RN07 – Pedido Mínimo Delivery | Admin pode configurar valor mínimo de pedido para delivery (ex: R$ 30,00). Pedidos abaixo bloqueiam o checkout. |
| RN08 – Atribuição de Entregador | Um pedido só transita para "Em Entrega" após ter um motoboy atribuído. Sistema sugerirá o motoboy disponível com menos entregas ativas. |
| RN09 – Baixa de Estoque | A baixa automática só ocorre se o produto tiver receita cadastrada (ficha técnica). Produtos sem ficha técnica exigem baixa manual. |
| RN10 – Taxa de Serviço | A taxa de serviço (10% padrão) é informativa — nunca cobrada automaticamente sem confirmação do operador de caixa. |
| RN11 – Selos de Fidelidade | Pedidos cancelados não contabilizam selos. Pedidos com cupom de desconto contabilizam normalmente. |
| RN12 – Raio de Entrega | Endereços fora do raio/bairros configurados são bloqueados na etapa de endereço do cliente. Mensagem informando a área de cobertura é exibida. |
| RN13 – Mesa e QR Code | O QR Code de cada mesa é único e permanente. A sessão de pedido da mesa (conta) é vinculada à abertura, não ao QR Code. |
| RN14 – Auditoria | Toda ação sensível (cancelamento, alteração de preço, fechamento de caixa, exclusão) é registrada em log de auditoria com usuário, timestamp e dados anteriores/posteriores. |
| RN15 – Isolamento de Pizzaria 🆕 | Todos os dados operacionais (pedidos, clientes, estoque, caixa, cardápio) são isolados por `pizzeria_id`. Um usuário vinculado a uma pizzaria não enxerga dados de outra, exceto o Proprietário via Hub. |
| RN16 – Limite de Pizzarias 🆕 | O número máximo de pizzarias por conta é determinado pelo plano contratado. Ao atingir o limite, o botão "Nova Pizzaria" exibe mensagem de upgrade de plano. |
| RN17 – Proprietário como Admin 🆕 | Ao criar uma nova pizzaria, o Proprietário é automaticamente vinculado a ela com role Admin. Ele pode delegar o role Admin a outro usuário sem perder o acesso de Proprietário. |
| RN18 – Troca de Contexto 🆕 | Ao selecionar uma pizzaria no Hub, o token JWT é enriquecido com o `pizzeria_id` ativo. Toda requisição subsequente carrega esse contexto. Ao voltar ao Hub, o contexto é removido. |

---

## 4. Estrutura de Dados (Entidades – PostgreSQL)

### 📋 `pizzerias` – Pizzarias Cadastradas 🆕 v4.0

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| owner_id | UUID (FK) | Sim | Referência ao usuário Proprietário (users.id) |
| trade_name | VARCHAR(100) | Sim | Nome fantasia da pizzaria |
| company_name | VARCHAR(150) | Não | Razão social |
| cnpj | VARCHAR(18) | Não | CNPJ |
| phone | VARCHAR(20) | Sim | Telefone de contato |
| email | VARCHAR(150) | Não | E-mail do estabelecimento |
| logo_url | TEXT | Não | URL do logotipo (Supabase Storage) |
| address | JSONB | Sim | Endereço estruturado (rua, número, bairro, cidade, CEP) |
| status | ENUM | Sim | `active` │ `paused` │ `inactive` |
| plan | VARCHAR(50) | Sim | Plano contratado (`basic` │ `pro` │ `enterprise`) |
| created_at | TIMESTAMPTZ | Sim | Data de criação |
| updated_at | TIMESTAMPTZ | Sim | Última atualização |

### 📋 `user_pizzeria_roles` – Vínculos Usuário-Pizzaria 🆕 v4.0

Tabela de junção que vincula usuários a pizzarias com seus respectivos roles. Um mesmo usuário pode ter roles diferentes em pizzarias distintas.

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| user_id | UUID (FK) | Sim | Referência ao usuário (users.id) |
| pizzeria_id | UUID (FK) | Sim | Referência à pizzaria (pizzerias.id) |
| role | ENUM | Sim | `admin` │ `atendente` │ `cozinha` │ `entregador` │ `caixa` |
| is_active | BOOLEAN | Sim | Vínculo ativo/inativo |
| invited_at | TIMESTAMPTZ | Sim | Data do convite/criação do vínculo |
| accepted_at | TIMESTAMPTZ | Não | Data de aceite (para convites externos) |

### 📋 `users` – Usuários do Sistema (atualizado v4.0)

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária gerada pelo Supabase Auth |
| name | VARCHAR(100) | Sim | Nome completo |
| email | VARCHAR(150) | Sim | Email único (login) |
| role | ENUM | Sim | `owner` │ `admin` │ `atendente` │ `cozinha` │ `entregador` │ `caixa` │ `cliente` |
| phone | VARCHAR(20) | Não | Telefone com DDD |
| avatar_url | TEXT | Não | URL da foto de perfil (Supabase Storage) |
| is_active | BOOLEAN | Sim | Ativo/inativo no sistema |
| created_at | TIMESTAMPTZ | Sim | Data de criação |

> **Nota:** o campo `role` em `users` representa o tipo global do usuário. O role operacional por pizzaria é definido em `user_pizzeria_roles`.

### 📋 `customers` – Clientes

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual o cliente pertence 🆕 |
| name | VARCHAR(100) | Sim | Nome do cliente |
| phone | VARCHAR(20) | Sim | Telefone (chave de busca) |
| cpf | VARCHAR(14) | Não | CPF para identificação fiscal |
| email | VARCHAR(150) | Não | E-mail |
| loyalty_stamps | INTEGER | Sim | Total de selos acumulados (default: 0) |
| is_blacklisted | BOOLEAN | Sim | Cliente bloqueado (default: false) |
| created_at | TIMESTAMPTZ | Sim | Data de cadastro |

### 📋 `customer_addresses` – Endereços do Cliente

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| customer_id | UUID (FK) | Sim | Referência ao cliente |
| label | VARCHAR(50) | Não | Apelido (ex: "Casa", "Trabalho") |
| street | VARCHAR(200) | Sim | Logradouro |
| number | VARCHAR(20) | Sim | Número |
| complement | VARCHAR(100) | Não | Complemento |
| neighborhood | VARCHAR(100) | Sim | Bairro |
| city | VARCHAR(100) | Sim | Cidade |
| zip_code | VARCHAR(10) | Sim | CEP |
| is_default | BOOLEAN | Sim | Endereço principal |

### 📋 `products` – Produtos do Cardápio

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual o produto pertence 🆕 |
| name | VARCHAR(100) | Sim | Nome do produto |
| category_id | UUID (FK) | Sim | Categoria do produto |
| description | TEXT | Não | Descrição/ingredientes |
| image_url | TEXT | Não | URL da imagem no Supabase Storage |
| is_active | BOOLEAN | Sim | Produto disponível no cardápio |
| is_pizza | BOOLEAN | Sim | Identifica pizzas para lógica de sabores |
| max_flavors | INTEGER | Não | Qtd. máxima de sabores (para pizzas) |
| preparation_time | INTEGER | Não | Tempo de preparo em minutos |

### 📋 `product_sizes` – Tamanhos e Preços

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| product_id | UUID (FK) | Sim | Referência ao produto |
| size_label | VARCHAR(30) | Sim | Ex: Pequena, Média, Grande, Família |
| price | DECIMAL(10,2) | Sim | Preço base |
| max_flavors | INTEGER | Não | Override de sabores por tamanho |
| is_active | BOOLEAN | Sim | Tamanho disponível |

### 📋 `orders` – Pedidos

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual o pedido pertence 🆕 |
| order_number | SERIAL | Sim | Número sequencial do pedido (exibição) |
| type | ENUM | Sim | `delivery` │ `table` │ `counter` |
| status | ENUM | Sim | `new` │ `accepted` │ `preparing` │ `ready` │ `delivering` │ `done` │ `cancelled` |
| customer_id | UUID (FK) | Não | Cliente vinculado (nullable para balcão) |
| table_id | UUID (FK) | Não | Mesa (apenas tipo table) |
| delivery_address_id | UUID (FK) | Não | Endereço de entrega |
| deliverer_id | UUID (FK) | Não | Motoboy atribuído |
| subtotal | DECIMAL(10,2) | Sim | Soma dos itens |
| delivery_fee | DECIMAL(10,2) | Sim | Taxa de entrega (0 para mesa/balcão) |
| discount | DECIMAL(10,2) | Sim | Desconto de cupom/fidelidade |
| service_fee | DECIMAL(10,2) | Sim | Taxa de serviço |
| total | DECIMAL(10,2) | Sim | Total final |
| payment_method | ENUM | Não | `cash` │ `credit` │ `debit` │ `pix` │ `voucher` |
| payment_status | ENUM | Sim | `pending` │ `paid` │ `refunded` |
| coupon_id | UUID (FK) | Não | Cupom aplicado |
| notes | TEXT | Não | Observações gerais do pedido |
| estimated_time | INTEGER | Não | Tempo estimado em minutos |
| created_at | TIMESTAMPTZ | Sim | Data/hora do pedido |
| accepted_at | TIMESTAMPTZ | Não | Quando foi aceito |
| ready_at | TIMESTAMPTZ | Não | Quando ficou pronto |
| delivered_at | TIMESTAMPTZ | Não | Quando foi entregue |

### 📋 `order_items` – Itens do Pedido

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| order_id | UUID (FK) | Sim | Referência ao pedido |
| product_id | UUID (FK) | Sim | Produto pedido |
| product_size_id | UUID (FK) | Não | Tamanho selecionado |
| quantity | INTEGER | Sim | Quantidade |
| unit_price | DECIMAL(10,2) | Sim | Preço unitário no momento do pedido |
| subtotal | DECIMAL(10,2) | Sim | quantity × unit_price |
| flavors | JSONB | Não | Array de sabores `[{id, name, fraction}]` |
| crust_id | UUID (FK) | Não | Borda recheada selecionada |
| notes | TEXT | Não | Obs. do item (ex: "sem cebola") |

### 📋 `tables` – Mesas

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual a mesa pertence 🆕 |
| number | INTEGER | Sim | Número da mesa |
| capacity | INTEGER | Sim | Capacidade de pessoas |
| status | ENUM | Sim | `free` │ `occupied` │ `reserved` |
| qr_code_token | VARCHAR(50) | Sim | Token único para QR Code |
| current_session_id | UUID (FK) | Não | Sessão de atendimento ativa |

### 📋 `stock_items` – Itens de Estoque

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual o insumo pertence 🆕 |
| name | VARCHAR(100) | Sim | Nome do insumo |
| category | ENUM | Sim | `frios` │ `frutas` │ `oleo` │ `verduras` │ `legumes` │ `fritos` │ `outros` |
| unit | ENUM | Sim | `kg` │ `unit` │ `liter` │ `package` |
| quantity | DECIMAL(10,3) | Sim | Quantidade atual em estoque |
| min_quantity | DECIMAL(10,3) | Sim | Estoque mínimo para alerta |
| cost_per_unit | DECIMAL(10,2) | Não | Custo unitário último fornecedor |
| supplier_id | UUID (FK) | Não | Fornecedor principal |
| updated_at | TIMESTAMPTZ | Sim | Última atualização |

### 📋 `suppliers` – Fornecedores

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual o fornecedor está vinculado 🆕 |
| company_name | VARCHAR(150) | Sim | Razão social |
| trade_name | VARCHAR(100) | Não | Nome fantasia |
| cnpj | VARCHAR(18) | Não | CNPJ |
| contact_name | VARCHAR(100) | Não | Representante |
| phone | VARCHAR(20) | Sim | Telefone |
| email | VARCHAR(150) | Não | E-mail |
| address | JSONB | Não | Endereço estruturado |
| categories | TEXT[] | Não | Categorias de produtos fornecidos |
| is_active | BOOLEAN | Sim | Ativo/inativo |

### 📋 `cash_sessions` – Sessões de Caixa

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | UUID | Sim | Chave primária |
| pizzeria_id | UUID (FK) | Sim | Pizzaria à qual a sessão pertence 🆕 |
| opened_by | UUID (FK) | Sim | Usuário que abriu |
| closed_by | UUID (FK) | Não | Usuário que fechou |
| initial_amount | DECIMAL(10,2) | Sim | Valor inicial (fundo de troco) |
| total_cash | DECIMAL(10,2) | Não | Total dinheiro |
| total_credit | DECIMAL(10,2) | Não | Total crédito |
| total_debit | DECIMAL(10,2) | Não | Total débito |
| total_pix | DECIMAL(10,2) | Não | Total PIX |
| total_withdrawals | DECIMAL(10,2) | Sim | Total sangrias (default: 0) |
| expected_balance | DECIMAL(10,2) | Não | Saldo esperado pelo sistema |
| actual_balance | DECIMAL(10,2) | Não | Saldo informado pelo operador no fechamento |
| difference | DECIMAL(10,2) | Não | Diferença (divergência) |
| opened_at | TIMESTAMPTZ | Sim | Data/hora abertura |
| closed_at | TIMESTAMPTZ | Não | Data/hora fechamento |

---

## 5. Arquitetura e Implementação

### 5.1 Estrutura de Módulos NestJS (Backend)

Módulos preservados da v3.0, com adição dos novos módulos de hub e pizzaria:

- **HubModule** 🆕 — Dashboard multi-pizzaria: listar pizzarias do proprietário, indicadores consolidados.
- **PizzeriaModule** 🆕 — CRUD de pizzarias, convite de usuários, gerenciamento de vínculos (`user_pizzeria_roles`).
- **AuthModule** — JWT + Supabase Auth, guards de role (RBAC), enriquecimento de token com `pizzeria_id` ativo.
- **UsersModule** — CRUD de usuários do sistema, perfil do proprietário.
- **CustomersModule** — CRUD clientes + histórico + fidelidade (scoped por `pizzeria_id`).
- **ProductsModule** — Cardápio: categorias, produtos, tamanhos, bordas (scoped por `pizzeria_id`).
- **OrdersModule** — Criação, atualização de status, impressão (WebSocket events) (scoped por `pizzeria_id`).
- **TablesModule** — Mesas, sessões, QR Codes (scoped por `pizzeria_id`).
- **DeliveryModule** — Taxas, bairros, raio, atribuição de motoboy (scoped por `pizzeria_id`).
- **KitchenModule** — Feed em tempo real para KDS via Supabase Realtime (scoped por `pizzeria_id`).
- **CashModule** — Sessões de caixa, sangrias, relatórios (scoped por `pizzeria_id`).
- **StockModule** — Insumos, movimentações, alertas, inventário (scoped por `pizzeria_id`).
- **SuppliersModule** — CRUD fornecedores, ordens de compra (scoped por `pizzeria_id`).
- **LoyaltyModule** — Selos, recompensas, cupons (scoped por `pizzeria_id`).
- **ChatModule** — Conversas internas, mensagens, templates (scoped por `pizzeria_id`).
- **ReportsModule** — Relatórios consolidados de vendas, estoque, produtos (scoped por `pizzeria_id`).
- **NotificationsModule** — Push notifications, eventos Realtime.
- **ConfigModule** — Parâmetros globais do estabelecimento (scoped por `pizzeria_id`).
- **AuditModule** — Log de todas as ações sensíveis.

### 5.2 Stores Zustand (Frontend)

| Store Zustand | Responsabilidade |
|---|---|
| usePizzeriaStore 🆕 | Lista de pizzarias do proprietário, pizzaria ativa (contexto), indicadores do hub. |
| useAuthStore | Usuário logado, role global, role da pizzaria ativa, token JWT. |
| useOrderStore | Pedidos em tempo real, filtros, kanban. |
| useCartStore | Carrinho do cliente: itens, sabores, cálculo de total, cupom. |
| useKitchenStore | Feed de pedidos do KDS com timers reativos. |
| useDeliveryStore | Entregas do motoboy logado, mapa, status. |
| useCashStore | Dados da sessão de caixa aberta, totais por método. |
| useStockStore | Lista de insumos, alertas de estoque mínimo. |
| useConfigStore | Configurações globais do estabelecimento (horários, taxas, pagamentos). |
| useChatStore | Lista de conversas, mensagens, contagem de não lidos. |
| useTableStore | Status das mesas em tempo real. |

### 5.3 Estratégia de Realtime (Supabase)

- Tabelas com Realtime habilitado: `orders`, `order_items`, `tables`, `kitchen_queue`, `chat_messages`, `stock_alerts`.
- Eventos de INSERT/UPDATE/DELETE transmitidos via canal Supabase para todos os clientes conectados.
- Filtro por canal para isolar dados por perfil **e** por `pizzeria_id` (ex: entregador só recebe seus pedidos da sua pizzaria).
- Reconnect automático com exponential backoff em caso de perda de conexão.
- Hub recebe atualizações em tempo real dos indicadores de cada pizzaria via canal do proprietário.

### 5.4 Segurança (RLS e RBAC)

- Row Level Security (RLS) habilitado em todas as tabelas do Supabase.
- Policies RLS garantem isolamento por `pizzeria_id`: cada usuário só acessa dados da pizzaria à qual está vinculado.
- Guards NestJS validam role JWT em cada rota da API, incluindo o `pizzeria_id` do contexto ativo.
- Proprietário tem policy especial que permite leitura agregada de todas as suas pizzarias no HubModule.
- Dados sensíveis (CPF, valor financeiro) exigem role Admin ou Caixa.
- Rate limiting nas rotas públicas (cardápio/QR Code) para evitar abuso.

---

## 6. Sugestões de Expansão (Roadmap)

### 6.1 Fase 2 – Crescimento

- 📊 **Dashboard Analytics** — Ticket médio, produtos mais vendidos, horário de pico, mapa de calor por bairro.
- 📱 **App Mobile Nativo** — React Native para atendentes e entregadores com suporte offline.
- 🖨️ **Integração Impressoras** — Epson/Bematech via rede local (impressão de comanda e fechamento de caixa).
- ⭐ **Avaliações** — Pós-entrega, o cliente recebe link para avaliar (1-5 estrelas + comentário).
- 🎯 **Marketing** — Envio de promoções segmentadas por WhatsApp Business API para clientes da base.
- 📦 **Módulo de Compras** — Fluxo completo de cotação → pedido → recebimento de mercadoria.

### 6.2 Fase 3 – Escala

- 🏪 **Relatórios Consolidados Multi-Unidade** — Comparativos de faturamento, estoque e desempenho entre todas as pizzarias do proprietário.
- 🤖 **IA no Chat** — Atendimento inicial automatizado via LLM (tirar pedido, consultar status).
- 📈 **Previsão de Demanda** — IA para prever volume de pedidos e otimizar compras de insumos.
- 🛒 **Marketplace** — Integração com iFood/Rappi com sincronização de cardápio e pedidos.
- 💳 **Pagamento Online** — Gateway integrado (Stripe/Asaas) para pagamento no ato do pedido delivery.
- 🔗 **Cardápio Compartilhado** — Proprietário define cardápio-base que pode ser reaproveitado em múltiplas pizzarias.

### 6.3 Integrações Prioritárias

| Integração | Finalidade |
|---|---|
| ViaCEP / BrasilAPI | Autocompletar endereço pelo CEP no cadastro de clientes e pedidos. |
| Google Maps API | Cálculo de distância para taxa de entrega por raio e navegação do motoboy. |
| WhatsApp Business API (Fase 2) | Envio real de mensagens automáticas (confirmação, promoções). |
| Supabase Storage | Upload e servir imagens de produtos e logotipo do estabelecimento. |
| Firebase FCM / OneSignal | Push notifications para app mobile de atendentes e entregadores. |
| Asaas / Stripe | Processamento de pagamento online para pedidos delivery e assinatura do plano SaaS. |
| NFCe API | Emissão de nota fiscal eletrônica ao fechar pedido (compliance fiscal). |

---

## 7. Fluxos Principais

### 7.0 Fluxo de Login e Seleção de Pizzaria 🆕 v4.0

1. Usuário acessa a URL do sistema e é redirecionado à tela de Login.
2. Informa e-mail e senha → autenticação via Supabase Auth.
3. Sistema verifica o role global do usuário:
   - → **Proprietário (owner):** redirecionado ao Hub multi-pizzaria.
   - → **Demais roles:** redirecionados diretamente ao painel da pizzaria vinculada.
4. No Hub, o Proprietário visualiza os cards de suas pizzarias.
5. Ao clicar em um card, o sistema carrega o contexto da pizzaria (`pizzeria_id` no JWT) e entra no painel operacional.
6. O Proprietário pode retornar ao Hub clicando em "Todas as Pizzarias" no menu superior.
7. Ao fazer logout, o contexto de pizzaria é limpo.

### 7.1 Fluxo de Pedido Delivery

1. Cliente acessa cardápio digital via link/QR Code.
2. Seleciona itens, tamanhos, sabores e borda.
3. Informa endereço → sistema calcula taxa de entrega e tempo estimado.
4. Aplica cupom (opcional) → confirma pagamento.
5. Pedido chega ao painel do Atendente com alerta sonoro (status: Novo).
6. Atendente aceita → comanda impressa → pedido vai para KDS da Cozinha (status: Em Preparo).
7. Cozinha atualiza para "Pronto" → Atendente designa motoboy.
8. Motoboy confirma saída (status: Em Entrega) → cliente notificado.
9. Motoboy confirma entrega → pedido finalizado → selo de fidelidade creditado.

### 7.2 Fluxo de Pedido de Mesa

1. Atendente abre mesa no sistema vinculando o cliente.
2. Cliente escaneia QR Code e faz pedido pelo próprio celular, **ou** atendente lança pelo painel.
3. Pedidos vão para o KDS da cozinha em tempo real.
4. Cozinha prepara e marca como prontos.
5. Atendente entrega e pode registrar pedidos adicionais (rodadas).
6. Ao encerrar, o caixa fecha a conta: aplica taxa de serviço, divide se necessário, processa pagamento.
7. Mesa é liberada automaticamente após o fechamento.

### 7.3 Fluxo de Fechamento de Caixa

1. Operador de caixa abre sessão informando o fundo de troco.
2. Durante o dia, todos os pagamentos são registrados automaticamente nos pedidos.
3. Sangrias são registradas conforme necessário com motivo e responsável.
4. No fechamento, operador informa o valor físico em caixa.
5. Sistema gera relatório com: total por método de pagamento, sangrias, taxa de serviço e diferença.
6. Admin aprova o fechamento → sessão encerrada e dados consolidados nos relatórios mensais.

### 7.4 Fluxo de Cadastro de Nova Pizzaria 🆕 v4.0

1. Proprietário no Hub clica em "Nova Pizzaria".
2. Preenche formulário: nome fantasia, razão social, CNPJ (opcional), endereço completo, telefone, e-mail.
3. Faz upload do logotipo (opcional, pode ser adicionado depois).
4. Confirma criação → pizzaria criada com status `active`.
5. Sistema cria automaticamente o vínculo `user_pizzeria_roles` com role Admin para o Proprietário.
6. Novo card aparece no Hub imediatamente.
7. Proprietário é redirecionado às Configurações da nova pizzaria para definir horários, formas de pagamento e demais parâmetros.

---

## 8. Considerações Finais

Este documento é um artefato vivo — deve ser atualizado a cada sprint conforme decisões de produto são tomadas. Recomenda-se versionamento no Git junto ao código.

### Priorização Sugerida para MVP

| Sprint | Escopo Recomendado |
|---|---|
| Sprint 0 – Hub 🆕 | Autenticação, role Proprietário, Hub multi-pizzaria, cadastro de pizzaria, perfil do usuário. |
| Sprint 1 (MVP Core) | Auth + Roles por pizzaria, Cardápio, Pedidos (Delivery + Balcão), KDS básico, Clientes. |
| Sprint 2 | Mesas + QR Code, Painel do Entregador, Delivery com taxas por bairro, Chat interno. |
| Sprint 3 | Caixa completo, Fechamento, Relatórios financeiros básicos, Impressão de comanda. |
| Sprint 4 | Estoque, Fornecedores, Fidelidade + Cupons, Configurações do estabelecimento. |
| Sprint 5 | Analytics avançados, Notificações push, Programa de fidelidade gamificado, Inventário. |
| Fase 2+ | App mobile, Integração iFood/Rappi, Pagamento online, IA no atendimento, Relatórios multi-unidade. |

---

> **Total: ~113 Requisitos Funcionais | 18 Regras de Negócio | 14 Entidades principais | 18 Módulos NestJS | 11 Stores Zustand**