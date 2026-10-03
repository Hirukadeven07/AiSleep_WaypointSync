import type { Role } from './status';

export interface LoginRequest {
  role: Role;
  loginId: string;
  secret?: string;
  depotId?: string;
}

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
