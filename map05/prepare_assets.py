"""Restore the two byte-exact public OSM build inputs from tracked gzip files.

No downloads. Never overwrite a changed local file. Raw PBF download caches are
not needed to run, test or rebuild the delivered planner.
"""
import gzip
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KNOWN_ASSETS = {'basemap/regional-roads.json', 'basemap/planner-data.json'}


def file_sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def restore_asset(root, entry):
    if entry.get('path') not in KNOWN_ASSETS or entry.get('archive') != entry['path'] + '.gz' or not isinstance(entry.get('bytes'), int) or not 0 < entry['bytes'] <= 250_000_000:
        raise ValueError('Asset path or size is outside the fixed public asset contract.')
    root = Path(root).resolve()
    target, archive = root / entry['path'], root / entry['archive']
    if not target.resolve().is_relative_to(root) or not archive.resolve().is_relative_to(root):
        raise ValueError('Asset paths must remain within the project.')
    if target.exists():
        if target.stat().st_size != entry['bytes'] or file_sha(target) != entry['sha256']:
            raise ValueError('Changed local build asset retained; review it before restoring.')
        return
    if file_sha(archive) != entry['archiveSha256']:
        raise ValueError('Compressed asset checksum mismatch.')
    temporary = target.with_suffix(target.suffix + '.tmp')
    total, digest = 0, hashlib.sha256()
    with gzip.open(archive, 'rb') as source, temporary.open('wb') as destination:
        while chunk := source.read(1_048_576):
            total += len(chunk)
            if total > entry['bytes']:
                raise ValueError('Decompressed asset exceeds the declared size.')
            digest.update(chunk)
            destination.write(chunk)
    if total != entry['bytes'] or digest.hexdigest() != entry['sha256']:
        raise ValueError('Restored asset checksum mismatch.')
    os.replace(temporary, target)


def prepare_assets():
    entries = json.loads((ROOT / 'basemap/assets-manifest.json').read_text(encoding='utf-8'))
    if len(entries) != len(KNOWN_ASSETS) or {entry.get('path') for entry in entries} != KNOWN_ASSETS:
        raise ValueError('Unexpected public build asset manifest.')
    for entry in entries:
        restore_asset(ROOT, entry)
    print('Public build assets verified/restored locally; no downloads.')


if __name__ == '__main__':
    prepare_assets()
