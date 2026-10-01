import { notFound } from 'next/navigation';
import { DispatcherLogin } from '@/components/login/DispatcherLogin';
import { DriverLogin } from '@/components/login/DriverLogin';
import { LoaderLogin } from '@/components/login/LoaderLogin';
import { StoreLogin } from '@/components/login/StoreLogin';
import { workspaceBySlug } from '@/lib/roles';

const SCREENS = {
  dispatcher: DispatcherLogin,
  loader: LoaderLogin,
  driver: DriverLogin,
  store: StoreLogin,
} as const;

export function generateStaticParams() {
  return Object.keys(SCREENS).map((role) => ({ role }));
}

export default function RoleLoginPage({ params }: { params: { role: string } }) {
  const workspace = workspaceBySlug(params.role);
  if (!workspace) notFound();
  const Screen = SCREENS[workspace.slug as keyof typeof SCREENS];
  return <Screen />;
}
