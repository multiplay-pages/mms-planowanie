"""Copy the pinned MapLibre GL JS distribution into map05/vendor and record hashes.

Run only after `npm ci` in map05 when deliberately updating the vendored copy.
`--check` verifies the committed copy without node_modules or network access.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'node_modules' / 'maplibre-gl'
TARGET = ROOT / 'vendor' / 'maplibre-gl'
FILES = ['dist/maplibre-gl.mjs', 'dist/maplibre-gl-worker.mjs', 'dist/maplibre-gl.css', 'LICENSE.txt']
MANIFEST = TARGET / 'MANIFEST.json'
LICENSES = TARGET / 'THIRD-PARTY-LICENSES.txt'
# Runtime dependencies bundled into maplibre-gl.mjs / maplibre-gl-worker.mjs (see THIRD-PARTY-NOTICES.md).
BUNDLED = ['@mapbox/point-geometry', '@mapbox/tiny-sdf', '@mapbox/unitbezier', '@mapbox/vector-tile', '@maplibre/geojson-vt',
           '@maplibre/maplibre-gl-style-spec', '@maplibre/mlt', '@maplibre/vt-pbf', '@types/geojson', 'bidi-js', 'earcut', 'gl-matrix',
           'kdbush', 'murmurhash-js', 'pbf', 'potpack', 'quickselect', 'tinyqueue', 'zustand']


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def license_from_readme(folder):
    """Returns the README's License section when it contains a copyright notice, else None."""
    readme = folder / 'README.md'
    if not readme.is_file():
        return None
    lines = readme.read_text(encoding='utf-8').replace('\r\n', '\n').split('\n')
    start = next((i for i, line in enumerate(lines) if re.match(r'^#+\s*licen[sc]e\b', line, re.I)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if re.match(r'^#+\s', lines[i])), len(lines))
    section = '\n'.join(lines[start:end]).strip()
    return section if re.search(r'copyright', section, re.I) else None


def collect_licenses():
    """Full license texts of the bundled dependencies, read from node_modules, in a deterministic order."""
    parts = ['Third-party licenses for the vendored MapLibre GL JS bundle.\nThe MapLibre GL JS license itself is in LICENSE.txt.\n']
    for name in BUNDLED:
        folder = ROOT / 'node_modules' / Path(name)
        meta = json.loads((folder / 'package.json').read_text(encoding='utf-8'))
        found = sorted(path for path in folder.iterdir() if path.is_file() and path.name.lower().split('.')[0] in ('license', 'licence', 'copying'))
        if found:
            text = found[0].read_text(encoding='utf-8').replace('\r\n', '\n').strip()
        elif (readme_text := license_from_readme(folder)):
            # Some packages only carry the license text in the README ("## License" section).
            text = readme_text
        else:
            # No license file is shipped in the package; the notice follows package.json (declared license and author).
            author = meta.get('author')
            author = author.get('name') if isinstance(author, dict) else author
            text = f'No license file is distributed with this package. package.json declares license {meta.get("license")} and author {author}.'
        parts.append(f'\n{"=" * 78}\n{name} {meta["version"]} ({meta.get("license")})\n{"=" * 78}\n{text}\n')
    LICENSES.write_text(''.join(parts), encoding='utf-8', newline='\n')


def vendor():
    version = json.loads((SOURCE / 'package.json').read_text(encoding='utf-8'))['version']
    TARGET.mkdir(parents=True, exist_ok=True)
    collect_licenses()
    files = {}
    for name in FILES:
        target = TARGET / Path(name).name
        shutil.copyfile(SOURCE / name, target)
        files[target.name] = {'sha256': sha256(target), 'bytes': target.stat().st_size}
    files[LICENSES.name] = {'sha256': sha256(LICENSES), 'bytes': LICENSES.stat().st_size}
    MANIFEST.write_text(json.dumps({'package': 'maplibre-gl', 'version': version, 'license': 'BSD-3-Clause', 'source': 'npm registry, maplibre-gl@' + version, 'files': files}, indent=2) + '\n', encoding='utf-8')
    print(f'Vendored maplibre-gl {version}: {", ".join(files)}')


def check():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for name, meta in manifest['files'].items():
        if sha256(TARGET / name) != meta['sha256']:
            raise SystemExit(f'Vendored file changed: {name}')
    print(f'Vendored maplibre-gl {manifest["version"]} verified ({len(manifest["files"])} files).')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    check() if parser.parse_args().check else vendor()
