# Runbook — Chat + WhatsApp Business Platform

Este documento cobre somente a operação de Chat e WhatsApp Cloud API. Ele não substitui a configuração da Meta, o backup do Supabase ou as políticas de segurança da organização.

## Status atual

O código possui:

- Chat multi-tenant com JWT, roles e assignment;
- webhook `GET/POST /webhooks/whatsapp` com verificação, HMAC e parsing;
- persistência de mensagens inbound com idempotência por `wamid`;
- envio de texto e templates oficiais pela Graph API;
- fila durável em PostgreSQL e worker com retry;
- Socket.IO para atualização do Chat;
- health check em `GET /api/v1/health`.

O código não confirma, por si só, a existência ou aprovação dos recursos externos da Meta, a configuração DNS/TLS, backups do Supabase ou aprovação de permissões no App Review.

## Configuração por ambiente

Use arquivos/secret stores separados para `development`, `staging` e `production`. Nunca copie secrets entre ambientes e nunca commite `.env`.

Variáveis relacionadas ao Chat/WhatsApp:

| Variável | Desenvolvimento | Staging/produção |
|---|---|---|
| `WHATSAPP_GRAPH_API_BASE_URL` | endpoint de teste configurado | `https://graph.facebook.com` |
| `WHATSAPP_GRAPH_API_VERSION` | versão compatível com o sandbox | versão suportada pela Meta e validada no go-live |
| `WHATSAPP_ACCESS_TOKEN` | token de teste | secret de produção, somente backend |
| `WHATSAPP_APP_SECRET` | secret do App de teste | secret do App de produção, somente backend |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | token de homologação | token exclusivo de produção |
| `WHATSAPP_PHONE_NUMBER_ID` | número de teste | Phone Number ID produtivo |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA de teste | WABA produtiva |
| `WHATSAPP_APP_ID` | App de teste | App de produção |
| `WHATSAPP_DELIVERY_WORKER_ENABLED` | `true` quando houver banco disponível | `true` em exatamente um worker ativo por processo |

As demais variáveis de retry, timeout e rate limit estão documentadas em `.env.example`. Os valores reais devem ser definidos pelo ambiente, sem serem registrados neste repositório.

## Requisitos externos da Meta

Antes da homologação, confirmar no painel da Meta:

1. Meta App criado e associado ao ambiente correto;
2. WhatsApp Business Account correta;
3. Phone Number ID correto;
4. Access Token válido e armazenado como secret;
5. App Secret correto;
6. Webhook Verify Token configurado no backend e no painel;
7. permissões de mensageria e gerenciamento aprovadas para o caso de uso;
8. templates necessários criados, aprovados e cadastrados na conta correta;
9. versão da Graph API suportada pela Meta e homologada pelo time;
10. webhook inscrito para a WABA/telefone correto.

Não há valores desses recursos no código. A origem oficial para validar requisitos, permissões e versões é a documentação atual da Meta/WhatsApp Business Platform.

## HTTPS e endpoints

Em produção, o endpoint POST precisa ser público e acessível por HTTPS:

```text
POST https://<dominio-publico>/webhooks/whatsapp
GET  https://<dominio-publico>/webhooks/whatsapp
```

O certificado deve ser válido, renovado automaticamente e terminar no proxy/load balancer que encaminha para o backend. O endpoint de health é:

```text
GET https://<dominio-publico>/api/v1/health
```

O health check não recebe JWT e retorna `ok` ou `degraded` conforme a conexão PostgreSQL.

## Observabilidade e alertas

O backend registra método, rota sem query string, status, duração e `x-correlation-id`. O worker registra mensagem, correlation ID, tentativa, erro e decisão de retry sem registrar tokens.

Criar alertas no provedor de logs/monitoramento para:

- respostas 4xx/5xx no webhook;
- falhas de assinatura ou payload inválido;
- erros 401/403/429/5xx da Graph API;
- crescimento de mensagens `failed`;
- crescimento de mensagens `queued` ou `processing` antigas;
- worker sem processar mensagens dentro do intervalo esperado;
- `/api/v1/health` em estado `degraded` ou indisponível;
- aumento de latência do webhook e do envio.

