# Dependências

A conversão para PostgreSQL removeu `mysql2` e adicionou `pg`.

O lockfile anterior foi removido porque descrevia a árvore MySQL/TiDB e não seria seguro mantê-lo como se estivesse válido.

Na primeira instalação desta versão, execute:

```bash
corepack enable
pnpm install
```

Isso recriará `pnpm-lock.yaml` com a árvore PostgreSQL atual.
