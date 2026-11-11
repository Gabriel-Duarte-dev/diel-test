# Desafio Diel Energia - Celsius 360

Este repositorio contem uma implementacao fullstack em progresso para o desafio tecnico da Diel.

## Stack

- Frontend: React + TypeScript + Vite
- Backend API: NestJS + Prisma
- Worker de ingestao: Node.js + TypeScript
- Banco: PostgreSQL
- Tempo real: WebSocket (gateway NestJS)

## Estrutura

- apps/web: aplicacao web (2 telas do desafio)
- apps/api: API e gateway realtime
- apps/worker: ingestao de telemetria JSONL
- dados: arquivos fornecidos no desafio

## Como rodar (base)

1. Copie `.env.example` para `.env`.
   - No Windows, este projeto usa Postgres Docker em `localhost:5433` para evitar conflito com serviços locais em `5432`.
2. Suba infraestrutura:
   - `docker compose up -d`
3. Instale dependencias com o lockfile versionado:
   - `npm ci`
4. Gere o client e aplique as migracoes:
   - `npm run db:generate`
   - `npm run db:migrate` (desenvolvimento) ou `npm run db:migrate:deploy` (deploy/CI)
5. Popule dados de cadastro:
   - `npm run db:seed`
   - Para simular rede com centenas de lojas: `npm run db:seed:scale`
   - A Seed valida IDs, referências, perfis, horários e fusos antes de gravar. Horários `24:00` são aceitos somente como fim da janela (por exemplo, `00:00–24:00`). Para remover explicitamente registros sintéticos fora da escala solicitada, defina `SEED_PRUNE_SCALED_DATA=true`; essa opção é destrutiva e deve ser usada somente em bases de desenvolvimento.
6. Rode API e Web:
   - `npm run dev -w apps/api`
   - `npm run dev -w apps/web`
7. Rode ingestao:
   - `npm run dev -w apps/worker`
   - O Worker lê `dados/telemetrias.jsonl` em streaming e grava em lotes. Ajuste `INGESTION_BATCH_SIZE` (1 a 100) conforme a capacidade do banco.
   - Para processar outro arquivo: defina `TELEMETRY_FILE=/caminho/arquivo.jsonl`.
   - A mesma versão do arquivo é idempotente para pacotes brutos (hash SHA-256 + linha) e leituras (dispositivo + timestamp). Arquivos alterados geram novos pacotes brutos e atualizam as leituras existentes.
   - Cada lote grava eventos em uma outbox transacional; o Publisher entrega os snapshots e marca eventos como processados somente após a emissão.

## Testes

- Todos os testes unitários dos workspaces:
  - `npm test`
- Typecheck de todos os workspaces:
  - `npm run typecheck`
- Build de todos os workspaces:
  - `npm run build`
- Unitários API:
  - `npm run test -w apps/api`
- Testes do Worker:
  - `npm run test -w apps/worker`
- Unitários Web:
  - `npm run test:ci -w apps/web`
- E2E Web com Playwright (sobe API+Web automaticamente):
  - `npm run test:e2e -w apps/web`
- Integracao API (com banco Docker ativo e seed aplicado):
  - `npm run test:integration -w apps/api`

Observacao: os scripts da API carregam variaveis do `.env` da raiz via `dotenv-cli`.

## Endpoints disponiveis

- GET /api/v1/health
- POST /api/v1/auth/login
- GET /api/v1/stores
- GET /api/v1/environments/:id/summary
- GET /api/v1/environments/:id/series
- GET /api/v1/dashboard/snapshot

Observacao de series:

- `GET /api/v1/environments/:id/series?includeExternal=true` inclui serie de temperatura externa (Open-Meteo) quando disponivel.

## Login para ambiente local

- A seed cria os usuarios do cadastro com senha unica: dev-only-change-me
- A aplicacao web ja exibe tela de login e usa JWT Bearer nas consultas

## Escala de lojas (centenas)

- O comando `npm run db:seed:scale` replica a base de lojas/ambientes/dispositivos para validar comportamento com rede grande.
- Escala customizada: `npm run db:seed -w apps/api -- --scale=100`.
- Observacao: as lojas sintéticas extras comecam sem telemetria (status SEM_DADOS) ate serem alimentadas.

## Regras implementadas nesta etapa

- Referencia temporal da plataforma baseada no ultimo pacote ingerido (ingestionState)
- Senhas armazenadas com hash bcrypt (cost 12)
- JWT com suporte a rotacao de segredo via `JWT_SECRETS` (separado por virgula, primeiro segredo assina novos tokens)
- JWT armazena somente a identidade (`sub`); perfil, cliente e lojas permitidas sao carregados do PostgreSQL a cada requisicao autenticada.
- WebSocket `/realtime` exige o JWT no handshake (`auth: { token }`); inscricoes por loja sao autorizadas no servidor e revalidadas antes de cada snapshot.
- Status de dispositivo por janela temporal:
  - ONLINE ate 5 minutos
  - OFFLINE entre 5 minutos e 24 horas
  - SEM_DADOS acima de 24 horas
- Status de ambiente derivado de status de dispositivo e ultima leitura util
- Marcacao de inWorkingHours por horario/fuso da loja
- Reprocessamento idempotente de leituras por chave unica (devId, timestampUtc) e dos pacotes pela hash do arquivo + linha de origem.
- Outbox transacional para publicar snapshots mesmo quando a API está temporariamente indisponível.
- Resumos e séries agregadas calculados no PostgreSQL; gaps consideram o horário/fuso de funcionamento.
- Controle multi-tenant por perfil:
  - ADMIN_DIEL ve tudo
  - GESTOR_CLIENTE ve lojas do proprio cliente
  - GERENTE_LOJA ve apenas lojas atribuídas
- Agregacao de series para periodos longos otimizada no PostgreSQL (`5min`, `hourly`, `daily`)
- Temperatura externa integrada via Open-Meteo com persistencia local e retorno opcional na API

## Auditoria e alterações

O inventário das correções desta versão, as limitações de validação e as instruções para aplicar migrations estão em `IMPLEMENTED-CHANGES.md` e `PATCH-INSTRUCTIONS.md`.

`npm run lint` executa o typecheck por enquanto. Para adicionar regras de lint TypeScript dedicadas, inclua parser e plugins compatíveis com ESLint 9.

### Consistência dos indicadores

- Leituras espúrias continuam disponíveis na série `raw` para diagnóstico, mas são excluídas de médias, percentuais e agregações.
- `comfortPercent` considera somente o tempo monitorado dentro do horário de funcionamento.
- `missingSeconds` compara o tempo de funcionamento esperado no período com o tempo monitorado, incluindo lacunas no início, no fim ou em períodos sem nenhuma leitura.
- Status de ambiente e loja diferencia ambientes sem dados de ambientes confortáveis.

### Health checks

Com o prefixo global da API, os endpoints são:

- `GET /api/v1/health` é o liveness check (processo ativo).
- `GET /api/v1/health/ready` consulta o PostgreSQL e retorna indisponibilidade quando o banco não está acessível.

### CI

O workflow executa geração do Prisma Client, migrations, Seed, typecheck, testes unitários da API e do Worker, build dos três workspaces, um smoke test do Worker contra o PostgreSQL e os cenários E2E do frontend. `lint` permanece como alias de `typecheck` enquanto o projeto não inclui parser/plugins específicos de ESLint para TypeScript.
