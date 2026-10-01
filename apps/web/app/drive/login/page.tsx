import { redirect } from 'next/navigation';

// One driver sign-in: the styled screen at /login/driver (phone and desktop layouts).
export default function DriverLoginRedirect() {
  redirect('/login/driver');
}
