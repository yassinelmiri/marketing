import { redirect } from 'next/navigation'

export default function RegisterPage() {
  // Les comptes sont provisionnés uniquement par un administrateur.
  redirect('/login')
}
