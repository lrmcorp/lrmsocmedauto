export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'LRM Corporation Login',
  description: '',
};
export default async function Auth() {
  return <Login />;
}
