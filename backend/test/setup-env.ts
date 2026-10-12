/**
 * Node test-runner preload. `backend/.env` sets NODE_ENV=production for live
 * deployments; the HTTP test suite instead forces the in-memory stores so tests
 * never need a running Mongo instance or write to production data.
 */
process.env.NODE_ENV = 'test'
process.env.USE_IN_MEMORY_STORES = 'true'
process.env.SEED_ON_BOOT = 'false'
// Legacy test clients read the access token from the login body. The cookie-only
// production profile is exercised by the security suite; the API suites need the
// body token so their `Bearer` calls keep working after the token→cookie migration.
process.env.ENABLE_BODY_TOKEN = 'true'