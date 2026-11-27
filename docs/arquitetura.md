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
- **Notícias** (`lib/news/`): o worker coleta a cada 15 min o feed geral de cada mercado e o de cada papel das abas e alertas; `/api/news` também busca sob demanda quando o feed está velho. Fontes: Google Notícias (RSS), InfoMoney, Banco Central, IBGE, CoinDesk e os dados abertos da CVM (fatos relevantes e comunicados; arquivo semanal, só com a data; código da empresa em `CVM_CODES`). Tabelas `news`/`news_sync`; nada é apagado, para formar histórico. A reação do preço é medida do último candle fechado antes da notícia, em 1, 5 e 15 candles, comparada à mediana dos 100 anteriores; o painel resume por assunto (classificação por palavras-chave). Ressalvas: no intraday, reação que atravessa o fechamento é marcada como gap (sem “× o normal”); no diário ou maior, notícia publicada com o candle em andamento é marcada; ambas ficam fora do resumo (CVM, sem hora, continua nele). Não há classificação de notícia boa/ruim. Variáveis opcionais: `GOOGLE_NEWS_URL`, `CVM_URL`.
- **Sino de notícias** (`news_bells`, `/api/news/bells`): por papel, avisa fatos da CVM e/ou assuntos marcados, só do que foi coletado depois de ligar (notícias por 24 h, fatos por 10 dias). O worker agrupa uma mensagem de Telegram por papel (até 5 títulos; títulos repetidos contam uma vez) usando `signal_sent` para não repetir; o navegador consulta `/api/news/alerts` a cada minuto.
- **Recálculo por candle novo**: o front agenda para o fechamento do último candle (`lib/next-candle.ts`, `useNewCandle`), ou reage ao candle novo do websocket; quando ele aparece, busca os candles e refaz ranking e gatilhos, mantendo o zoom. Se o candle não veio (mercado fechado), tenta de novo a cada 30 s a 5 min.
- **Sinos de indicadores**: `users.signal_bells` guarda os indicadores com sino ligado (`/api/notify`). O navegador avisa (notificação + som) para a aba ativa; o worker, a cada 60 s, confere o último candle de todas as abas do usuário e avisa pelo Telegram. Um sinal (indicador + candle + direção) avisa uma vez só — `signal_sent` guarda o que já foi enviado (limpo após 30 dias) e o registro é desfeito se o envio falhar. Candles velhos demais para o timeframe (`MAX_AGE_S` em `lib/signal-watch.ts`) não geram aviso.
- **Sugestão de indicadores** (`lib/suggest.ts`): ranking empírico por ativo/timeframe só com os sinais de **compra**; entrada na abertura do candle seguinte ao sinal, resultado 3/5/10 candles depois, menos o custo. A **régua** é o mesmo cálculo comprando em um candle qualquer; a nota mede o quanto o indicador a superou, com penalidade para amostra pequena e vantagem que não aparece nas duas metades. Sinais de venda são mostrados à parte (em quantos o preço caiu). Limites: régua sobre o histórico inteiro (inclui o aquecimento dos indicadores), sinais sobrepostos, sem stop; escolher o melhor entre 13 ainda pode ser sorte. Descreve o passado; não é recomendação de investimento.
- **Dados**: brapi.dev para candles (limite de range por intervalo intradiário). BCB SGS (Selic, câmbio, IPCA) na fase 2. Tabela `candles` (hypertable do TimescaleDB) usada como cache de histórico (ver rodada 2).

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
- Indicadores recalculados no navegador a cada troca.
- Sem rate limit no login nem recuperação de senha.
- O ticker é validado só por formato; erro da brapi aparece como mensagem no gráfico.

