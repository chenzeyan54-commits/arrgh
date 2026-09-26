-- ADR 0034 (spec 019): restore the Royal Road Source that 0003 deleted.
-- ADR 0024 removed it because no metadata authority ever surfaced Royal Road
-- titles; Royal Road is now itself a novel authority, so that no longer holds.
-- Existing installs only: no-op on an empty table (fresh installs are seeded
-- by `sources::DEFAULT_SOURCES`, which runs after migrations). base_url is
-- copied from an existing row — every bundled source shares the plugin-host
-- URL. Idempotent via NOT EXISTS.
INSERT INTO external_sources
    (id, name, base_url, api_key, content_types, enabled, created_at, is_community, priority, source_key, default_explicit)
SELECT
    lower(hex(randomblob(16))), 'Royal Road', (SELECT base_url FROM external_sources LIMIT 1), NULL,
    'novel', 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), 0, 35, 'royalroad', 0
WHERE EXISTS (SELECT 1 FROM external_sources)
  AND NOT EXISTS (SELECT 1 FROM external_sources WHERE source_key = 'royalroad');
