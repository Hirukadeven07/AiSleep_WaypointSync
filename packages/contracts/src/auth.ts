import type { Role } from './status';

export interface LoginRequest {
  role: Role;
  /** Not used for the dock: a loader signs in to the tablet with the depot and its dock password. */
  loginId?: string;
  /** Password (dispatcher, store), PIN (driver) or the depot's dock password (loader). */
  secret?: string;
  /** Required for the dock sign-in. */
  depotId?: string;
}

/** The dock tablet signs in as one shared account per depot; loaders confirm themselves at "Start loading". */
export const DOCK_LOGIN_PREFIX = 'dock-';
export const dockLoginId = (depotId: string) => `${DOCK_LOGIN_PREFIX}${depotId}`;
/** The dock password is the 6 digits of the dock keypad. */
export const DOCK_PASSWORD_PATTERN = /^\d{6}$/;

export interface LoginResponse {
  role: Role;
  home: string;
}

export interface Me {
  id: string;
  name: string;
  role: Role;
  depotId: string | null;
  storeId: string | null;
}

/** GET /me/profile: the details behind the account button. */
export interface Profile {
  id: string;
  name: string;
  role: Role;
  loginId: string;
  phone: string | null;
  depot: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  /** Dispatchers only. */
  employeeNo: string | null;
  /** This session: when it signed in and when it runs out. ISO. */
  signedInAt: string | null;
  sessionExpiresAt: string | null;
}
