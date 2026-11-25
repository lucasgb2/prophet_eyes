import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'prophet_session';
const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET ausente ou curto demais');
  return new TextEncoder().encode(s);
};

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(key());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 604800 });
}

export function destroySession() { cookies().delete(COOKIE); }

export async function currentUserId(): Promise<number | null> {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key())).payload.uid as number; } catch { return null; }
}

export async function requireUser(): Promise<number> {
  const id = await currentUserId();
  if (!id) throw new Response('Não autenticado', { status: 401 });
  return id;
}
