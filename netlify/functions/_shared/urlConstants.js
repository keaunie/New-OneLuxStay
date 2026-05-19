import { getInternalOrigin, PUBLIC_WEBSITE_URL } from "./http.js";

export { PUBLIC_WEBSITE_URL };

// INTERNAL_API_BASE is the functions base for the current request environment.
export const INTERNAL_API_BASE = (event = {}) => `${getInternalOrigin(event).replace(/\/+$/, "")}/.netlify/functions`;

