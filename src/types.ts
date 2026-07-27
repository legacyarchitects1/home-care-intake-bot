export interface Env {
  ASSETS: Fetcher;
  SUBMISSIONS_LOG: KVNamespace;
  OPENAI_API_KEY: string;
  RESEND_API_KEY: string;
}

// Public-safe branding config — this is what the widget fetches and renders.
// Never include coordinatorEmail or anything internal here.
export interface AgencyBranding {
  agencyId: string;
  agencyName: string;
  logoUrl: string | null;
  primaryColor: string;
  textColor: string;
  tagline: string;
}

// Full config, only ever read server-side.
export interface AgencyConfig extends AgencyBranding {
  coordinatorEmail: string;
  coordinatorName: string;
  fromEmail: string;
  servicesOffered: string;
}

export type Relationship = "self" | "family_member" | "other";
export type AgeBand = "under_18" | "18_64" | "65_plus";
export type PaymentType = "medicaid" | "medicare" | "private_pay" | "not_sure";

// The full structured intake — deliberately the ONLY fields the widget can
// ever collect. No SSN, no diagnosis, no insurance ID number, ever.
export interface IntakeSubmission {
  agencyId: string;
  name: string;
  contact: string;
  relationship: Relationship;
  livingSituation: string;
  careNeeds: string;
  paymentType: PaymentType;
  ageBand: AgeBand;
}

export interface AiIntakeResult {
  eligibilityNote: string;
  clientMessage: string;
  coordinatorSummary: string;
}
