# Escala Servidores 2.0 — entrega corrigida

Use Node.js 22 ou superior e pnpm 10.4.1. O pacote contém código, migrations, build de produção e evidências de validação. Credenciais, dependências e backups do banco ficam fora do ZIP.

## Rodar no computador

1. Extraia o pacote e entre na pasta do projeto.
2. Execute `pnpm install --frozen-lockfile`.
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET` localmente. Para usar o Neon já recuperado, mantenha a mesma conexão do projeto original; use `sslmode=verify-full`.
4. Execute `pnpm db:migrate`, `pnpm build` e `pnpm start`.
5. Abra `http://localhost:3000/acesso`. O SUPER_ADMIN entra em `/admin`.

Nesta cópia de trabalho o `.env` já está configurado e o banco Neon já foi recuperado. A conta SUPER_ADMIN já existe; seu acesso inicial está no arquivo privado entregue separadamente. Para trocar a senha, use o menu **Trocar minha senha**. Não crie a conta outra vez.

## Cadastrar a primeira paróquia

Em `/admin`, clique em **Nova paróquia**, informe os dados e o administrador paroquial. Depois libere a paróquia. O administrador paroquial entra em `/acesso`, troca a senha inicial e passa a gerir os servidores e as escalas. O SUPER_ADMIN administra a plataforma; ele não é o administrador paroquial. Cada conta precisa de um e-mail distinto.

## Publicar

Em um serviço de hospedagem com Node.js e HTTPS, configure `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production` e a porta fornecida pelo serviço. Instalação: `pnpm install --frozen-lockfile`. Build: `pnpm build`. Inicialização: `pnpm start`. Execute `pnpm db:migrate` uma vez por atualização, sem iniciar migrations em paralelo. O deploy público ainda não foi realizado.

OAuth Manus, envio de e-mail, armazenamento externo e recursos que dependam dessas integrações exigem suas configurações próprias. O login por e-mail/senha e ID/PIN não precisa de OAuth.

## Banco e manutenção

- `pnpm db:audit`: confere schema, enums, defaults, índices e chaves contra a migration inicial.
- `pnpm db:backup`: cria um backup completo com `pg_dump` antes de manutenção.
- `pnpm db:repair`: recuperação da instalação inicial parcial; exige backup bem-sucedido, valida estrutura e valores e aplica tudo em transação. Não use após migrations futuras sem revisar a rotina.
- `pnpm db:generate` e `pnpm db:migrate`: fluxo normal para futuras mudanças versionadas e revisadas. Nunca aplique migrations MySQL ao Neon.
- `pnpm admin:create`: criar SUPER_ADMIN em uma instalação nova. Só use `--update` se pretende promover uma conta existente e substituir sua senha.
- `pnpm admin:email`: alterar o e-mail do SUPER_ADMIN mantendo seu ID e permissões; faz backup e encerra as sessões antigas.
- `pnpm test` e `pnpm check`: testes e conferência de tipos.

`pg_dump`/`pg_restore` são necessários para backup/restauração, mas não para iniciar a aplicação. Em Windows, a rotina assume PostgreSQL 18; defina `PG_DUMP` se estiver em outro caminho. Nunca faça reset ou drop de um banco existente. Guarde os backups em local privado; restaure primeiro em um banco separado antes de substituir dados de produção.
