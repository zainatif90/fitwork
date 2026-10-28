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

export type JobSource = "freelancer" | "upwork" | "csv" | "manual" | "synthetic";

export interface Breakdown {
  semantic: number;
  budget_fit: number;
  recency: number;
  cosine: number;
  budget_known: boolean;
  weights: { semantic: number; budget_fit: number; recency: number };
}

export interface JobSummary {
  id: string;
  source: JobSource;
  title: string;
  description_preview: string;
  skills: string[];
  budget_min: number | null;
  budget_max: number | null;
  budget_type: "fixed" | "hourly";
  currency: string;
  proposals_count: number | null;
  posted_at: string;
  url: string | null;
}

export interface MatchScore {
  job_id: string;
  score: number;
  breakdown: Breakdown;
  reason: string;
  matched_skills: string[];
  missing_skills: string[];
}

export interface Match extends MatchScore {
  job: JobSummary;
}

export interface MatchesResponse {
  matches: Match[];
  stats: { candidates_considered: number; strong_matches: number; average_score: number; top_source: JobSource | null };
  generated_at: string;
  compute_ms: number;
  cached: boolean;
}

export interface Job extends Omit<JobSummary, "description_preview"> {
  external_id: string;
  description: string;
  client_country: string | null;
  client_hire_rate: number | null;
  is_active: boolean;
}

export type Outcome = "applied" | "won" | "lost" | "not_relevant";

export interface JobDetail {
  job: Job;
  match: MatchScore | null;
  feedback: Outcome | null;
}

export interface AgencyMemberRow {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  status: "invited" | "active";
  invited_at: string;
  joined_at: string | null;
}

export interface Agency {
  id: string;
  name: string;
  role: "owner" | "member";
  owner_name: string;
  members: AgencyMemberRow[];
}

export interface MemberScore {
  member_id: string;
  name: string;
  score: number;
  reason: string;
  matched_skills: string[];
}

export interface RoutingRecommendation {
  job: JobSummary;
  recommended: MemberScore;
  alternatives: MemberScore[];
  low_team_fit: boolean;
  missing_skills: string[];
  rerouted_after_decline: boolean;
}

export type AssignmentStatus = "recommended" | "assigned" | "declined" | "applied" | "won" | "lost";

export interface Assignment {
  id: string;
  job: JobSummary;
  member_id: string;
  member_name: string;
  status: AssignmentStatus;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberStats {
  member_id: string;
  name: string;
  email: string;
  top_skills: string[];
  has_profile: boolean;
  active_assignments: number;
  win_rate_30d: number | null;
  decided_30d: number;
  routed_today: number;
}

export interface TeamStats {
  members: TeamMemberStats[];
  win_rate_series: Array<{ week: string } & Record<string, number | null | string>>;
  has_outcomes: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
