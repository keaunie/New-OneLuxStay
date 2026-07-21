import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPropertyService } from "../../services/propertyService";
import "./PropertyManager.css";

const PAGE_SIZE = 25;
const TABS = ["Overview", "Location", "Descriptions", "Amenities", "Beds & capacity", "Pricing", "Images", "Integration", "Source history"];
const text = (value) => String(value ?? "");
const first = (rows) => (Array.isArray(rows) ? rows[0] : null) || {};
const date = (value) => value ? new Date(value).toLocaleString() : "—";
const imageUrl = (image) => image?.public_url || image?.url || image?.original_source_url || "";
const uniqueValues = (rows, key) => {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const normalized = text(row[key]).trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized); return true;
  });
};
const propertyForm = (property = {}) => Object.fromEntries([
  "id", "property_code", "guesty_listing_id", "guesty_listing_type", "parent_property_id", "name", "slug", "property_type",
  "room_type", "website_status", "status", "content_sync_mode", "source_system", "address", "city", "country", "latitude",
  "longitude", "timezone", "accommodates", "bedrooms", "bathrooms", "beds", "bed_type", "min_nights", "max_nights", "size_sqm",
].map((key) => [key, text(property[key])]).concat([["has_balcony", Boolean(property.has_balcony)], ["has_parking", Boolean(property.has_parking)], ["has_wifi", Boolean(property.has_wifi)]]));
const descriptionForm = (property = {}) => {
  const row = first(property.property_descriptions);
  const keys = ["language", "title", "summary", "description", "space", "access", "interaction_with_guests", "notes", "neighborhood", "transit", "house_rules"];
  return Object.fromEntries(keys.map((key) => [key, text(row[key] || (key === "language" ? "en" : ""))]));
};
const pricingForm = (property = {}) => {
  const row = first(property.property_pricing);
  const keys = ["base_price", "currency", "cleaning_fee", "security_deposit", "extra_guest_fee"];
  return Object.fromEntries(keys.map((key) => [key, text(row[key] ?? (key === "currency" ? "USD" : ""))]));
};
const validate = (form) => {
  if (!form.name.trim()) return "Property name is required.";
  if (Number(form.accommodates) < 1) return "Maximum guests must be at least 1.";
  for (const key of ["bedrooms", "bathrooms", "beds"]) if (form[key] !== "" && Number(form[key]) < 0) return `${key} cannot be negative.`;
  if (form.min_nights !== "" && Number(form.min_nights) <= 0) return "Minimum nights must be greater than zero.";
  if (form.max_nights !== "" && Number(form.max_nights) < Number(form.min_nights || 0)) return "Maximum nights cannot be less than minimum nights.";
  if (form.parent_property_id && form.parent_property_id === form.id) return "A property cannot be its own parent.";
  return "";
};

