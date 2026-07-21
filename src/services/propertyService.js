import { getAdminsOlsAuthHeaders } from "../utils/adminsOlsAuth";

export class PropertyServiceError extends Error {
  constructor(message, { code = "unknown", status = 0, cause } = {}) {
    super(message, { cause });
    this.name = "PropertyServiceError";
    this.code = code;
    this.status = status;
  }
}

const toQuery = (values = {}) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value != null) query.set(key, String(value));
  });
  return query.toString();
};

/** Centralized UUID-based property administration API. */
export const createPropertyService = ({ apiBase, session }) => {
  const request = async ({ query, body } = {}) => {
    const target = `${apiBase}/property-admin${query ? `?${toQuery(query)}` : ""}`;
    let response;
    try {
      response = await fetch(target, {
        method: body ? "POST" : "GET",
        headers: { ...getAdminsOlsAuthHeaders(session), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      throw new PropertyServiceError("Unable to reach the property service. Check your connection and try again.", { code: "network", cause });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new PropertyServiceError(payload?.error || "Property request failed.", { code: payload?.code || (response.status === 404 ? "not_found" : response.status === 401 || response.status === 403 ? "authorization" : response.status === 409 ? "validation" : "database"), status: response.status });
    return payload;
  };
  const action = (name, values = {}) => request({ body: { action: name, ...values } });
  return {
    getProperties: (filters = {}) => request({ query: filters }),
    getPropertyById: (propertyId) => request({ query: { propertyId } }),
    createProperty: (input) => action("create-property", { input }),
    updateProperty: (propertyId, updates) => action("update-property", { propertyId, updates }),
    updatePropertyDescription: (propertyId, language, updates) => action("update-description", { propertyId, language, updates }),
    getPropertyImages: async (propertyId) => (await request({ query: { propertyId } })).property?.property_images || [],
    addPropertyImage: (propertyId, input) => action("add-image", { propertyId, input }),
    migrateNextGuestyImage: (propertyId) => action("migrate-guesty-image", { propertyId }),
    updatePropertyImage: (propertyId, imageId, updates) => action("update-image", { propertyId, imageId, updates }),
    deletePropertyImage: (propertyId, imageId) => action("delete-image", { propertyId, imageId }),
    reorderPropertyImages: (propertyId, orderedImageIds) => action("reorder-images", { propertyId, orderedImageIds }),
    setPrimaryPropertyImage: (propertyId, imageId) => action("set-primary-image", { propertyId, imageId }),
    addPropertyAmenity: (propertyId, amenity) => action("add-amenity", { propertyId, amenity }),
    removePropertyAmenity: (propertyId, amenityId) => action("remove-amenity", { propertyId, amenityId }),
    addPropertyTag: (propertyId, tag) => action("add-tag", { propertyId, tag }),
    removePropertyTag: (propertyId, tagId) => action("remove-tag", { propertyId, tagId }),
    replacePropertyBeds: (propertyId, beds) => action("replace-beds", { propertyId, beds }),
    updatePropertyPricing: (propertyId, pricing) => action("update-pricing", { propertyId, pricing }),
    getPropertySourceHistory: async (propertyId) => (await request({ query: { propertyId } })).property?.property_source_snapshots || [],
    signPropertyImageUpload: (values) => action("sign-upload", values),
  };
};
