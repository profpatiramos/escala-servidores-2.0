# Notas técnicas — ESCALA SERVIDORES 2.0

Documento de trabalho com as decisões arquiteturais e o estado da implementação.

## Fonte da especificação

A especificação consolidada dos 21 documentos originais está em
`/home/ubuntu/ESPEC_UNIFICADA.md` e os relatórios individuais em
`/home/ubuntu/spec_reports/`. O projeto foi construído do zero, sem reaproveitar
código do protótipo anterior.

## Banco de dados

O template provisiona **MySQL/TiDB**, não PostgreSQL. O schema foi escrito em
`drizzle/schema.ts` usando o dialeto MySQL do Drizzle, mantendo integralmente as
entidades, relacionamentos e restrições definidas na especificação. 41 tabelas e
43 foreign keys aplicadas via `scripts/apply-migration.mjs`.

Migrations aplicadas:
- `0001_regular_raza.sql` — criação de todas as tabelas e índices
- `0002_dear_human_cannonball.sql` — foreign keys e constraints de unicidade

## Autenticação

Dois fluxos independentes que emitem o mesmo cookie de sessão `escala_session`
(httpOnly, expiração de 14 dias, revogável):

| Fluxo | Atores | Credencial |
|---|---|---|
| E-mail e senha | PARISH_ADMIN, COORDINATOR, RESPONSIBLE | `users.email` + `users.passwordHash` |
| ID de acesso e PIN | SERVER | `server_access.accessId` + `server_access.pinHash` |
| Manus OAuth | SUPER_ADMIN (dono do projeto) | `users.openId` |

Senha e PIN usam scrypt (N=16384, r=8, p=1) com salt por registro e comparação
em tempo constante. Nenhum valor em texto puro é persistido, retornado ou logado.

## Isolamento multi-tenant

O `parishId` é sempre derivado da sessão em `server/_core/context.ts` e injetado
nas procedures por `parishProcedure`. Nenhuma procedure aceita `parishId` do
cliente para definir escopo. Toda query de dado operacional filtra por `parishId`.

## Regras invioláveis implementadas

- A IA nunca publica escala: a proposta é imutável e a aplicação exige ação humana.
- Penalização por ausência: `gamification_settings.penaltiesEnabled = false` por padrão.
- Ranking de menores: `gamification_settings.minorsRankingEnabled = false` por padrão.
- Saldo de pontos sempre derivado de `point_transactions` (append-only, idempotente).
- Confirmações são append-only em `confirmations`; nada é sobrescrito.
- Acompanhantes em eventos apenas como quantidade (`companionsCount`).
- Idade nunca persistida: derivada de `birthDate` por `calculateAge`.
- Falha de notificação nunca invalida a operação de negócio.
- Auditoria append-only com higienização de segredos antes da gravação.
