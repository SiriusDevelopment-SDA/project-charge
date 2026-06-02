# Migrations (TypeORM)

O app usa `synchronize: true` apenas em dev (`NODE_ENV !== 'production'`). Em
**producao** `synchronize` e `false`, entao mudancas de schema sao aplicadas
exclusivamente via migrations.

## DataSource da CLI

`src/database/data-source.ts` e o `DataSource` usado pela CLI do TypeORM. Ele
roda fora do contexto Nest, entao carrega o `.env` via `dotenv/config` e le as
MESMAS variaveis do `database.config.ts`: `DB_HOST`, `DB_PORT`, `DB_USER_NAME`,
`DB_PASSWORD`, `DB_DATABASE`. A lista de `entities` e identica a do app e
`synchronize` e sempre `false`.

## Scripts (rodar a partir de `backend/`)

```bash
npm run migration:show      # read-only: lista migrations aplicadas/pendentes
npm run migration:run       # aplica as migrations pendentes
npm run migration:revert    # reverte a ultima migration aplicada
npm run migration:generate src/database/migrations/<Nome>   # gera diff
npm run migration:create    src/database/migrations/<Nome>  # cria vazia
```

## Deploy em producao

1. Aponte as envs `DB_*` para o banco de producao.
2. Rode **`npm run migration:run` ANTES** de subir o codigo novo.
   - Ex.: `AddNotificameChannelsArray` converte
     `company.canalId_notificameHub` de `varchar` para `jsonb`. O codigo da
     feature multi-canal depende desse schema.
3. So entao faca o deploy da aplicacao.

A tabela de controle e `migrations` (criada automaticamente no primeiro run).
