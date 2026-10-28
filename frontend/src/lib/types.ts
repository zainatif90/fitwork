// Shared TypeScript types that mirror the backend's Pydantic schemas.

export type Role = "freelancer" | "agency_owner" | "agency_member";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_verified: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
