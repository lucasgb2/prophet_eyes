import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { assess } from '@/lib/health';
import { readBeats } from '@/lib/heartbeat';

export const dynamic = 'force-dynamic';
const started = Date.now();

export async function GET() {
  try { await requireUser(); } catch (e) { if (e instanceof Response) return e; throw e; }
  await ensureSchema();
  return NextResponse.json(assess(await readBeats(), Date.now(), started));
}
