'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  async function go(kind: 'login' | 'register') {
    const r = await fetch(`/api/auth/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.ok) location.href = '/'; else setErr((await r.json()).error);
  }
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); go('login'); }}>
      <h2>Prophet</h2>
      <input placeholder="e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input placeholder="senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="on">Entrar</button>
      <button type="button" onClick={() => go('register')}>Criar conta</button>
      {err && <span style={{ color: '#f85149' }}>{err}</span>}
    </form>
  );
}
