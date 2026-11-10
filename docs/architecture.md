# Arquitetura - Celsius 360

## Diagrama completo

```mermaid
flowchart LR
	%% Entradas de dados
	subgraph INPUT[Entrada]
		CAD[dados/cadastro.json]
		TEL[dados/telemetrias.jsonl]
	end

	%% Backend de ingestao
	subgraph INGEST[Ingestao]
		SEED[Seed Prisma]
		WORKER[Worker Node/TS\nprocessamento ordenado]
	end

	%% Persistencia
	subgraph DB[PostgreSQL]
		C[(Cadastro\nClient, Store, Environment, Device, User)]
		RAW[(RawTelemetryPacket\ndado cru)]
		TR[(TelemetryReading\nserie tratada)]
		EXT[(ExternalTemperature\nopen-meteo cache)]
		IS[(IngestionState\nreferenceTime)]
	end

	%% API e regras de negocio
	subgraph API[NestJS API]
		AUTH[Auth + RBAC\nJWT + escopo por perfil]
		STORES[StoresService\nfiltro/paginacao/sort]
		ENV[EnvironmentsService\nsummary + series + gaps]
		DASH[DashboardService\nsnapshot agregado]
		WEATHER[WeatherService\nOpen-Meteo]
	end

	%% Realtime
	subgraph RT[Realtime]
		GW[Socket Gateway\n/realtime]
		PUB[Realtime Publisher\nemite por mudanca real]
	end

	%% Frontend
	subgraph WEB[Web App React]
		UI[Telas\nLogin, Rede, Detalhe]
		CTX[NetworkContext\nestado da feature]
		Q[TanStack Query\ncache/invalidate/refetch]
		SOCK[Socket Client\nassinatura por loja]
	end

	%% Operacao e qualidade
	subgraph OPS[Operacao]
		CI[GitHub Actions CI]
		E2E[Playwright E2E]
		IT[API Integration Tests]
		UT[Unit Tests\ndominio e services]
	end

	CAD --> SEED
	SEED --> C

	TEL --> WORKER
	WORKER --> RAW
	WORKER --> TR
	WORKER --> IS
	WORKER --> C

	C --> AUTH
	C --> STORES
	C --> ENV
	C --> DASH
	TR --> STORES
	TR --> ENV
	TR --> DASH
	IS --> STORES
	IS --> ENV
	IS --> DASH

	ENV --> WEATHER
	WEATHER --> EXT
	EXT --> ENV

	TR --> PUB
	IS --> PUB
	PUB --> GW

	UI --> CTX
	CTX --> Q
	Q --> AUTH
	Q --> STORES
	Q --> ENV
	Q --> DASH

	SOCK --> GW
	GW --> SOCK
	SOCK --> Q

	CI --> UT
	CI --> IT
	CI --> E2E
```

## Fluxo ponta a ponta

1. O seed carrega cadastro base no banco.
2. O worker le o JSONL em ordem, grava dado cru e gera serie tratada idempotente.
3. O worker atualiza status de dispositivo/ambiente e o referenceTime da plataforma.
4. A API aplica RBAC e entrega consultas de rede, ambiente e dashboard.
5. O publisher observa mudancas reais de referencia e dispara eventos realtime.
6. O frontend atualiza dados via query cache e assinatura socket por loja.
7. CI valida build e testes para manter confiabilidade de entrega.

## Fronteiras de responsabilidade

- Worker: ingestao e enriquecimento de telemetria.
- API: regras de acesso, agregacao e contrato HTTP/WebSocket.
- Frontend: experiencia de uso, estado de tela e visualizacao.
- Banco: persistencia de cadastro, cru, tratado e referencia temporal.

## Decisoes e trade-offs

- Banco unico PostgreSQL na entrega inicial: reduz complexidade operacional e acelera implementacao.
- Separacao logica de cru e tratado no schema: prepara evolucao para armazenamento especializado.
- Realtime por mudanca real + rooms por loja: minimiza invalidacoes e trafego desnecessario.
- Agregacao temporal no backend: melhora custo de render e resposta para periodos longos.

## Evolucao para escala de producao

1. Manter cadastro relacional no PostgreSQL.
2. Mover dado cru para object storage em formato colunar (lakehouse).
3. Mover serie tratada para engine temporal dedicada ou Postgres particionado.
4. Criar agregados materializados para dashboard de baixa latencia.
5. Introduzir fila e multiplos workers para paralelizar ingestao com controle de backpressure.