## Atualizações (rodada 2)
- **Cache de candles**: `lib/candles.ts` guarda candles no Postgres (`candles`, hypertable quando há TimescaleDB) e a data da última sincronização (`candle_sync`). Cache fresco (60 s intradiário, 5 min demais) não chama a brapi; cache velho busca só o menor `range` que cobre desde o último candle guardado (`lib/ranges.ts`). Se a brapi falhar, serve o cache. As tabelas novas são criadas por `lib/schema.ts` na primeira chamada, então bancos já existentes não precisam ser recriados.
- **Preço real**: serviço `quotes` (Python + yfinance, sufixo `.SA`) sem porta publicada; o web consulta via `/api/quote` a cada 15 s quando o botão "Preço real" está ligado (preferência no navegador). O preço só altera o último candle na tela, não o cache nem os indicadores. O Yahoo não é fonte oficial da B3 e pode ter atraso e limites de uso.
- **Autocomplete**: `/api/assets` busca por código ou nome da empresa na tabela `assets` (semeada com ~40 papéis e ampliada com a busca `quote/list` da brapi).
- **Aba = papel**: o nome da aba é sempre o código do ativo selecionado.
- **Barra lateral de ferramentas**: `components/tools/registry.tsx` é o registro; cada item (id, título, ícone, painel) vira um ícone na barra direita que abre um painel deslizante. Primeira ferramenta: notificações do Telegram (chat_id e alertas). Para adicionar outra, crie o painel e inclua um item no registro.

## Atualizações (rodada 3)
- **Novos indicadores** (em `lib/indicators.ts`, com sinais para o sugeridor): EMA 9, média 200, Donchian 20, VWAP (reinicia a cada dia), Estocástico 14,3,3, ADX 14 (+DI/-DI) e OBV. Estocástico, ADX e OBV têm painel próprio; os painéis dividem a altura de forma proporcional (até 20% cada, 60% no total).
- **Tela sem rolagem**: o layout ocupa 100% da altura; gráfico e painéis acompanham o tamanho da janela (`autoSize`).
- **Timeframe de 1 minuto**: janela inicial e máxima de 5 dias; cache considerado fresco por 30 s. Depende de a brapi (e do plano do token) aceitar `interval=1m`.
- **Quem busca o quê**: brapi = candles e busca de tickers (só quando o cache está velho, ou pelo worker de alertas); Yahoo/yfinance = só o preço ao vivo (`/api/quote`, a cada 15 s, só com "Preço real" ligado).

## Atualizações (rodada 4)
- **Sinais no gráfico**: setas de compra (verde, abaixo do candle) e venda (vermelha, acima) com o nome do indicador, para os indicadores ligados; botão "Sinais no gráfico" liga/desliga (preferência no navegador).
- **Níveis de sinal** (`lib/levels.ts`): para cada indicador ligado, acha por bisseção o fechamento do candle atual (±15% do preço) que faria a regra dar compra/venda, reaproveitando `signals()`. Roda no navegador sobre os últimos 400 candles. Em indicadores de cruzamento o nível só vale para o candle atual.
- **Sugestor**: retorno em 3, 5 e 10 candles, com custo de 0,1% por operação; a nota usa a média dos horizontes, penaliza amostra pequena (25/√n) e marca como "instável" quando a taxa de acerto da 1ª e da 2ª metade do histórico divergem. Ainda não é walk-forward com parâmetros ajustados; os indicadores têm parâmetros fixos.
- **Limite do plano da brapi**: o plano gratuito só libera os ranges `1d, 5d, 1mo, 3mo`. `fetchCandles` reduz o pedido ao maior range permitido e aprende a lista pela mensagem do erro 400 (ou por `BRAPI_RANGES`). Efeito: diário traz ~3 meses, semanal ~13 candles e mensal ~3; o cache cresce com o tempo, mas o histórico longo exige plano pago ou outra fonte (ex.: yfinance).

## Atualizações (rodada 5): histórico próprio e menos requisições
- **Calendário do pregão** (`lib/market.ts`): seg–sex, 09:50–18:50 (Brasília), com feriados da B3 de 2026–2027 e `MARKET_HOLIDAYS` para extras. Com o mercado aberto vale o prazo do timeframe (30 s no 1m, 60 s nos intradiários, 5 min no diário ou maior). Fechado, a brapi só é chamada se a última sincronização foi antes do fim do último pregão, para pegar o fechamento. Depois disso, noites, fins de semana e feriados saem só do banco.
- **Uma busca por vez**: `getCandles` agrupa chamadas simultâneas do mesmo papel e timeframe (`/api/candles` e `/api/suggest` chegam juntos).
- **Worker mantém o histórico**: a cada 5 min sincroniza, para os papéis das abas e dos alertas ativos, o timeframe em uso e o diário. O banco acumula além do limite de 3 meses do plano gratuito, desde que o papel esteja em uso.
- **Lacunas**: se o histórico guardado tem um buraco maior que o normal (6 dias; 10 no semanal; 40 no mensal), a próxima busca já pede um range que o cubra, no máximo uma vez por dia por papel e timeframe (`candle_sync.gap_checked_at`). Lacunas mais antigas que o range permitido pelo plano não são recuperáveis pela brapi.
- **Limites conhecidos**: a leitura traz no máximo 5000 candles por papel e timeframe; falhas de calendário (feriado esquecido) só custam uma busca a mais; lacunas de poucos candles dentro do pregão não são detectadas.

