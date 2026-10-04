# Publicação GitHub e Vercel

Versão preparada no repositório local `escala-publicacao`, branch `main`.
Backup do histórico anterior: `backups/github-antes-publicacao.bundle`.

Validação local: 180 testes aprovados, verificação TypeScript e build:vercel aprovados. A execução real na Vercel ainda precisa ser validada após a publicação.

1. Liberar acesso de escrita ao repositório profpatiramos/escala-servidores-2.0 na conexão GitHub e enviar os commits locais.
2. Confirmar e reconectar a Vercel à equipe patricia-ramos-projects.
3. Importar o repositório como projeto escala-servidores-2-0, framework Express, Node 22. O arquivo vercel.json define instalação e compilação.
4. Configurar DATABASE_URL e JWT_SECRET como variáveis protegidas na Vercel, usando os valores locais sem colocá-los no GitHub. Conferir as demais integrações utilizadas em .env.example.
5. Publicar e validar /healthz, /login, sessão SUPER_ADMIN e /admin pela URL HTTPS.

Não executar db:repair, reset ou sincronização automática durante o build. O banco Neon existente já foi recuperado; a hospedagem deve usar esse banco sem recriar dados.

Arquivos privados, backups, credenciais, auditorias com dados reais e .env estão excluídos do envio.
