import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Login obrigatório: tudo exceto /login e as rotas de auth exige sessão válida.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) return NextResponse.next();
  const token = req.cookies.get('prophet_session')?.value;
  try {
    if (!token) throw new Error();
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api')) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
