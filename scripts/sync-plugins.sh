#!/usr/bin/env bash
# Build the production plugin set from the working tree and install it into
# plugin-host/bundles/ (what the dev plugin-host loads; it hot-reloads changes).
# The production set = the plugin-host Dockerfile's COPY lines — the same list
# the image ships (a contract test keeps it equal to build:plugins + the index).
# Never touches plugin-host/community-bundles/.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "[sync-plugins] run npm install at the repo root" >&2
  exit 1
fi

npm run build:plugins --silent

ids=$(sed -n 's#.*COPY --from=bundles /build/plugins/\([^/]*\)/bundles/.*#\1#p' plugin-host/Dockerfile)
for id in $ids; do
  [ -f "plugins/$id/bundles/$id.js" ] || { echo "[sync-plugins] missing build output: $id" >&2; exit 1; }
done

mkdir -p plugin-host/bundles
rm -f plugin-host/bundles/*.js
for id in $ids; do cp "plugins/$id/bundles/$id.js" plugin-host/bundles/; done

echo "[sync-plugins] $(echo "$ids" | wc -w | tr -d ' ') bundles: $(echo $ids)"
