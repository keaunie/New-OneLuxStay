const SUPERADMIN_ROLES = new Set(["superadmin", "admins_ols_superadmin"]);
const ADMIN_ROLES = new Set(["admin", "admins_ols", "admins_ols_superadmin", "superadmin"]);
const GENERIC_AUTH_ROLES = new Set(["authenticated", "anon", "service_role", "supabase_admin"]);
const PRIMARY_SUPERADMIN_EMAILS = ["admin@oneluxstay.com"];
const RAW_SUPABASE_USER_FIELDS = new Set([
  "aud",
  "app_metadata",
  "user_metadata",
  "created_at",
  "confirmed_at",
  "email_confirmed_at",
  "last_sign_in_at",
]);

export const normalizeRole = (value = "") =>
  String(value ?? "")
    .toLowerCase()
    .trim();

const hasOwn = (source = {}, key = "") => Object.prototype.hasOwnProperty.call(source || {}, key);

const looksLikeRawSupabaseUser = (user = {}) =>
  Boolean(user && typeof user === "object" && [...RAW_SUPABASE_USER_FIELDS].some((field) => hasOwn(user, field)));

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();

const readEnvValue = (name = "") => {
  const processValue = globalThis?.process?.env?.[name];
  if (processValue) return processValue;
  return import.meta.env?.[name] || "";
};

const parseList = (value = "") =>
  String(value || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

const getSuperAdminEmails = () =>
  new Set([
    ...PRIMARY_SUPERADMIN_EMAILS,
    ...parseList(readEnvValue("ADMINS_OLS_SUPERADMIN_EMAILS")),
    ...parseList(readEnvValue("VITE_ADMINS_OLS_SUPERADMIN_EMAILS")),
  ]);

const hasSuperAdminEmail = (user = {}) => {
  const email = normalizeEmail(user?.email);
  return Boolean(email && getSuperAdminEmails().has(email));
};

const roleFromFlags = (source = {}) => {
  if (!source || typeof source !== "object") return "";
  if (source.superadmin === true || source.admins_ols_superadmin === true) return "admins_ols_superadmin";
  if (source.admins_ols === true) return "admins_ols";
  return "";
};

export const getNormalizedUserRole = (
  user = {},
  { includeAppMetadata = true, includeUserMetadata = true } = {},
) => {
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const shouldTrustTopLevelRole = !looksLikeRawSupabaseUser(user);
  if (hasSuperAdminEmail(user)) return "admins_ols_superadmin";
  const candidates = [
    user?.adminRole,
    user?.admin_role,
    user?.appRole,
    user?.app_role,
    shouldTrustTopLevelRole ? user?.role : "",
    includeAppMetadata ? roleFromFlags(appMetadata) : "",
    includeAppMetadata ? appMetadata?.admin_role || appMetadata?.adminRole || appMetadata?.app_role || appMetadata?.appRole : "",
    includeAppMetadata ? appMetadata?.role : "",
    includeUserMetadata ? roleFromFlags(userMetadata) : "",
    includeUserMetadata ? userMetadata?.admin_role || userMetadata?.adminRole || userMetadata?.app_role || userMetadata?.appRole : "",
    includeUserMetadata ? userMetadata?.role : "",
  ]
    .map((value) => normalizeRole(value))
    .filter(Boolean);

  const preferredAdminRole = candidates.find((role) => ADMIN_ROLES.has(role));
  if (preferredAdminRole) return preferredAdminRole;

  const nonGenericRole = candidates.find((role) => !GENERIC_AUTH_ROLES.has(role));
  return nonGenericRole || candidates[0] || "";
};

export const isSuperAdminRole = (value = "") => SUPERADMIN_ROLES.has(normalizeRole(value));

export const isAdminRole = (value = "") => ADMIN_ROLES.has(normalizeRole(value));

export const userHasSuperAdminRole = (user = {}) =>
  Boolean(user?.isSuperAdmin === true) || hasSuperAdminEmail(user) || isSuperAdminRole(getNormalizedUserRole(user));

export const userHasAdminRole = (user = {}) =>
  isAdminRole(getNormalizedUserRole(user)) || userHasSuperAdminRole(user);

export const logRoleDebug = (sessionUser = {}, appUser = null) => {
  const role = getNormalizedUserRole(sessionUser);
  const normalizedAppUser = appUser || {
    role,
    isSuperAdmin: userHasSuperAdminRole(sessionUser),
  };

  console.log("SESSION USER", sessionUser);
  console.log("ROLE", role);
  console.log("IS SUPER ADMIN", normalizedAppUser?.isSuperAdmin === true);
  console.log("APP USER", normalizedAppUser);
};
