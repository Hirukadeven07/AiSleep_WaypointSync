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