## Atualizações (rodada 6): simulação de operações
- **Motor** (`lib/backtest.ts`): long-only. Sinal no fechamento do candle i => entrada/saída na **abertura do candle i+1**. Saídas: sinal de venda de qualquer indicador escolhido, ou após N candles; stop e alvo opcionais, checados dentro do candle (stop vence se os dois forem tocados; gap abre no pior preço). Custo por operação configurável (padrão 0,1%). Posição aberta no fim é marcada a mercado. Entrada por "qualquer indicador" ou por confluência ("todos nos últimos N candles").
- **Métricas**: nº de operações, acerto, retorno médio, ganho/perda média, fator de lucro, retorno composto, comparação com comprar e segurar, maior queda do capital, exposição e o mesmo recorte nas duas metades do histórico.
- **UI**: ferramenta "Simulação de operações" na barra lateral (`components/tools/SimulationPanel.tsx`). Enquanto o painel está aberto, o gráfico mostra as entradas e as saídas com o resultado de cada operação no lugar das setas dos indicadores. Roda no navegador sobre os candles carregados.
- **Cuidados**: com poucas operações o resultado não diz nada (o painel avisa abaixo de 10); testar vários indicadores no mesmo histórico favorece o que deu sorte. Ainda não há simulação ao vivo (paper trading) nem short.

## Atualizações (rodada 7): vários mercados e operações na Binance
- **Mercados** (`lib/markets.ts`): cada aba tem um mercado (`profiles.market`, `alerts.market`): `b3` ou `binance`. O seletor fica na barra da aba; trocar de mercado troca o ativo para o padrão do mercado (PETR4 / BTCUSDT). Para acrescentar outro mercado: id em `markets.ts`, dados em `lib/<mercado>.ts` e os ramos em `lib/candles.ts`, `api/quote` e `api/assets`. Ferramentas da barra lateral podem se restringir a mercados (`Tool.markets`).
- **Dados da Binance** (`lib/binance.ts`): candles de `data-api.binance.vision` (endpoint público só de dados, sem chave), 2000 candles na primeira carga e depois só o trecho novo, com o mesmo cache/lacunas do Postgres. As chaves do cache ganham prefixo (`BINANCE:BTCUSDT`); a B3 mantém o código puro. Mercado 24/7: vale sempre o prazo do timeframe (sem calendário de pregão). Preço ao vivo direto do ticker da Binance (a cada 5 s); autocomplete pela lista pública de pares.
- **Operar** (ferramenta "Operar (Binance)", só na Binance): ambiente **homologação** (testnet.binance.vision) ou **produção**, ordens a mercado ou limite, comprar/vender, saldo, ordens abertas/recentes e cancelamento. Só envio manual; não há operação automática por sinal.
- **Travas de segurança**:
  - chaves de API guardadas com AES-256-GCM (`CREDENTIALS_KEY`), nunca devolvidas ao navegador (só os 4 últimos caracteres) e só salvas depois de uma consulta de saldo bem-sucedida; use chave sem permissão de saque e com IP restrito;
  - **produção bloqueada por padrão**: só com `BINANCE_ALLOW_PRODUCTION=true`; sem isso é possível ver saldo e validar ordens, não enviar nem cancelar;
  - em produção: só pares cotados em stablecoin e no máximo `TRADE_MAX_NOTIONAL_USDT` por ordem (padrão 100);
  - "Validar" usa `/order/test` (não envia); enviar exige `confirm=true` e, em produção, um aceite explícito na tela;
  - quantidade e preço são ajustados aos filtros do par (passo, mínimos, valor mínimo) com aritmética decimal exata antes de ir à Binance;
  - 10 ordens reais por minuto por usuário; toda tentativa (inclusive recusadas) fica em `order_log`.
