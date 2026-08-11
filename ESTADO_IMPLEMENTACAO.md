# Estado da implementação — ESCALA SERVIDORES 2.0

Documento de continuidade. Atualizar ao concluir cada módulo.

## Especificação consolidada

A especificação unificada derivada dos 21 documentos está em `/home/ubuntu/ESPEC_UNIFICADA.md`
(fora do projeto). Os relatórios individuais de cada documento estão em
`/home/ubuntu/spec_reports/`. Os documentos originais estão em
`/home/ubuntu/upload/SERVIDORES DO ALTAR/`.

## Decisões estruturais fixadas

| Tema | Decisão |
|---|---|
| Banco | MySQL/TiDB (provisionado pela plataforma). Datas de calendário usam `date(..., { mode: "string" })` para evitar drift de fuso |
| Isolamento | `parishId` SEMPRE derivado da sessão no servidor; nunca aceito do cliente |
| Idade | Nunca persistida; derivada de `birthDate` via `calculateAge` |
| Exclusão | Sempre lógica (`status = INACTIVE`) |
| Segredos | PIN e senha em scrypt (`scrypt$N$r$p$salt$hash`); tokens em SHA-256 |
| Bloqueio de PIN | Temporal via `lockedUntil`; status permanece `ACTIVE` |
| Bloqueio administrativo | `status = BLOCKED` sem `lockedUntil`; exige reversão manual |
| Ativação / reset de PIN | Código de uso único (`access_activation_codes`), entregue fora da aplicação |
| Mensagens de login | Únicas para todos os estados, para impedir enumeração de contas |
| Append-only | `confirmations`, `point_transactions`, `audit_logs` nunca sofrem UPDATE/DELETE |
| Gamificação | `penaltiesEnabled = false` e `minorsRankingEnabled = false` no provisionamento |
| IA | Nunca publica escala; toda proposta exige aprovação do coordenador |

## Arquivos-chave do backend

| Caminho | Responsabilidade |
|---|---|
| `shared/domain.ts` | Enums, rótulos em português, parâmetros de segurança e utilitários de data/hora |
| `drizzle/schema.ts` | 43 tabelas com FKs, índices e unicidade |
| `server/auth/crypto.ts` | Hash de senha/PIN, tokens, IDs de acesso, força de PIN |
| `server/auth/types.ts` | `UserActor`, `ServerActor`, identidade auditável |
| `server/auth/service.ts` | Login duplo, sessões, revogação, resolução de papel |
| `server/trpc.ts` | Procedures com RBAC: `coordinatorProcedure`, `parishAdminProcedure`, `platformAdminProcedure`, `responsibleProcedure`, `serverProcedure` |
| `server/services/audit.ts` | Auditoria append-only com higienização de segredos |
| `server/services/accessCodes.ts` | Emissão de códigos de uso único |
| `server/services/passwordDelivery.ts` | Entrega do token de recuperação com canal registrado |
| `server/services/notifications.ts` | Notificações resilientes a falha |
| `server/services/availability.ts` | Fonte única de verdade da disponibilidade (usada por escala manual e IA) |
| `server/routers/auth.ts` | Login, logout, sessão, troca de senha/PIN, ativação |
| `server/routers/parishes.ts` | Paróquias, settings, membros |
| `server/routers/people.ts` | Responsáveis, servidores, vínculos, credenciais |
| `server/routers/availability.ts` | Funções, habilitações, formações, disponibilidade, férias, preferências |
| `server/services/scheduleValidation.ts` | Fonte única de verdade das restrições de escala |
| `server/routers/schedules.ts` | Celebrações, escalas, fluxo de status, versionamento |
| `server/routers/confirmations.ts` | Confirmações, conflitos, substituições, presença |
| `server/routers/events.ts` | Eventos, tarefas, turnos, voluntariado |
| `server/services/gamification.ts` | Transações idempotentes, saldo derivado, conquistas |
| `server/routers/gamification.ts` | Pontos, conquistas, ranking, configurações |
| `server/services/aiScheduler.ts` | Geração de proposta de escala revalidada |
| `server/routers/ai.ts` | Geração, revisão, aplicação e descarte de propostas |
| `server/routers/notifications.ts` | Central de notificações in-app |
| `server/routers/reports.ts` | Relatórios operacionais e trilha de auditoria |

## Invariantes que não podem ser quebradas

1. **Validação única de escala.** `scheduleValidation.ts` é a única fonte de
   verdade das restrições. Montagem manual e IA usam o mesmo serviço — por isso a
   IA não consegue propor algo que a validação manual rejeitaria.
2. **A IA nunca publica.** `ai.generate` grava em `ai_schedule_proposals`.
   `ai.applyProposal` cria alocações apenas em escalas `DRAFT` ou `PROPOSED`;
   publicar continua sendo ação humana separada. A procedure chama-se
   `applyProposal` porque `apply` é palavra reservada no tRPC.
3. **Confirmação append-only com conflito explícito.** Resposta do responsável
   divergente da do servidor não sobrescreve: abre conflito e mantém a alocação
   pendente para decisão da coordenação.
4. **Saldo de pontos sempre derivado.** Não existe coluna de saldo; o total é a
   soma das transações. Correção é transação de reversão, nunca edição.
5. **Versionamento de escala publicada.** Alterar alocações ou data/horário de
   celebração com escala publicada incrementa `version` e reavisa os envolvidos,
   incluindo responsáveis de menores.
6. **Notificação nunca invalida a operação.** Todo envio é try/catch isolado.
7. **Auditoria somente leitura.** `reports.auditTrail` apenas consulta; não
   existe endpoint de edição ou exclusão de log.

## Hierarquia de disponibilidade implementada

1. Férias — restrição rígida, dia inteiro
2. Exceção pontual na data — sobrepõe a recorrência
3. Disponibilidade `FAMILY` — restrição logística obrigatória
4. Disponibilidade `SERVER` — recorrência semanal
5. Preferências — apenas pontuam, nunca bloqueiam

Semântica da recorrência: se existe qualquer janela `AVAILABLE` para o dia da
semana, só os horários contidos nela são permitidos; se não existe nenhuma
declaração para o dia, considera-se disponível (evita travar paróquias que ainda
não preencheram a agenda).

## Progresso por fase

- [x] Fase 1 — Schema e migrations
- [x] Fase 2 — Autenticação dupla, sessões, RBAC, multi-tenancy
- [x] Fase 3 — Cadastros pastorais
- [x] Fase 4 — Funções, formações, disponibilidade, férias, preferências
- [x] Fase 5 — Celebrações, escalas, confirmações, substituições, presença
- [x] Fase 6 — Eventos, turnos, voluntariado, gamificação
- [x] Fase 7 — IA, notificações, relatórios, auditoria
- [ ] Fase 8 — Frontend completo
- [ ] Fase 9 — Testes, typecheck, build
- [ ] Fase 10 — Entrega
