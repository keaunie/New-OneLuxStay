const SUPERADMIN_ROLES = new Set(["superadmin", "admins_ols_superadmin"]);
const ADMIN_ROLES = new Set(["admin", "admins_ols", "admins_ols_superadmin", "superadmin"]);
const GENERIC_AUTH_ROLES = new Set(["authenticated", "anon", "service_role", "supabase_admin"]);

export const normalizeRole = (value = "") =>
  String(value ?? "")
    .toLowerCase()
    .trim();

export const getNormalizedUserRole = (
  user = {},
  { includeAppMetadata = true, includeUserMetadata = true } = {},
) => {
  const candidates = [
    user?.role,
    includeAppMetadata ? user?.app_metadata?.role : "",
    includeUserMetadata ? user?.user_metadata?.role : "",
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
  Boolean(user?.isSuperAdmin === true) || isSuperAdminRole(getNormalizedUserRole(user));

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