export default function PropertyManager({ apiBase, session, standalone = false }) {
  const params = useParams(); const navigate = useNavigate();
  const service = useMemo(() => createPropertyService({ apiBase, session }), [apiBase, session]);
  const [rows, setRows] = useState([]); const [count, setCount] = useState(0); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ city: "", country: "", status: "", website_status: "", source_system: "", room_type: "", sort: "updated_at", direction: "desc" });
  const [selectedId, setSelectedId] = useState(params.propertyId || ""); const [property, setProperty] = useState(null);
  const [form, setForm] = useState(null); const [description, setDescription] = useState(null); const [pricing, setPricing] = useState(null);
  const [images, setImages] = useState([]); const [beds, setBeds] = useState([]); const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  const [newAmenity, setNewAmenity] = useState(""); const [newTag, setNewTag] = useState(""); const [imagePage, setImagePage] = useState(1);

  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await service.getProperties({ page, pageSize: PAGE_SIZE, search: debouncedSearch, ...filters }); setRows(result.properties || []); setCount(result.count || 0); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [service, page, debouncedSearch, filters]);
  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setProperty(null); setForm(null); return; }
    setDetailLoading(true); setError("");
    try {
      const result = await service.getPropertyById(id); const item = result.property;
      setProperty(item); setForm(propertyForm(item)); setDescription(descriptionForm(item)); setPricing(pricingForm(item));
      setImages([...(item.property_images || [])].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)));
      setBeds([...(item.property_beds || [])].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)));
      setDirty(false); setImagePage(1);
    } catch (err) { setError(err.message); setProperty(null); } finally { setDetailLoading(false); }
  }, [service]);
  useEffect(() => { const id = params.propertyId || selectedId; if (id) { setSelectedId(id); loadDetail(id); } }, [params.propertyId, selectedId, loadDetail]);

  const choose = (id) => {
    if (dirty && !window.confirm("Discard your unsaved property changes?")) return;
    setNotice(""); setSelectedId(id);
    if (standalone) navigate(`/admin/properties/${id}`);
  };
  const mutateForm = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setDirty(true); };
  const run = async (operation, success) => {
    setSaving(true); setError(""); setNotice("");
    try { await operation(); setNotice(success); await loadDetail(selectedId); await loadList(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const saveProperty = () => {
    const problem = validate(form); if (problem) { setError(problem); return; }
    run(() => service.updateProperty(selectedId, form), "Property saved successfully.");
  };
  const saveDescription = () => run(() => service.updatePropertyDescription(selectedId, description.language, description), "Description saved successfully.");
  const savePricing = () => run(() => service.updatePropertyPricing(selectedId, pricing), "Pricing saved successfully.");
  const saveBeds = () => run(() => service.replacePropertyBeds(selectedId, beds), "Bed arrangements saved successfully.");
  const addValue = (type) => {
    const isAmenity = type === "amenity"; const value = isAmenity ? newAmenity : newTag;
    run(() => isAmenity ? service.addPropertyAmenity(selectedId, value) : service.addPropertyTag(selectedId, value), `${isAmenity ? "Amenity" : "Tag"} added.`);
    isAmenity ? setNewAmenity("") : setNewTag("");
  };
  const removeValue = (type, id) => run(() => type === "amenity" ? service.removePropertyAmenity(selectedId, id) : service.removePropertyTag(selectedId, id), `${type === "amenity" ? "Amenity" : "Tag"} removed.`);
  const moveImage = (index, direction) => {
    const target = index + direction; if (target < 0 || target >= images.length) return;
    const next = [...images]; [next[index], next[target]] = [next[target], next[index]]; setImages(next);
    run(() => service.reorderPropertyImages(selectedId, next.map((item) => item.id)), "Image order saved.");
  };
  const removeImage = (image) => {
    if (!window.confirm("Remove this image metadata? The R2 object, if any, will not be deleted.")) return;
    run(() => service.deletePropertyImage(selectedId, image.id), "Image metadata removed. No R2 object was deleted.");
  };
  const upload = async (event) => {
    const files = [...(event.target.files || [])]; event.target.value = ""; if (!files.length) return;
    setSaving(true); setError("");
    try {
      for (const [index, file] of files.entries()) {
        const signed = await service.signPropertyImageUpload({ propertyId: selectedId, fileName: file.name, contentType: file.type, size: file.size });
        const response = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error(`R2 upload failed for ${file.name}.`);
        await service.addPropertyImage(selectedId, { publicUrl: signed.publicUrl, url: signed.publicUrl, objectKey: signed.objectKey, mimeType: file.type, sortOrder: images.length + index, altText: description?.title || form.name });
      }
      setNotice("Images uploaded and verified."); await loadDetail(selectedId);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const cities = useMemo(() => [...new Set(rows.map((row) => row.city).filter(Boolean))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map((row) => row.country).filter(Boolean))].sort(), [rows]);
  const migration = useMemo(() => images.reduce((out, item) => { out.total += 1; out[item.migration_status] = (out[item.migration_status] || 0) + 1; return out; }, { total: 0, pending: 0, copying: 0, verified: 0, failed: 0 }), [images]);
  const shownImages = images.slice(0, imagePage * 24);
  const renderFields = (fields) => <div className="pm-fields">{fields.map(({ key, label, type = "text", options }) => <label key={key}>{label}{options ? <select value={form[key]} onChange={(e) => mutateForm(key, e.target.value)}><option value="">Select…</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={type} value={form[key]} min={type === "number" ? 0 : undefined} onChange={(e) => mutateForm(key, e.target.value)} />}</label>)}</div>;

  return <div className={`property-manager ${standalone ? "is-standalone" : ""}`}>
    <aside className="pm-sidebar">
      <div className="pm-sidebar-head"><h2>Properties</h2><span>{count || rows.length} total</span></div>
      <input aria-label="Search properties" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, name, Guesty ID, location…" />
      <div className="pm-filter-grid">
        <select aria-label="City filter" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}><option value="">All cities</option>{cities.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Country filter" value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}><option value="">All countries</option>{countries.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All operations</option>{["active", "maintenance", "inactive", "archived"].map((v) => <option key={v}>{v}</option>)}</select>
        <select value={filters.website_status} onChange={(e) => setFilters({ ...filters, website_status: e.target.value })}><option value="">All website states</option>{["published", "hidden", "draft", "archived"].map((v) => <option key={v}>{v}</option>)}</select>
        <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="updated_at">Recently updated</option><option value="name">Name</option><option value="property_code">Property code</option><option value="location">Location</option><option value="last_synced_at">Last synced</option></select>
      </div>
      <div className="pm-list">{loading ? <p>Loading properties…</p> : rows.map((item) => {
        const primary = (item.property_images || []).find((image) => image.is_primary) || item.property_images?.[0];
        return <button type="button" key={item.id} className={item.id === selectedId ? "is-active" : ""} onClick={() => choose(item.id)}>{imageUrl(primary) ? <img src={imageUrl(primary)} alt="" loading="lazy" /> : <span className="pm-placeholder">OLS</span>}<span><strong>{item.property_code || item.name || "Untitled"}</strong><small>{first(item.property_descriptions).title || item.name}</small><small>{[item.city, item.country].filter(Boolean).join(", ") || "Location not set"}</small><em>{item.website_status} · {item.status}</em></span></button>;
      })}</div>
      {!loading && !rows.length && <p className="pm-empty">No properties match these filters.</p>}
      <div className="pm-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={rows.length < PAGE_SIZE || page * PAGE_SIZE >= count} onClick={() => setPage(page + 1)}>Next</button></div>
    </aside>
    <main className="pm-editor">
      {error && <div className="pm-alert is-error" role="alert">{error}</div>}{notice && <div className="pm-alert" role="status">{notice}</div>}
      {!selectedId && !detailLoading && <div className="pm-empty pm-empty-large"><h2>Select a property</h2><p>Choose a property to edit its content and migration metadata.</p></div>}
      {detailLoading && <p>Loading property…</p>}
      {property && form && !detailLoading && <>
        <header className="pm-heading"><div><button type="button" className="pm-back" onClick={() => standalone ? navigate("/admin/properties") : setSelectedId("")}>← All properties</button><h1>{form.name || "Untitled property"}</h1><p><code>{property.id}</code> · Updated {date(property.updated_at)}</p></div><button disabled={saving} onClick={saveProperty}>{saving ? "Saving…" : "Save property"}</button></header>
        {property.partialErrors?.length > 0 && <div className="pm-alert is-warning">Partial data unavailable: {property.partialErrors.join(", ")}.</div>}
        <nav className="pm-tabs">{TABS.map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <section className="pm-panel">
          {tab === "Overview" && <>{renderFields([{ key: "property_code", label: "OneLuxStay property code" }, { key: "guesty_listing_id", label: "Guesty listing ID" }, { key: "guesty_listing_type", label: "Guesty listing type" }, { key: "parent_property_id", label: "Parent property UUID" }, { key: "name", label: "Property name" }, { key: "slug", label: "Slug" }, { key: "property_type", label: "Property type" }, { key: "room_type", label: "Room / unit type" }, { key: "website_status", label: "Website status", options: ["published", "hidden", "draft", "archived"] }, { key: "status", label: "Operational status", options: ["active", "maintenance", "inactive", "archived"] }, { key: "content_sync_mode", label: "Content sync mode", options: ["manual", "guesty", "hybrid"] }, { key: "source_system", label: "Source system" }])}<button disabled={saving} onClick={saveProperty}>Save overview</button></>}
          {tab === "Location" && <>{renderFields([{ key: "address", label: "Full address" }, { key: "city", label: "City" }, { key: "country", label: "Country" }, { key: "latitude", label: "Latitude", type: "number" }, { key: "longitude", label: "Longitude", type: "number" }, { key: "timezone", label: "Timezone" }])}<button disabled={saving} onClick={saveProperty}>Save location</button></>}
          {tab === "Descriptions" && <><div className="pm-fields"><label>Language<input value={description.language} onChange={(e) => { setDescription({ ...description, language: e.target.value }); setDirty(true); }} /></label><label>Website title<input value={description.title} onChange={(e) => { setDescription({ ...description, title: e.target.value }); setDirty(true); }} /></label>{["summary", "description", "space", "access", "interaction_with_guests", "notes", "neighborhood", "transit", "house_rules"].map((key) => <label className="is-wide" key={key}>{key.replaceAll("_", " ")}<textarea rows="4" value={description[key]} onChange={(e) => { setDescription({ ...description, [key]: e.target.value }); setDirty(true); }} /></label>)}</div><button disabled={saving} onClick={saveDescription}>Save description</button></>}
          {tab === "Amenities" && <div className="pm-columns">{[["amenity", uniqueValues(property.property_amenities, "amenity"), newAmenity, setNewAmenity], ["tag", uniqueValues(property.property_tags, "tag"), newTag, setNewTag]].map(([type, values, value, setter]) => <div key={type}><h3>{type === "amenity" ? "Amenities" : "Tags"}</h3><div className="pm-add"><input value={value} onChange={(e) => setter(e.target.value)} placeholder={`Add ${type}`} /><button disabled={!value.trim() || saving} onClick={() => addValue(type)}>Add</button></div><div className="pm-chips">{values.map((item) => <span key={item.id}>{item[type]}<button aria-label={`Remove ${item[type]}`} onClick={() => removeValue(type, item.id)}>×</button></span>)}</div>{!values.length && <p className="pm-empty">No {type}s added.</p>}</div>)}</div>}
          {tab === "Beds & capacity" && <>{renderFields([{ key: "accommodates", label: "Maximum guests", type: "number" }, { key: "bedrooms", label: "Bedrooms", type: "number" }, { key: "bathrooms", label: "Bathrooms", type: "number" }, { key: "beds", label: "Total beds", type: "number" }, { key: "bed_type", label: "General bed type" }, { key: "min_nights", label: "Minimum nights", type: "number" }, { key: "max_nights", label: "Maximum nights", type: "number" }, { key: "size_sqm", label: "Property size (m²)", type: "number" }])}<div className="pm-checks">{[["has_balcony", "Balcony"], ["has_parking", "Parking"], ["has_wifi", "Wi-Fi"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={(e) => mutateForm(key, e.target.checked)} />{label}</label>)}</div><h3>Bed arrangements</h3>{beds.map((bed, index) => <div className="pm-bed" key={bed.id || index}><input placeholder="Room name" value={bed.room_name || ""} onChange={(e) => { const next = [...beds]; next[index] = { ...bed, room_name: e.target.value }; setBeds(next); setDirty(true); }} /><input placeholder="Bed type" value={bed.bed_type || ""} onChange={(e) => { const next = [...beds]; next[index] = { ...bed, bed_type: e.target.value }; setBeds(next); setDirty(true); }} /><input type="number" min="1" value={bed.quantity ?? 1} onChange={(e) => { const next = [...beds]; next[index] = { ...bed, quantity: e.target.value }; setBeds(next); setDirty(true); }} /><input value={bed.source_text || ""} readOnly title="Original source text" /><button onClick={() => { setBeds(beds.filter((_, i) => i !== index)); setDirty(true); }}>Remove</button></div>)}<div className="pm-actions"><button onClick={() => { setBeds([...beds, { room_name: "", bed_type: "", quantity: 1, source_text: "" }]); setDirty(true); }}>Add bed row</button><button onClick={saveBeds} disabled={saving}>Save beds</button><button onClick={saveProperty} disabled={saving}>Save capacity</button></div></>}
          {tab === "Pricing" && <><div className="pm-fields">{["base_price", "cleaning_fee", "security_deposit", "extra_guest_fee"].map((key) => <label key={key}>{key.replaceAll("_", " ")}<input type="number" min="0" step="0.01" inputMode="decimal" value={pricing[key]} onChange={(e) => { setPricing({ ...pricing, [key]: e.target.value }); setDirty(true); }} /></label>)}<label>Currency<input maxLength="3" value={pricing.currency} onChange={(e) => { setPricing({ ...pricing, currency: e.target.value.toUpperCase() }); setDirty(true); }} /></label></div><p className="pm-help">Amounts are sent as decimal strings and stored by PostgreSQL numeric columns; browser floating-point arithmetic is not used.</p><button disabled={saving} onClick={savePricing}>Save pricing</button></>}
          {tab === "Images" && <><div className="pm-section-head"><div><h3>Images ({images.length})</h3><p>R2/public URL → imported URL → original Guesty URL. Deletion removes metadata only.</p></div><label className="pm-upload">Upload to R2<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload} /></label></div><div className="pm-gallery">{shownImages.map((image, index) => <article key={image.id}><div className="pm-image">{imageUrl(image) ? <img src={imageUrl(image)} alt={image.alt_text || "Property"} loading="lazy" /> : <span>No image</span>}<em className={`is-${image.migration_status}`}>{image.migration_status}</em>{image.is_primary && <strong>Primary</strong>}</div><input placeholder="Alt text" value={image.alt_text || ""} onChange={(e) => setImages(images.map((item) => item.id === image.id ? { ...item, alt_text: e.target.value } : item))} onBlur={(e) => run(() => service.updatePropertyImage(selectedId, image.id, { alt_text: e.target.value }), "Image text saved.")} /><small>{image.width && image.height ? `${image.width}×${image.height}` : "Dimensions unknown"} · {image.mime_type || "Unknown type"}</small>{image.migration_error && <small className="is-error">{image.migration_error}</small>}<div className="pm-actions"><button disabled={index === 0} onClick={() => moveImage(index, -1)}>←</button><button disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}>→</button><button disabled={image.is_primary} onClick={() => run(() => service.setPrimaryPropertyImage(selectedId, image.id), "Primary image updated.")}>Primary</button><button className="is-danger" onClick={() => removeImage(image)}>Remove</button></div></article>)}</div>{shownImages.length < images.length && <button onClick={() => setImagePage(imagePage + 1)}>Show 24 more</button>}{!images.length && <p className="pm-empty">No images for this property.</p>}</>}
          {tab === "Integration" && <><div className="pm-metrics">{Object.entries(migration).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key}</span></div>)}</div><dl className="pm-details"><dt>Guesty listing ID</dt><dd>{property.guesty_listing_id || "—"}</dd><dt>Source system</dt><dd>{property.source_system}</dd><dt>Content sync mode</dt><dd>{property.content_sync_mode}</dd><dt>Last synced</dt><dd>{date(property.last_synced_at)}</dd><dt>Source updated</dt><dd>{date(property.source_updated_at)}</dd><dt>Listing bridge</dt><dd>{property.listings?.map((item) => item.id).join(", ") || "Not linked"}</dd></dl><div className="pm-alert is-warning">R2 migration requires a future trusted backend endpoint. This panel does not claim pending images were migrated.</div></>}
          {tab === "Source history" && <><h3>Read-only source snapshots</h3>{(property.property_source_snapshots || []).map((snapshot) => <details key={snapshot.id}><summary>{snapshot.provider} · {snapshot.external_listing_id} · {date(snapshot.captured_at)}</summary><p>Payload hash: <code>{snapshot.payload_hash}</code></p><p>Raw payload is intentionally not loaded by default.</p></details>)}{!property.property_source_snapshots?.length && <p className="pm-empty">No source snapshots found.</p>}</>}
        </section>
      </>}
    </main>
  </div>;
}
