# Prophet (prophet_eyes)

Dashboard web de análise técnica e alertas para a B3. Veja [docs/arquitetura.md](docs/arquitetura.md).

## Rodar
```bash
cp .env.example .env     # preencha SESSION_SECRET, POSTGRES_PASSWORD, BRAPI_TOKEN, TELEGRAM_BOT_TOKEN (e CREDENTIALS_KEY se for operar na Binance)
docker compose up -d --build
```
Acesse `https://$DOMAIN` (ou `https://localhost` em teste).

### Primeiro acesso
**Não existe usuário nem senha padrão.** Na tela de login, digite um e-mail e uma senha (mínimo 8 caracteres) e clique em **Criar conta**; você já entra logado. Isso só funciona com `ALLOW_REGISTRATION=true` no `.env` (o `.env.example` já vem assim; se o valor for omitido, o padrão é `false` e o cadastro retorna "Cadastro desativado"). Depois de criar sua conta, defina `ALLOW_REGISTRATION=false` e rode `docker compose up -d` para fechar o cadastro.

## Desenvolvimento
```bash
cd web && npm install && npm test && npx tsc --noEmit
```

## CI e imagens Docker
O workflow `.github/workflows/ci.yml` roda typecheck, testes e build do Next, e builda a imagem Docker em PRs e na `main`. Na `main` ele publica `ghcr.io/<dono>/prophet-web` (tags `latest` e `sha-…`). `web` e `worker` usam a mesma imagem.

Na VPS, em vez de buildar, use o override com as imagens publicadas:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
```
Se o pacote for privado, faça antes `docker login ghcr.io` com um token com `read:packages`.

## Atualizar uma instalação local
```bash
git pull origin main          # sem isso o código local continua o antigo
docker compose up -d --build  # reconstrói web, worker e quotes
```
No navegador, faça um recarregamento forçado (Ctrl+Shift+R). Para conferir o que está rodando: `docker compose images` (data de criação) e `git log -1`.

## Backup e restauração
O serviço `backup` grava uma cópia do banco por dia em `./backups` (14 mais recentes; ajuste com `BACKUP_KEEP`).

```bash
docker compose exec backup bash /backup.sh now                  # cópia na hora
deploy/restore.sh backups/prophet-AAAAMMDD-HHMMSS.dump          # SUBSTITUI o banco atual (pede confirmação)
```

- As cópias ficam **no mesmo disco** do banco. Copie a pasta `backups/` para outro lugar de tempos em tempos.
- O `.env` não entra no backup. Guarde-o à parte: sem a `CREDENTIALS_KEY`, as chaves da Binance salvas no banco não podem ser lidas.
- Restaure com a mesma versão do TimescaleDB que gerou a cópia.
