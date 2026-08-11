# ESCALA SERVIDORES 2.0 — Arquitetura Implementada

## Fonte da especificação
Especificação unificada consolidada dos 21 documentos: `/home/ubuntu/ESPEC_UNIFICADA.md`.
Relatórios detalhados por documento: `/home/ubuntu/spec_reports/`.

## Decisão sobre o banco de dados
A especificação (Documento 9 e 17) recomenda PostgreSQL. A infraestrutura gerenciada
deste projeto provisiona **TiDB Serverless (compatível com MySQL 8.0)**, acessado via
Drizzle ORM com dialeto `mysql`. Trata-se de um banco **relacional** com integridade
referencial, transações, constraints, índices e chaves estrangeiras — atendendo a todos
os requisitos estruturais exigidos pela especificação (relacionamentos, constraints,
índices, integridade referencial, multi-tenancy e escalabilidade).

A camada de dados é isolada em `server/db/` de modo que a portabilidade para PostgreSQL
seja possível sem alterar regras de negócio: nenhuma regra depende de recurso exclusivo
do MySQL/TiDB, os tipos usados possuem equivalência direta em PostgreSQL e os enums são
definidos como constantes TypeScript compartilhadas.

## Papéis
`SUPER_ADMIN` (plataforma) · `PARISH_ADMIN` · `COORDINATOR` · `RESPONSIBLE` · `SERVER`

## Cadeia de autorização (aplicada no backend em toda operação protegida)
`Identidade → Sessão → Paróquia → Papel → Vínculo com o recurso → Ação → Autorização`

O `parishId` é sempre derivado da sessão do ator no servidor. Nunca é aceito do cliente
como fonte de verdade de contexto.

## Autenticação
Contas administrativas e responsáveis: e-mail + senha (scrypt com salt por registro).
Servidores (inclui menores): `accessId` + PIN (scrypt). O PIN nunca é exibido, retornado
pela API ou registrado em logs. Bloqueio progressivo após tentativas inválidas.

## Invariantes de domínio
1. Idade é sempre derivada de `birthDate`; nunca persistida.
2. Servidor menor de 18 anos exige vínculo ativo com um responsável.
3. Confirmações e transações de pontos são append-only.
4. Saldo de pontos é sempre derivado da soma das transações.
5. A IA nunca publica escala; apenas produz proposta revisável.
6. Penalização por ausência e ranking de menores vêm desabilitados por padrão.
7. Acompanhantes de evento são registrados apenas como quantidade.
8. Entidades históricas usam inativação (soft delete), não exclusão física.
