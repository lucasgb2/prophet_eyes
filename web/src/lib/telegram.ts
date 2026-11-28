export async function telegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN não definido; alerta não enviado'); return false; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) console.error('Telegram falhou', r.status);
  return r.ok;
}
