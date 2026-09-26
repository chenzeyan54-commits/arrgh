-- Spec 027: add the NovelFull.net Source (novelfull.net — same site as
-- novelfull.com on another domain, with a different catalog and template).
-- Existing installs only: no-op on an empty table (fresh installs are seeded
-- by `sources::DEFAULT_SOURCES`, which runs after migrations). base_url is
-- copied from an existing row — every bundled source shares the plugin-host
-- URL. Idempotent via NOT EXISTS.
INSERT INTO external_sources
    (id, name, base_url, api_key, content_types, enabled, created_at, is_community, priority, source_key, default_explicit)
SELECT
    lower(hex(randomblob(16))), 'NovelFull.net', (SELECT base_url FROM external_sources LIMIT 1), NULL,
    'novel', 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), 0, 45, 'novelfullnet', 0
WHERE EXISTS (SELECT 1 FROM external_sources)
  AND NOT EXISTS (SELECT 1 FROM external_sources WHERE source_key = 'novelfullnet');
