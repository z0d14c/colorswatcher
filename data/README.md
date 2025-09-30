# Color cache database

The `colors.sqlite` file is populated by `scripts/build-color-cache.mjs`. It caches
responses from https://www.thecolorapi.com for every hue/saturation/lightness
combination. The script is resumable and can be run multiple times – it only
requests colors that are missing from the database.

```
npm run cache:build
```

Environment variables are available to split the work into smaller batches:

- `COLOR_CACHE_HUE_START` / `COLOR_CACHE_HUE_END`
- `COLOR_CACHE_SATURATION_START` / `COLOR_CACHE_SATURATION_END`
- `COLOR_CACHE_LIGHTNESS_START` / `COLOR_CACHE_LIGHTNESS_END`
- `COLOR_CACHE_CONCURRENCY`
- `COLOR_CACHE_RETRY_LIMIT`

The application reads from this database when the “Cached SQLite database”
source is selected in the UI. If the file is missing, the UI automatically
falls back to the live API.
