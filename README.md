# Prophet (prophet_eyes)

Dashboard web de análise técnica e alertas para a B3. Veja [docs/arquitetura.md](docs/arquitetura.md).

## Rodar
```bash
cp .env.example .env     # preencha SESSION_SECRET, POSTGRES_PASSWORD, BRAPI_TOKEN, TELEGRAM_BOT_TOKEN
docker compose up -d --build
```
Acesse `https://$DOMAIN` (ou `https://localhost` em teste), crie a conta e depois defina `ALLOW_REGISTRATION=false`.

## Desenvolvimento
```bash
cd web && npm install && npm test && npx tsc --noEmit
```

## CI e imagens Docker
O workflow `.github/workflows/ci.yml` roda typecheck, testes e build do Next, e builda a imagem Docker em PRs e na `main`. Na `main` ele publica `ghcr.io/<dono>/prophet-web` (tags `latest` e `sha-…`). `web` e `worker` usam a mesma imagem.

Na VPS, em vez de buildar: `docker compose pull web worker && docker compose up -d`. Se o pacote for privado, faça antes `docker login ghcr.io` com um token com `read:packages`.
