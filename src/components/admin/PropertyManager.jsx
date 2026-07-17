import { useEffect, useMemo, useState } from "react";
import { getAdminsOlsAuthHeaders } from "../../utils/adminsOlsAuth";
import "./PropertyManager.css";

const text = (value) => String(value ?? "");
const first = (rows) => (Array.isArray(rows) ? rows[0] : null) || {};
const sortImages = (rows) => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
  if (Boolean(a?.is_primary) !== Boolean(b?.is_primary)) return a?.is_primary ? -1 : 1;
  return Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
});
const toForm = (property = {}) => {
  const description = first(property.property_descriptions);
  return {
    id: property.id,
    name: text(property.name),
    title: text(description.title || property.name),
    description: text(description.description),
    property_code: text(property.property_code),
    address: text(property.address),
    city: text(property.city),
    country: text(property.country),
    room_type: text(property.room_type),
    bedrooms: text(property.bedrooms),
    bathrooms: text(property.bathrooms),
    accommodates: text(property.accommodates),
    size_sqm: text(property.size_sqm),
    status: text(property.status || "active"),
    has_wifi: Boolean(property.has_wifi),
    has_parking: Boolean(property.has_parking),
    has_balcony: Boolean(property.has_balcony),
    amenities: (property.property_amenities || []).map((item) => item.amenity).filter(Boolean).join(", "),
    tags: (property.property_tags || []).map((item) => item.tag).filter(Boolean).join(", "),
  };
};

export default function PropertyManager({ apiBase, session }) {
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(null);
  const [images, setImages] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const request = async (body) => {
    const response = await fetch(`${apiBase}/property-admin`, {
      method: body ? "POST" : "GET",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...getAdminsOlsAuthHeaders(session) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Property request failed.");
    return payload;
  };

  const load = async (preferredId = "") => {
    setLoading(true);
    try {
      const payload = await request();
      const rows = Array.isArray(payload.properties) ? payload.properties : [];
      setProperties(rows);
      const nextId = preferredId || selectedId || rows[0]?.id || "";
      setSelectedId(nextId);
      const selected = rows.find((item) => String(item.id) === String(nextId));
      setForm(selected ? toForm(selected) : null);
      setImages(sortImages(selected?.property_images));
      setNotice("");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return properties;
    return properties.filter((item) => [item.name, item.property_code, item.city, item.country]
      .some((value) => text(value).toLowerCase().includes(needle)));
  }, [properties, query]);

  const selectProperty = (id) => {
    setSelectedId(id);
    const selected = properties.find((item) => String(item.id) === String(id));
    setForm(selected ? toForm(selected) : null);
    setImages(sortImages(selected?.property_images));
    setNotice("");
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setNotice("");
    try {
      await request({ action: "save-property", property: {
        ...form,
        amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean),
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
      } });
      setNotice("Property information saved and published.");
      await load(form.id);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!form?.id || !files.length) return;
    setUploading(true);
    setNotice(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}…`);
    try {
      for (const [index, file] of files.entries()) {
        const signed = await request({
          action: "sign-upload", propertyId: form.id, fileName: file.name,
          contentType: file.type, size: file.size,
        });
        const uploaded = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=31536000, immutable" },
          body: file,
        });
        if (!uploaded.ok) throw new Error(`R2 upload failed for ${file.name}. Check the bucket CORS policy.`);
        await request({
          action: "save-image", propertyId: form.id, url: signed.publicUrl,
          objectKey: signed.objectKey, sortOrder: images.length + index, altText: form.title || form.name,
        });
      }
      setNotice("Images uploaded successfully.");
      await load(form.id);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploading(false);
    }
  };

  const persistImages = async (next) => {
    setImages(next);
    try {
      await request({ action: "update-images", propertyId: form.id, images: next });
      setNotice("Image order saved. The first image is now the cover.");
      await load(form.id);
    } catch (error) { setNotice(error.message); }
  };

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    persistImages(next);
  };

  const remove = async (image) => {
    if (!window.confirm("Remove this image from the property and R2?")) return;
    try {
      await request({ action: "delete-image", propertyId: form.id, imageId: image.id, objectKey: image.object_key });
      setNotice("Image removed.");
      await load(form.id);
    } catch (error) { setNotice(error.message); }
  };

  return (
    <div className="property-manager">
      <aside className="property-manager__sidebar">
        <label>Search properties<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, city or code" /></label>
        <div className="property-manager__list">
          {filtered.map((item) => (
            <button type="button" key={item.id} className={String(item.id) === String(selectedId) ? "is-active" : ""} onClick={() => selectProperty(item.id)}>
              <strong>{item.name || item.property_code || "Untitled property"}</strong>
              <span>{[item.city, item.country].filter(Boolean).join(", ")}</span>
            </button>
          ))}
          {!loading && !filtered.length && <p>No matching properties.</p>}
        </div>
      </aside>
      <main className="property-manager__editor">
        {loading && !form ? <p>Loading properties…</p> : null}
        {!loading && !form ? <p>No property records were found in Supabase.</p> : null}
        {form && <>
          <form onSubmit={save} className="property-manager__form">
            <div className="property-manager__heading"><div><h2>{form.name || "Property editor"}</h2><p>Changes feed the public listing pages.</p></div><button disabled={saving}>{saving ? "Saving…" : "Save property"}</button></div>
            <div className="property-manager__fields">
              <label>Internal name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Public title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label>Property code<input value={form.property_code} onChange={(e) => setForm({ ...form, property_code: e.target.value })} /></label>
              <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select></label>
              <label className="is-wide">Description<textarea rows="7" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label className="is-wide">Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              {[["city", "City"], ["country", "Country"], ["room_type", "Room type"], ["bedrooms", "Bedrooms"], ["bathrooms", "Bathrooms"], ["accommodates", "Max guests"], ["size_sqm", "Size (m²)"]].map(([key, label]) => <label key={key}>{label}<input type={["bedrooms", "bathrooms", "accommodates", "size_sqm"].includes(key) ? "number" : "text"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
              <label className="is-wide">Amenities (comma separated)<input value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} /></label>
              <label className="is-wide">Tags (comma separated)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
            </div>
            <div className="property-manager__checks">{[["has_wifi", "Wi-Fi"], ["has_parking", "Parking"], ["has_balcony", "Balcony"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> {label}</label>)}</div>
          </form>
          <section className="property-manager__media">
            <div className="property-manager__heading"><div><h3>Property images</h3><p>The first image is the cover. JPEG, PNG, WebP or AVIF; maximum 15 MB each.</p></div><label className="property-manager__upload">{uploading ? "Uploading…" : "Upload images"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={uploading} onChange={upload} /></label></div>
            <div className="property-manager__images">{images.map((image, index) => <article key={image.id || image.url}><div className="property-manager__thumb"><img src={image.url} alt={image.alt_text || form.title} loading="lazy" />{index === 0 && <span>Cover</span>}</div><input aria-label="Image alt text" value={image.alt_text || ""} placeholder="Describe this image" onChange={(e) => setImages((current) => current.map((item) => item === image ? { ...item, alt_text: e.target.value } : item))} onBlur={() => persistImages(images)} /><div><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>←</button><button type="button" onClick={() => move(index, 1)} disabled={index === images.length - 1}>→</button><button type="button" className="is-danger" onClick={() => remove(image)}>Remove</button></div></article>)}</div>
          </section>
          {notice && <p className="property-manager__notice" role="status">{notice}</p>}
        </>}
      </main>
    </div>
  );
}
