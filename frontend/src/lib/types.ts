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

export type ExperienceLevel = "beginner" | "intermediate" | "expert";

export const PLATFORMS = ["Freelancer.com", "Upwork", "Fiverr", "LinkedIn", "Toptal", "PeoplePerHour", "Guru", "Other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Profile {
  id: string;
  skills: string[];
  experience_level: ExperienceLevel;
  hourly_rate: number;
  bio: string;
  portfolio_urls: string[];
  platforms: Platform[];
  embedding_status: "ready" | "pending";
  updated_at: string;
}

export type ProfileInput = Omit<Profile, "id" | "embedding_status" | "updated_at">;

export interface SkillOption {
  name: string;
  category: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