O projeto não contém atualmente um exporter de métricas ou integração com APM. Esses alertas devem ser derivados dos logs, health check e consultas operacionais do PostgreSQL até que a plataforma de observabilidade seja definida.

## Backup e recuperação

Antes do go-live, confirmar no Supabase:

- backups automáticos do PostgreSQL habilitados;
- retenção aprovada pela organização;
- ponto de restauração testado em staging;
- procedimento para restaurar migrations e dados;
- política de backup do Storage, caso anexos sejam ativados futuramente.

O código não configura backups nem Storage backup. A confirmação deve ser feita no projeto Supabase de cada ambiente.

## Homologação

Executar com número de teste e dados não produtivos:

1. configurar App, WABA, Phone Number ID e webhook;
2. validar o handshake GET;
3. enviar mensagem do cliente;
4. confirmar recebimento, persistência de cliente, conversa e mensagem;
5. confirmar evento realtime para o atendente;
6. atribuir a conversa;
7. responder com texto dentro da janela;
8. confirmar registro outbound e entrega pela Meta;
9. testar template aprovado fora da janela;
10. testar erro temporário e retry;
11. encerrar a conversa;
12. enviar nova mensagem do cliente e confirmar reabertura/atualização;
13. confirmar status `sent`, `delivered`, `read` ou `failed` conforme os eventos disponíveis;
14. repetir o mesmo evento e confirmar que não há duplicidade;
15. confirmar que Tenant A não acessa dados do Tenant B.

## Produção

1. aplicar migrations aprovadas no banco de produção;
2. configurar secrets no secret manager;
3. configurar domínio HTTPS e webhook na Meta;
4. validar health check e conectividade do worker;
5. cadastrar somente templates aprovados da conta produtiva;
6. executar um teste controlado com número autorizado;
7. monitorar webhook, fila, erros e mensagens por pelo menos um ciclo operacional;
8. liberar o atendimento para os operadores.

## Rollback

Em caso de falha:

1. desabilitar o envio outbound ou o worker por `WHATSAPP_DELIVERY_WORKER_ENABLED=false`;
2. manter o webhook ativo se o recebimento puder ser preservado, ou desabilitá-lo na Meta durante incidente;
3. preservar mensagens `queued`, `processing` e `failed` para diagnóstico;
4. corrigir configuração ou retornar à versão anterior do backend;
5. não apagar mensagens nem executar rollback destrutivo de banco sem backup e aprovação;
6. reprocessar somente mensagens revisadas, considerando o risco de duplicidade em falhas de rede ambíguas;
7. confirmar health check, logs e isolamento de tenant antes de reabrir o envio.

## Troubleshooting

| Sintoma | Verificações |
|---|---|
| Meta não valida webhook | HTTPS, rota pública, verify token, método GET e resposta do challenge |
| Assinatura inválida | App Secret, raw body preservado e proxy sem alteração do payload |
| Mensagem não persistida | logs do webhook, `phone_number_id`, WABA, status da conta e `wamid` |
| Envio 401/403 | Access Token, permissões, Phone Number ID e conta associada |
| Template rejeitado | nome, idioma, status `approved`, parâmetros e conta WhatsApp |
| Fila acumulada | worker habilitado, conexão PostgreSQL, `attempts`, `nextAttemptAt` e erros Meta |
| Operador não vê conversa | JWT, vínculo `user_pizzeria_roles`, sala Socket.IO e `X-Pizzeria-Id` |
| Mensagem duplicada | `wamid`, correlation ID, estado do worker e retry após timeout |

## Go/No-Go atual

**NO-GO para produção neste momento.**

Bloqueadores objetivos:

- migrations do Chat/WhatsApp foram criadas, mas não foram aplicadas/confirmadas no PostgreSQL remoto por indisponibilidade observada anteriormente;
- nenhum ambiente staging foi confirmado pelo código;
- configuração Meta, permissões, templates, HTTPS e backups são dependências externas ainda não comprovadas;
- lint global e build completo do frontend possuem falhas preexistentes;
- não existe E2E real com banco, navegador e Meta/sandbox;
- não existe exporter de métricas/APM dedicado.

O código pode avançar para homologação somente depois de eliminar esses bloqueadores e repetir o roteiro acima.
