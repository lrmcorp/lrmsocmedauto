import { redirect } from 'next/navigation';

export function Register() {
  redirect('/auth/login');
}
