# Color cache database

The `colors.sqlite` file is populated by `scripts/build-color-cache.mjs`. It
mirrors the app’s adaptive hue segmentation algorithm so that the same
binary-search-style sampler the UI uses is replayed offline. For each
saturation/lightness pair, the script walks the hue range with divide-and-conquer
queries, caching every response from https://www.thecolorapi.com that the UI
would ever request. Because the offline job and the UI share the same sampling
logic, once the cache has been built there should be no cache misses when the UI
is switched to the database-backed mode. The job is resumable: existing rows are
reused, so restarting the script only issues network requests for hues that
still need to be cached.

```
npm run cache:build
```

Environment variables are available to split the work into smaller batches:

- `COLOR_CACHE_SATURATION_START` / `COLOR_CACHE_SATURATION_END`
- `COLOR_CACHE_LIGHTNESS_START` / `COLOR_CACHE_LIGHTNESS_END`
- `COLOR_CACHE_CONCURRENCY`
- `COLOR_CACHE_RETRY_LIMIT`

The application reads from this database when the “Cached SQLite database”
source is selected in the UI. If the file is missing, the UI automatically
falls back to the live API.
