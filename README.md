# Desafio Diel Energia - Celsius 360 (Implementacao em andamento)

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
3. Instale dependencias:
   - `npm install`
4. Gere client e aplique migracoes:
   - `npm run db:generate`
   - `npm run db:migrate`
5. Popule dados de cadastro:
   - `npm run db:seed`
   - Para simular rede com centenas de lojas: `npm run db:seed:scale`
6. Rode API e Web:
   - `npm run dev -w apps/api`
   - `npm run dev -w apps/web`
7. Rode ingestao:
   - `npm run dev -w apps/worker`

## Testes

- Unitarios API:
  - `npm run test -w apps/api`
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
- Status de dispositivo por janela temporal:
  - ONLINE ate 5 minutos
  - OFFLINE entre 5 minutos e 24 horas
  - SEM_DADOS acima de 24 horas
- Status de ambiente derivado de status de dispositivo e ultima leitura util
- Marcacao de inWorkingHours por horario/fuso da loja
- Reprocessamento idempotente por chave unica (devId, timestampUtc)
- Controle multi-tenant por perfil:
  - ADMIN_DIEL ve tudo
  - GESTOR_CLIENTE ve lojas do proprio cliente
  - GERENTE_LOJA ve apenas lojas atribuídas
- Agregacao de series para periodos longos otimizada no PostgreSQL (`5min`, `hourly`, `daily`)
- Temperatura externa integrada via Open-Meteo com persistencia local e retorno opcional na API

## Proximos passos

- Expandir E2E Playwright para cenarios de filtros/ordenacao e responsividade mobile.
- Integrar serie externa no grafico da tela de detalhe do ambiente.
- Configurar CI para lint, build, testes (unit, integracao, Playwright) e smoke de ingestao.
