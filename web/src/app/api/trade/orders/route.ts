import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { cancelOrder, isEnv, openOrders, prepareOrder, recentOrders, sendOrder, symbolRules, ticker24h, type Env, type OrderInput } from '@/lib/binance';
import { STABLE_QUOTES, validSymbol } from '@/lib/markets';
import { loadCreds, logOrder, maxNotional, orderRateOk, productionAllowed } from '@/lib/trade-guard';

export const dynamic = 'force-dynamic';
const wrap = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  try { return await fn(req); } catch (e) { if (e instanceof Response) return e; throw e; }
};
const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Ordens abertas e recentes do par.
export const GET = wrap(async (req) => {
  const uid = await requireUser();
  const sp = new URL(req.url).searchParams, env = sp.get('env'), symbol = (sp.get('symbol') ?? '').toUpperCase();
  if (!isEnv(env) || !validSymbol('binance', symbol)) return err('parâmetros inválidos');
  const creds = await loadCreds(uid, env);
  if (!creds) return err('Sem chaves configuradas para este ambiente.', 404);
  try { return NextResponse.json({ open: await openOrders(env, creds, symbol), recent: await recentOrders(env, creds, symbol) }); }
  catch (e: any) { return err(e.message, 502); }
});

/**
 * Envia (ou só valida, com test=true) uma ordem. Travas, nesta ordem:
 *  - exige confirmação explícita (confirm=true) para enviar de verdade;
 *  - produção só se BINANCE_ALLOW_PRODUCTION=true no servidor, apenas em pares cotados em stablecoin e até TRADE_MAX_NOTIONAL_USDT por ordem;
 *  - quantidade/preço são ajustados aos filtros do par e conferidos antes de ir à Binance;
 *  - limite de 10 ordens reais por minuto por usuário; toda tentativa vai para o order_log.
 */
export const POST = wrap(async (req) => {
  const uid = await requireUser();
  const b = await req.json().catch(() => ({}));
  const env = b.env as Env, symbol = String(b.symbol ?? '').toUpperCase(), test = b.test === true;
  if (!isEnv(env) || !validSymbol('binance', symbol)) return err('parâmetros inválidos');
  if (!test && b.confirm !== true) return err('Confirmação explícita obrigatória para enviar a ordem.');
  if (!test && env === 'production' && !productionAllowed())
    return err('Ordens em produção estão desabilitadas neste servidor (BINANCE_ALLOW_PRODUCTION).', 403);

  const creds = await loadCreds(uid, env);
  if (!creds) return err('Sem chaves configuradas para este ambiente.', 404);

  const input: OrderInput = { side: b.side, type: b.type, quantity: String(b.quantity ?? ''), price: b.price == null ? undefined : String(b.price) };
  const mode = test ? 'test' : 'live';
  try {
    const [rules, tick] = await Promise.all([symbolRules(symbol, env), ticker24h(symbol, env)]);
    const order = prepareOrder(rules, input, tick.price);
    if (env === 'production') {
      if (!STABLE_QUOTES.includes(rules.quote)) return err(`Em produção só são aceitos pares cotados em stablecoin (${STABLE_QUOTES.join(', ')}).`);
      if (order.notional > maxNotional()) return err(`Valor da ordem (${order.notional.toFixed(2)} ${rules.quote}) acima do limite configurado (${maxNotional()} ${rules.quote}).`);
    }
    if (!test && !orderRateOk(uid)) return err('Muitas ordens em pouco tempo. Aguarde um minuto.', 429);
    try {
      const result = await sendOrder(env, creds, order, test);
      await logOrder(uid, env, order, mode, true, result);
      return NextResponse.json({ ok: true, mode, prepared: order, result });
    } catch (e: any) {
      await logOrder(uid, env, order, mode, false, { error: e.message });
      return err(e.message, 502);
    }
  } catch (e: any) {
    await logOrder(uid, env, { symbol, side: String(input.side), type: String(input.type), quantity: input.quantity, price: input.price }, mode, false, { error: e.message }).catch(() => {});
    return err(e.message);
  }
});

export const DELETE = wrap(async (req) => {
  const uid = await requireUser();
  const sp = new URL(req.url).searchParams, env = sp.get('env'), symbol = (sp.get('symbol') ?? '').toUpperCase(), id = Number(sp.get('orderId'));
  if (!isEnv(env) || !validSymbol('binance', symbol) || !Number.isInteger(id) || id <= 0) return err('parâmetros inválidos');
  if (env === 'production' && !productionAllowed()) return err('Operações em produção estão desabilitadas neste servidor.', 403);
  const creds = await loadCreds(uid, env);
  if (!creds) return err('Sem chaves configuradas para este ambiente.', 404);
  try { await cancelOrder(env, creds, symbol, id); await logOrder(uid, env, { symbol, side: '-', type: 'CANCEL' }, 'live', true, { orderId: id }); return NextResponse.json({ ok: true }); }
  catch (e: any) { return err(e.message, 502); }
});
