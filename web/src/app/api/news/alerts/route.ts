import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { pendingNews } from '@/lib/news/alerts';

export const dynamic = 'force-dynamic';

// Notícias novas dos sinos do usuário, para o aviso no navegador (que guarda o que já mostrou).
export async function GET() {
  let uid: number;
  try { uid = await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  await ensureSchema();
  return NextResponse.json({ items: await pendingNews(uid) });
}
