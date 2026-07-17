# Cloudflare R2 property media

The admin uploads image bytes directly to R2 with a five-minute signed URL. R2 credentials remain inside the Netlify function; Supabase stores the public URL, object key, order, cover status, and alt text.

## Netlify environment variables

Set `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_BASE_URL`. The public base URL can be an R2 custom domain or the bucket's public `r2.dev` URL. Do not expose the access keys through a `VITE_` variable.

Keep Guesty as the public listing provider. Do not set `APP_DATA_PROVIDER_LISTINGS=supabase` for this fallback mode. The listings endpoint preserves Guesty images whenever they exist and reads `property_images` only when the matched Guesty listing has no usable image URL. Each property must therefore have its Guesty ID in `properties.guesty_id` or `properties.guesty_listing_id`.

Apply `supabase/migrations/20260716160000_property_media_admin.sql` to add the R2 object key and image alt-text columns.

## Bucket CORS

Direct browser uploads require an R2 CORS rule. In the bucket CORS settings, use the deployed admin origin and local Netlify development origin:

```json
[
  {
    "AllowedOrigins": [
      "https://admin.oneluxstay.com",
      "https://oneluxstay.com",
      "http://localhost:8888"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If the admin uses another production domain, add its exact origin. Redeploy Netlify after setting the environment variables.
