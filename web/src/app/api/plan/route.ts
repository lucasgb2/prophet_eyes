import { NextResponse } from 'next/server';
import { planIntervals } from '@/lib/brapi';
import { FREE_TICKERS } from '@/lib/ranges';

export const dynamic = 'force-dynamic';

// Timeframes liberados pelo plano da brapi (B3). `b3: null` = sem restrição conhecida; `free` = papéis de teste, sem restrição.
// A Binance não tem restrição.
export async function GET() {
  return NextResponse.json({ b3: await planIntervals(), free: FREE_TICKERS });
}
