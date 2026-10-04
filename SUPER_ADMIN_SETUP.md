# SUPER_ADMIN — teste inicial

Na entrega corrigida, a conta da plataforma já foi criada e validada. Consulte `LEIA-ME_ENTREGA.md`. A sequência abaixo se aplica somente a uma instalação nova, após `pnpm db:migrate` ou a recuperação aprovada do schema.

1. Configure `DATABASE_URL`.
2. Execute `pnpm admin:create`.
3. Informe e-mail, nome e senha com a política de segurança.
4. Abra `/acesso` e entre com e-mail + senha.
5. O login deve retornar `SUPER_ADMIN` porque `users.isPlatformAdmin = true`.
6. A página inicial deve redirecionar para `/admin`.

Para execução sem prompt, use `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` e `SUPER_ADMIN_PASSWORD`.

Para trocar o e-mail sem substituir a conta, use `pnpm admin:email`. Para trocar a senha pelo navegador, use **Trocar minha senha** no menu. O e-mail do administrador da plataforma deve ser diferente do e-mail do administrador paroquial.

O SUPER_ADMIN não precisa de `parish_members` nem de `parishId`; o procedimento `platformAdminProcedure` permite acesso global.
