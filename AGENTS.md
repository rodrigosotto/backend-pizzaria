# AGENTS.md — backend-pizzaria

Instruções para o Codex trabalhar neste projeto. Leia antes de qualquer implementação.

## Documentação de referência

Antes de implementar qualquer coisa, consulte:
- `docs/backend-guia-tecnico.md` — arquitetura completa, fluxos, endpoints e decisões técnicas

---

## Stack

- NestJS 11 + Fastify + TypeScript 5.7
- Prisma 7.8 (ORM) + PostgreSQL via Supabase
- Auth: Supabase JWT (ES256/HS256) — sem Passport
- Build: **webpack** (`nest build --webpack`) — não usar `nest build` puro

---

## Regras críticas

### Prisma
- **Sempre** acessar o banco via `this.prisma.db.nomeDoModelo`
- **Nunca** usar `this.prisma.nomeDoModelo` diretamente — o client estendido com `withAccelerate()` fica em `.db`
- Após alterar `schema.prisma`, rodar `npm run prisma:generate` antes de qualquer query
- Transações: usar `this.prisma.db.$transaction([...])` — nunca encadear queries independentes em operações que exigem atomicidade

### Build e desenvolvimento
- Desenvolvimento: `npm run dev` (webpack watch)
- O servidor sobe mesmo sem o proxy do banco — mas queries vão falhar
- Para queries funcionarem localmente: `npm run prisma:dev` em terminal separado

### Autenticação e Guards
- `JwtAuthGuard` e `RolesGuard` são **globais** — aplicam em todos os endpoints automaticamente
- Para endpoint público (sem JWT): usar `@Public()` no método ou controller
- Para restringir por role: `@Roles(UserRole.owner)` — importar de `@prisma/client`
- Dados do usuário logado: `@CurrentUser()` no parâmetro do método

### Padrão de resposta
- Sucesso: `{ data, statusCode, timestamp }` — gerado automaticamente pelo `TransformInterceptor`
- Erro: `{ statusCode, message, error, path, timestamp }` — gerado pelo `HttpExceptionFilter`
- Nunca retornar objetos fora desse envelope — não criar wrappers manuais

### Auditoria
- Auditoria é **manual** — chamar `this.audit.log({...})` explicitamente em cada operação sensível
- `AuditService` e `PrismaService` são globais — injetar direto no construtor, sem importar os módulos
- Falhas na auditoria são silenciosas — nunca derrubam a operação principal

### Módulo multi-tenant
- O header `X-Pizzeria-Id` identifica a pizzaria ativa
- Está configurado no CORS e documentado no Swagger
- A partir da Fase 3, toda operação de negócio deve validar esse header

---

## Convenções de código

- Injeção de dependência: sempre via construtor, nunca `@Inject()` manual para services locais
- DTOs: usar `class-validator` para validação, `@ApiProperty()` para Swagger
- Exceções: usar as classes do NestJS (`NotFoundException`, `BadRequestException`, etc.) — o filtro global formata automaticamente
- Nomes de arquivos: `kebab-case.tipo.ts` (ex: `auth.service.ts`, `jwt-auth.guard.ts`)
- Nunca commitar `.env` — apenas `.env.example`

---

## O que NÃO fazer

- Não usar `Express` — o adapter é Fastify
- Não criar `PrismaClient` diretamente — sempre usar `PrismaService`
- Não pular auditoria em operações de escrita sensíveis (update, delete, mudança de role)
- Não adicionar `@Module()` sem registrar no `AppModule`
- Não usar `nest build` sem `--webpack` — o TypeScript com `module: nodenext` não compila corretamente sem webpack
