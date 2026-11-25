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
