import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';
export default async function Home() {
  if (!(await currentUserId())) redirect('/login');
  return <Dashboard />;
}
