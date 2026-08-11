# Mapa de procedures tRPC — referência para o frontend

Gerado a partir do código dos routers. Serve para escrever telas sem reabrir cada arquivo.

## access (autenticação própria)

| Procedure | Input |
|---|---|
| `session` | — (retorna `actorType, role, parishId, parishName, displayName, serverId, userId, responsibleId, email, mustChangePassword, pinResetRequested`) |
| `loginWithPassword` | `{ email, password }` |
| `loginWithAccessId` | `{ accessId, pin }` |
| `logout` | — |
| `changePassword` | senha atual + nova |
| `requestPasswordReset` | `{ email }` |
| `confirmPasswordReset` | token + nova senha |
| `activateServerAccess` | `{ accessId, activationCode, newPin }` |
| `changePin` | PIN atual + novo |
| `resetDependentPin` | `{ serverId }` (responsável) |

## parishes

`list`, `create`, `setStatus` (SUPER_ADMIN) · `current`, `update`, `updateSettings`, `members`, `addMember`, `removeMember` (PARISH_ADMIN)

## people

- `responsibles.list { search?, includeInactive }`, `responsibles.create`, `responsibles.update`
- `servers.list { search?, status?, roleId?, includeInactive }`, `servers.get { id }`, `servers.create`, `servers.update`, `servers.setStatus { id, status, reason? }`
- `familyLinks.create { responsibleId, serverId, relationshipType, isPrimary }`, `familyLinks.end { linkId }`
- `access.create { serverId }`, `access.issuePinResetCode { serverId }`, `access.setBlocked { serverId, blocked }`
- `myDependents` (responsável)

## availability

- `roles.list`, `roles.create`, `roles.update`
- `qualifications.set`, `qualifications.remove`, `qualifications.listByServer`
- `formations.listByServer`, `formations.create`, `formations.update`, `formations.list`
- `recurring.list`, `recurring.create`, `recurring.remove`
- `exceptions.list`, `exceptions.create`, `exceptions.remove`
- `vacations.list`, `vacations.create`, `vacations.remove`, `vacations.listByServer`
- `preferences.listByServer`, `preferences.replace`

## schedules

- `celebrations.list { from, to, status? }` → inclui `scheduleId` e `scheduleStatus`
- `celebrations.create`, `celebrations.update`, `celebrations.setNeeds`, `celebrations.cancel`
- `get { celebrationId }`, `eligibleServers`, `setAssignments`, `validate { celebrationId }`
- `setStatus { celebrationId, status, notes? }`

## confirmations

- `respond { assignmentId, status, reason? }`, `history { assignmentId }`, `pending`
- `conflicts.list { onlyOpen }`, `conflicts.resolve { conflictId, finalStatus, resolution }`
- `substitutions.request { assignmentId, reason, suggestedServerId? }`, `substitutions.list { onlyPending }`, `substitutions.approve { requestId, replacementServerId, reviewNotes? }`, `substitutions.reject { requestId, reviewNotes }`
- `attendance.forCelebration { celebrationId }`, `attendance.record { celebrationId, records[] }`

## events

`list`, `get`, `create`, `update`, `publish`, `cancel`, `closeRegistrations`, `archive` · `participation.respond` · `tasks.create/update` · `shifts.create/update` · `volunteering.express/withdraw/interests`

## gamification

`balance { serverId }`, `adjust`, `reverse`, `ranking { periodStart?, periodEnd?, limit }`, `balances` · `settings.get/update` · `rules.list/update` · `achievements.list/grant`

## ai

`generate { periodStart, periodEnd, priorityMode, pinnedAssignments?, blockedServerIds? }`, `listRuns`, `getRun { runId }`, `applyProposal { runId, acceptedProposalIds? }`, `discard { runId, reason? }`

> `applyProposal` e não `apply`: `apply` é palavra reservada no tRPC.

## notifications

`list { onlyUnread, limit }`, `unreadCount`, `markRead { id }`, `markAllRead`

## reports

`schedulesByPeriod`, `participation`, `confirmations`, `absences`, `serversByRole`, `substitutions`, `auditTrail`, `registerExport` — todos com `{ periodStart, periodEnd }` exceto `serversByRole`.

## Assinaturas verificadas durante a construção do frontend

Registro das divergências entre o nome "óbvio" e o nome real, para não repetir erro:

| Chamada | Detalhe importante |
|---|---|
| `people.myDependents` | Está na raiz de `people`, não em `people.responsibles`. Retorna `id` (não `serverId`) e `name`. |
| `people.access.issuePinResetCode` | Retorna `{ accessId, serverName, code, expiresAt }` — o campo é `code`. |
| `people.servers.list` | Status válidos: `IN_FORMATION`, `ACTIVE`, `INACTIVE`. Não existe `ON_LEAVE`. |
| `schedules.setAssignments` | Retorna `{ saved: boolean, validation: ValidationResult, version? }`. Quando `saved:false`, nada foi gravado. |
| `schedules.celebrations.create` | `endTime` é **obrigatório** (usado na detecção de sobreposição). Tipos: `SUNDAY_MASS`, `WEEKDAY_MASS`, `SOLEMNITY`, `PROCESSION`, `WEDDING`, `FUNERAL`, `ADORATION`, `OTHER`. |
| `availability.preferences.listByServer` | Preferência é `{ weekday, period: MORNING/AFTERNOON/EVENING, parishRoleId, priority }` — não tem intervalo de horas. |
| `ai.applyProposal` | Nome não é `apply` (palavra reservada no tRPC). Input: `{ runId, acceptedProposalIds? }`. |
| `ai.getRun` | Retorna `{ run, items, conflicts }`; item tem `isUnfilled` e `conflictReason`. |
| `events.create` | Campos são `title`/`type` no input, mapeados para `name`/`eventType` no banco. `startAt`/`endAt` são `Date`. |
| `gamification.ranking` | Retorna `{ entries: [{ serverId, name, points, isMinor }], ... }`. Respeita `rankingEnabled` e ranking de menores desabilitado. |
| `reports.*` | Todas usam `periodInput` (`{ from, to }` no padrão `YYYY-MM-DD`). |

## Estado do frontend

Páginas criadas: `Login`, `ActivateAccess`, `Dashboard`, `MySchedule`, `Celebrations`,
`CelebrationDetail`, `Servers`, `Availability`, `AiAssistant`, `Notifications`.
Pendentes: `Events`, `Gamification`, `Reports`, e o wiring final em `App.tsx`.
