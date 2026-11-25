import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email=$1', [String(email).toLowerCase()]);
  const ok = rows[0] && (await bcrypt.compare(String(password), rows[0].password_hash));
  if (!ok) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  await createSession(rows[0].id);
  return NextResponse.json({ ok: true });
}
