# Prophet — arquitetura e plano

## Objetivo
Aplicação web própria para a B3: escolher um ativo, ver candles em vários timeframes, aplicar indicadores, receber sugestão de quais indicadores têm dado melhores sinais no ativo, ter abas (perfis) por usuário e receber alertas por Telegram. Sem feed de fluxo (book/times and trades) por enquanto — fica para uma fase futura com Profit.

## Visão geral

```
Navegador ──HTTPS──> Caddy ──> web (Next.js: UI + API)  ──> Postgres/TimescaleDB
                                   │                              ▲
                                   └─> brapi.dev (candles)        │
                      quotes (Python + yfinance) <── web (preço real)
                      worker (Node, mesma imagem) ────────────────┘
                         ├─> brapi.dev (candles) / BCB SGS (macro, fase 2)
                         └─> Telegram Bot API
```

Um repositório, serviços de aplicação no Docker Compose (`web`, `worker`, `quotes`, `db`) mais `caddy` como proxy com HTTPS automático. `web` e `worker` usam a mesma imagem e o mesmo código de indicadores (`web/src/lib`), evitando duplicar cálculo.

## Decisões
- **Next.js + Lightweight Charts**: UI e API no mesmo projeto; gráfico de candles leve, com painéis para RSI/MACD.
- **Indicadores em TypeScript** (`lib/indicators.ts`): SMA, EMA, Bollinger, RSI, MACD, ATR, com testes. Cada indicador também define seus *sinais* (+1/-1), usados pelo sugeridor.
- **Worker em Node** (e não Python) para reaproveitar o mesmo código dos indicadores. Se a fase de análise estatística crescer, um serviço Python separado pode ser adicionado.
- **Auth própria simples**: e-mail + senha (bcrypt), sessão em cookie JWT httpOnly de 7 dias, middleware bloqueia tudo sem login. Cadastro controlado por `ALLOW_REGISTRATION` (desligue depois de criar as contas).
- **Perfis = abas**: tabela `profiles` por usuário (ativo, timeframe, indicadores escolhidos), editadas direto na UI.
- **Alertas**: tabela `alerts` por usuário + `telegram_chat_id`; o worker avalia a cada 60 s e envia pelo bot, com intervalo mínimo de 1 h entre disparos do mesmo alerta.
- **Sugestão de indicadores**: ranking empírico por ativo/timeframe — retorno 5 candles após cada sinal, taxa de acerto e penalidade para amostras pequenas. Descreve o passado; não é recomendação de investimento.
- **Dados**: brapi.dev para candles (limite de range por intervalo intradiário). BCB SGS (Selic, câmbio, IPCA) na fase 2. Tabela `candles` (hypertable do TimescaleDB) já criada para cache/histórico, ainda sem uso.

## Segurança e operação
- Nenhum segredo no repositório: tudo por variáveis de ambiente (`.env.example`).
- Só o Caddy expõe portas (80/443); banco e app ficam na rede interna do Compose.
- Deploy manual na VPS: `cp .env.example .env`, preencher, `docker compose up -d --build`. Nada neste repositório faz deploy sozinho.

## Plano
1. **Esqueleto (este PR)**: compose + Caddy, login, abas, candles via brapi em 7 timeframes, 6 indicadores, sugestão, alertas de preço/RSI no Telegram.
2. **Dados**: cache de candles no Timescale com atualização pelo worker; busca/autocomplete de tickers; séries do BCB.
3. **Mais indicadores**: ATR, ADX, Estocástico, OBV, VWAP, Fibonacci, padrões de candle; parâmetros editáveis.
4. **Alertas por sinal**: cruzamento de médias, MACD, rompimentos; vários alertas por aba.
5. **Sugestor melhor**: validação out-of-sample (walk-forward), custos, múltiplos horizontes.
6. **Fluxo (futuro)**: integração com Profit para book e times and trades.

## Limitações conhecidas do esqueleto
- Indicadores recalculados no navegador a cada troca; candles não são cacheados.
- Sem rate limit no login nem recuperação de senha.
- O ticker é validado só por formato; erro da brapi aparece como mensagem no gráfico.

## Atualizações (rodada 2)
- **Cache de candles**: `lib/candles.ts` guarda candles no Postgres (`candles`, hypertable quando há TimescaleDB) e a data da última sincronização (`candle_sync`). Cache fresco (60 s intradiário, 5 min demais) não chama a brapi; cache velho busca só o menor `range` que cobre desde o último candle guardado (`lib/ranges.ts`). Se a brapi falhar, serve o cache. As tabelas novas são criadas por `lib/schema.ts` na primeira chamada, então bancos já existentes não precisam ser recriados.
- **Preço real**: serviço `quotes` (Python + yfinance, sufixo `.SA`) sem porta publicada; o web consulta via `/api/quote` a cada 15 s quando o botão "Preço real" está ligado (preferência no navegador). O preço só altera o último candle na tela, não o cache nem os indicadores. O Yahoo não é fonte oficial da B3 e pode ter atraso e limites de uso.
- **Autocomplete**: `/api/assets` busca por código ou nome da empresa na tabela `assets` (semeada com ~40 papéis e ampliada com a busca `quote/list` da brapi).
- **Aba = papel**: o nome da aba é sempre o código do ativo selecionado.
- **Barra lateral de ferramentas**: `components/tools/registry.tsx` é o registro; cada item (id, título, ícone, painel) vira um ícone na barra direita que abre um painel deslizante. Primeira ferramenta: notificações do Telegram (chat_id e alertas). Para adicionar outra, crie o painel e inclua um item no registro.