- **Limitações**: só Spot e só chaves HMAC; a testnet tem preços próprios (o gráfico usa o mercado real); o limite de frequência é em memória (zera ao reiniciar); `BINANCE_ALLOW_PRODUCTION` é por servidor, não por usuário; o cadastro de ordens não tem stop/OCO; Binance.com pode estar indisponível em alguns países.

### Ambiente também nos dados (Binance)

O ambiente escolhido (homologação/produção) vale para os dados do gráfico, não só para as ordens: em homologação, candles, cotação, busca de pares, regras do par e websocket vêm da testnet (`testnet.binance.vision`, `stream.testnet.binance.vision`); em produção, do mercado real. As rotas recebem `env`; o cache usa chaves separadas (`BINANCE:BTCUSDT` e `BINANCE-TEST:BTCUSDT`) para não misturar históricos. A testnet tem histórico curto (ex.: ~50 candles diários) e movimento próprio. O worker (alertas e sincronização de histórico) usa sempre produção. Variáveis opcionais: `BINANCE_TESTNET_URL`, `NEXT_PUBLIC_BINANCE_TESTNET_WS_URL`.

### Timeframes liberados pelo plano da brapi

O plano gratuito da brapi só aceita o intervalo `1d` (e ranges até 3 meses) para a maioria dos papéis; PETR4, VALE3, MGLU3 e ITUB4 (papéis de teste) não têm limite. O servidor descobre os intervalos permitidos por `BRAPI_INTERVALS`, pela mensagem de erro (400) ou por uma sondagem única com PETR3 (`/api/plan`). A tela desativa os botões de timeframe bloqueados nas abas B3 (exceto nos papéis de teste) e, se a aba estiver num timeframe bloqueado, volta para o primeiro liberado. O servidor também recusa localmente os timeframes bloqueados, sem gastar requisição.

- **Horário no gráfico**: os candles são guardados em UTC; no intraday os rótulos aparecem no horário de Brasília (`lib/chart-time.ts`). O intraday da brapi termina antes do fim do pregão; o fechamento correto é o do candle diário.
- **Ibovespa**: o símbolo `^BVSP` é aceito na B3 (candles pela brapi; cotação ao vivo pelo yfinance sem `.SA`). No plano gratuito da brapi vem só o diário, com histórico curto. O contrato futuro (WIN) não está disponível nas fontes usadas.
- **Histórico diário longo (B3)**: o worker baixa os arquivos anuais `COTAHIST` da B3 (em fluxo, sem gravar em disco) e importa o diário dos papéis em uso que ainda não têm (`history_import`; `HISTORY_YEARS`, padrão 5, 0 desliga). Os dias presentes no arquivo substituem os do banco (série inteira no mesmo ajuste); dias mais novos que o arquivo continuam vindo da brapi. Os preços da B3 são nominais: desdobramentos e grupamentos são ajustados quando o número de distribuição muda e o preço salta numa proporção típica; dividendos não são ajustados. Índices e futuros não estão no arquivo. **Desdobramento depois da importação**: o worker procura no diário saltos de abertura ainda não conferidos (`history_import.jumps`) e reimporta o papel; se o arquivo da B3 ainda não tem o dia, tenta de novo em 12 h (`retry_at`). **Status na tela**: o worker grava o andamento em `history_status` (localizando, baixando ano a ano, concluído, erro), a rota `/api/history` informa e o `HistoryBadge` mostra ao lado do papel, com o botão para atualizar o gráfico. Só o diário é reajustado; 1wk/1mo e intraday guardados não.
- **Calculadora de risco** (`lib/risk.ts`, painel `RiskPanel`): só compra. Quantidade = capital × risco% ÷ (entrada − stop + 0,1% de custo), limitada ao capital (sem alavancagem) e arredondada para baixo no lote (1 ou 100 na B3; 0,00001 em cripto, sem consultar as regras do par). Atalhos de stop: mínima de 10 candles e 2 × ATR(14). Capital e risco ficam só no navegador (`localStorage`). Não envia ordens; gap pode tornar a perda maior que a calculada.
