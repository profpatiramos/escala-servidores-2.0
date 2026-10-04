# Auditoria e correção — Escala Servidores 2.0

Data: 4 de outubro de 2026. Base utilizada: `escala-servidores-2.0-SUPERADMIN-PRONTO/escala-servidores-2.0`. A pasta `escala-servidores-2.0 copy` apresentava o mesmo hash de `drizzle/schema.ts`. A pasta original foi preservada; as correções foram feitas em uma cópia de trabalho.

Conta definitiva SUPER_ADMIN: `patidigibusiness@gmail.com`. O e-mail `servidorespspa.foz@gmail.com` foi liberado para o futuro administrador da Paróquia São Paulo Apóstolo. A alteração preservou o ID e as permissões da conta, manteve a senha e revogou as sessões antigas. Foi criado um novo backup antes dessa alteração.

## Diagnóstico confirmado

O schema construía enums com `enumCol`/`enumTypeName`, calculando nomes com hash dos valores. Além disso, os enums não eram exportados como entidades do schema para o Drizzle Kit. Não havia migrations PostgreSQL versionadas; as migrations históricas eram MySQL. Isso permitia que o SQL tentasse criar tabelas referenciando tipos que não haviam sido criados.

A inspeção de leitura do Neon encontrou uma instalação parcial: uma tabela `public.access_activation_codes` e um enum `access_code_purpose`. Usuários, sessões, paróquias e os demais módulos ainda não existiam. O journal Drizzle existia, sem uma migration aplicada correspondente ao schema completo. A conexão estava disponível; não era um problema de permissão SUPER_ADMIN. O `.env` tinha `sslmode=req`; a versão entregue normaliza a conexão Neon para `verify-full`, verificando TLS sem imprimir credenciais.

## Correções

- 44 enums explícitos, exportados e com nomes estáveis; nenhum nome depende mais dos valores ou de um hash.
- Migration inicial PostgreSQL completa, snapshot e journal para 41 tabelas. As migrations MySQL continuam arquivadas, fora do fluxo PostgreSQL.
- Recuperação programática da instalação parcial com backup obrigatório, transação, limites de espera e bloqueio contra execução concorrente. A tabela existente foi preservada; foram criadas as tabelas, enums, índices e chaves faltantes. Nenhuma tabela ou dado foi apagado; nenhum reset/drop de banco foi executado.
- Para enums legados, a rotina confere todos os valores armazenados antes de converter as colunas via texto para o enum estável. Tipos antigos são preservados. Estruturas ou históricos incompatíveis interrompem a transação, sem remendos manuais tipo a tipo.
- SUPER_ADMIN resolvido exclusivamente por `users.isPlatformAdmin=true`, independente do papel legado `users.role`. Criação/atualização explícita pelo CLI, validação do e-mail, prompt de senha oculto e encerramento da conexão ao concluir.
- Login aguarda a sessão antes de navegar e envia SUPER_ADMIN a `/admin`. Rotas e formulário de troca de senha/PIN foram implementados, pois o login já direcionava a elas e não existiam. O cookie usa `SameSite=Lax` em HTTP local e conserva `Secure` em HTTPS.
- Conta inativa não obtém escopo administrativo, inclusive no caminho OAuth. O endpoint legado `auth.me` não retorna `passwordHash`.
- Criação da paróquia, defaults, administrador e vínculo paroquial dentro de uma única transação. Falha em qualquer etapa reverte o provisionamento.
- Cálculo de idade preserva os componentes de datas de nascimento em texto, evitando deslocamento para o dia anterior no fuso brasileiro.
- Comandos de início/desenvolvimento funcionam em Windows e Linux. O runtime opcional Manus não é inserido no build independente sem habilitação explícita. As integrações e os módulos existentes foram mantidos.

## Validação e evidências

- Backup do código original e backup completo do Neon antes da recuperação. O dump inicial foi restaurado com `pg_restore --no-owner --no-acl --exit-on-error` em um PostgreSQL local isolado.
- Recuperação validada sobre o banco restaurado antes de ser aplicada no Neon.
- Instalação das migrations em outro banco local novo também concluída: 41 tabelas, 44 enums e nenhuma diferença de estrutura.
- `pnpm test`: 180 testes aprovados em 12 arquivos. Cobertura inclui criptografia, papéis, isolamento entre paróquias, autorização horizontal, disponibilidade, validação de escalas, auditoria e defaults de gamificação.
- `pnpm check` e `pnpm build`: aprovados. O build mantém um aviso de tamanho do bundle, sem erro.
- Integração real no banco local: CLI de criação do SUPER_ADMIN, senha incorreta recusada, login, sessão/contexto, listagem administrativa, criação/liberação de paróquia, administrador paroquial, bloqueio de paróquia inativa, restrição de API administrativa, troca de senha, logout/revogação, rollback de provisionamento, conversão de enum legado com dados existentes e recuperação idempotente.
- Neon após recuperação: 41 tabelas e 44 enums. Conferência de todas as colunas, tipos, defaults, identidades, índices declarados, chaves primárias e estrangeiras sem diferenças contra a migration inicial. `pnpm db:migrate` concluiu; `pnpm db:generate` informou que não há mudanças de schema.
- Navegador com build de produção ligado ao Neon: login confirmado, `/admin` aberta e sessão preservada após recarregar a página. Evidência: `audit/admin-validado.png`.

Os JSONs em `audit/` registram estrutura e resultados, sem senhas, tokens ou linhas de dados pessoais. Os backups e o acesso inicial ficam separados do pacote público.

## Limites práticos

O cadastro de paróquia/admin foi testado no banco local, sem inserir uma paróquia fictícia no Neon. A validação feita não é uma certificação exaustiva de todos os fluxos ou uma auditoria formal de segurança. OAuth externo, entrega real de e-mail e armazenamento/serviços externos não foram validados por falta de suas configurações. O deploy público ainda precisa ser executado no serviço escolhido.

A rotina `db:repair` é voltada à recuperação da instalação inicial. Após evoluir o projeto com novas migrations, use o fluxo normal versionado; o recuperador recusa journal desconhecido. `db:audit` compara com o snapshot inicial e deve ser atualizado junto com futuras evoluções de schema.

As permissões de sessão e de paróquia existentes foram preservadas; as funcionalidades de escalas, confirmações, servidores, responsáveis, formação, disponibilidade, eventos, notificações, relatórios, gamificação e assistente continuam no projeto.

Referências técnicas consultadas: [declaração e exportação do schema Drizzle](https://orm.drizzle.team/docs/sql-schema-declaration), [migrations Drizzle](https://orm.drizzle.team/docs/migrations), [conversões de tipo PostgreSQL](https://www.postgresql.org/docs/18/sql-altertable.html).
