# Auditoria de isolamento multi-tenant

Objetivo: garantir que nenhuma consulta possa retornar dados de uma paróquia
diferente da paróquia da sessão. A regra base do projeto é que o `parishId`
**nunca** vem do cliente: ele é sempre derivado da sessão em `server/trpc.ts`.

## Método

Varredura automatizada de todos os pontos de leitura (`.from(...)`) do backend,
classificando cada bloco de consulta pela presença de filtro por `parishId`.
Cada ponto marcado como "revisar" foi então inspecionado manualmente.

| Camada | Pontos de consulta | Com filtro direto | Revisados manualmente |
|---|---|---|---|
| `server/routers/*.ts` | 63 | 59 | 4 |
| `server/services/*.ts` + `server/db.ts` | 39 | 35 | 4 |

## Correções aplicadas

Quatro leituras nos routers acessavam registros por chave estrangeira e
dependiam apenas do vínculo do pai para o isolamento. Receberam filtro
explícito de paróquia como defesa em profundidade:

| Arquivo | Consulta | Correção |
|---|---|---|
| `routers/ai.ts` | propostas por `runId` | filtro por `parishId` adicionado |
| `routers/ai.ts` | conflitos por `runId` | filtro por `parishId` adicionado |
| `routers/confirmations.ts` | escala por `celebrationId` | filtro por `parishId` adicionado |
| `routers/events.ts` | alocação por `shiftId` | filtro por `parishId` adicionado |

Nos serviços, quatro pontos foram corrigidos ou eliminados:

| Arquivo | Situação | Correção |
|---|---|---|
| `services/aiScheduler.ts` | consulta morta (`id = -1`) sem efeito | removida |
| `services/gamification.ts` | busca por `idempotencyKey` (3 ocorrências) | filtro por `parishId` adicionado, mesmo já estando embutido na chave |
| `services/gamification.ts` | `innerJoin` de `altarServers` no ranking | join restrito também por `parishId` |

## Pontos sem filtro por paróquia, por decisão de modelagem

Quatro leituras permanecem sem `parishId` — corretamente, porque a coluna não
existe nessas tabelas ou o escopo é anterior à resolução do tenant:

| Local | Consulta | Justificativa |
|---|---|---|
| `db.ts:98` | `users` por `openId` | `users` é global à plataforma; a paróquia é resolvida depois, via `parish_members` |
| `db.ts:104` | `users` por `id` | idem |
| `db.ts:110` | `users` por `email` | idem; usada no login, antes de existir sessão |
| `services/notifications.ts:98` | `notifications` | o filtro por `parishId` existe: está montado em `conditions` na linha anterior, fora do bloco lido pelo script |

O último caso é um falso positivo do script, que só inspeciona o encadeamento a
partir do `.from(...)`. O filtro está presente na consulta real.

## Cobertura por testes

O isolamento não depende apenas de revisão. Está coberto por:

- `rbac.procedures.test.ts` — o `parishId` da sessão prevalece sobre qualquer valor enviado pelo cliente
- `authorization.horizontal.test.ts` e `authorization.modules.test.ts` — responsável só alcança os próprios dependentes; servidor só alcança os próprios dados
- `scheduleValidation.integration.test.ts` — validação de escala restrita ao tenant
