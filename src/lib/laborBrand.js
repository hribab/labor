export const LABOR_BRAND_NAME = "Labor";
export const LABOR_PRODUCTION_URL = "https://uselabor.com";
export const LABOR_GITHUB_URL = "https://github.com/hribab/labor";
export const LABOR_GITHUB_ISSUES_URL = `${LABOR_GITHUB_URL}/issues`;
export const LABOR_GITHUB_DISCUSSIONS_URL = `${LABOR_GITHUB_URL}/discussions`;
export const LABOR_LICENSE_URL = `${LABOR_GITHUB_URL}/blob/main/LICENSE`;
export const LABOR_LOGO_PATH = "/assets/labor-logo.png";
export const LABOR_DESCRIPTION =
  "Free, open-source autonomous product builder that generates, deploys, releases, and manages software in your cloud.";

// Firestore collections cannot be renamed atomically. This physical path keeps
// existing users, runs, releases, and cloud connections available after launch.
export const LABOR_DATA_ROOT_COLLECTION = "testkitchen";
