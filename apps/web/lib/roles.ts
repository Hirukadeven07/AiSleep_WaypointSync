import type { Role } from '@waypoint/contracts';

/** The four workspaces as the login flow presents them. `slug` is the /login/<slug> route. */
export interface WorkspaceInfo {
  role: Role;
  slug: string;
  index: string;
  eyebrow: string;
  title: string;
  blurb: string;
  device: string;
  tint: string;
  ink: string;
}

export const WORKSPACES: WorkspaceInfo[] = [
  {
    role: 'dispatcher',
    slug: 'dispatcher',
    index: '[01]',
    eyebrow: 'SYNC CONSOLE',
    title: 'Dispatcher',
    blurb: "Plan tomorrow's trips, follow today's on the live map and handle incidents.",
    device: 'Best on a computer',
    tint: 'bg-info-tint',
    ink: 'text-primary',
  },
  {
    role: 'loader',
    slug: 'loader',
    index: '[02]',
    eyebrow: 'SYNC DOCK',
    title: 'Loader',
    blurb: 'Unlock the dock, see which trucks to load and check items off in order.',
    device: 'Shared dock tablet',
    tint: 'bg-olive-tint',
    ink: 'text-olive-ink',
  },
  {
    role: 'driver',
    slug: 'driver',
    index: '[03]',
    eyebrow: 'SYNC DRIVER',
    title: 'Driver',
    blurb: "Your route, in-app directions and 'I've arrived' at every stop.",
    device: 'On your phone',
    tint: 'bg-tech-tint',
    ink: 'text-tech',
  },
  {
    role: 'store',
    slug: 'store',
    index: '[04]',
    eyebrow: 'SYNC STORE',
    title: 'Store manager',
    blurb: 'Order stock, check what arrived and confirm every delivery.',
    device: 'On your phone',
    tint: 'bg-style-tint',
    ink: 'text-style',
  },
];

export const workspaceBySlug = (slug: string) => WORKSPACES.find((w) => w.slug === slug);

const ROLE_KEY = 'ws_role';
const ID_KEY = (role: Role) => `ws_login_${role}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the login still works */
  }
}

/** The role this device last signed in as, so the next visit goes straight to its sign-in. */
export const rememberedRole = () => read(ROLE_KEY);
export const rememberRole = (role: Role) => write(ROLE_KEY, role);
export const forgetRole = () => write(ROLE_KEY, null);

/** Only the login id is remembered, never a password or PIN. */
export const rememberedLoginId = (role: Role) => read(ID_KEY(role));
export const rememberLoginId = (role: Role, id: string | null) => write(ID_KEY(role), id);
