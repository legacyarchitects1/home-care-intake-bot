import type { AgencyBranding, AgencyConfig } from "./types";
import demoAgency from "../configs/demo-agency.json";

/**
 * Milestone-1 config store: a hardcoded map of bundled JSON files.
 * Adding a new agency today means adding a JSON file here and registering it
 * in this map — no redeploy of any other agency's config required, no code
 * changes elsewhere.
 *
 * Next phase (multi-client config system, deferred on purpose per spec):
 * swap this module's internals for a KV or D1 lookup keyed by agencyId.
 * Every call site below already goes through getAgencyConfig(), so that
 * swap only touches this one file.
 */
const AGENCIES: Record<string, AgencyConfig> = {
  [demoAgency.agencyId]: demoAgency as AgencyConfig,
};

export function getAgencyConfig(agencyId: string): AgencyConfig | null {
  return AGENCIES[agencyId] ?? null;
}

export function getAgencyBranding(agencyId: string): AgencyBranding | null {
  const config = getAgencyConfig(agencyId);
  if (!config) return null;
  const { coordinatorEmail, coordinatorName, fromEmail, servicesOffered, ...branding } = config;
  return branding;
}
