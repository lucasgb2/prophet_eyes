import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req: Request) {
  if (process.env.ALLOW_REGISTRATION !== 'true') return NextResponse.json({ error: 'Cadastro desativado' }, { status: 403 });
  const { email, password } = await req.json();
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 8)
    return NextResponse.json({ error: 'E-mail inválido ou senha com menos de 8 caracteres' }, { status: 400 });
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query('INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id', [email.toLowerCase(), hash]);
    await pool.query("INSERT INTO profiles(user_id, name, symbol, indicators) VALUES ($1,'PETR4','PETR4','[\"sma20\",\"rsi\"]')", [rows[0].id]);
    await createSession(rows[0].id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 });
    console.error('register:', e);
    return NextResponse.json({ error: 'Erro ao criar a conta. Tente novamente.' }, { status: 500 });
  }
}
