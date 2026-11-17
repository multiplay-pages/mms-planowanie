"""Create deterministic gzip copies of large PUBLIC map build inputs for Git."""
import gzip
import hashlib
import json
import os
from pathlib import Path
from prepare_assets import ROOT, KNOWN_ASSETS, file_sha


def pack():
    entries = []
    for relative in sorted(KNOWN_ASSETS):
        source = ROOT / relative
        destination = source.with_suffix('.json.gz')
        temporary = destination.with_suffix('.gz.tmp')
        with source.open('rb') as stream, temporary.open('wb') as target:
            with gzip.GzipFile(filename='', fileobj=target, mode='wb', compresslevel=6, mtime=0) as compressed:
                for chunk in iter(lambda: stream.read(1_048_576), b''):
                    compressed.write(chunk)
        os.replace(temporary, destination)
        entries.append({'path': relative, 'archive': relative + '.gz', 'bytes': source.stat().st_size, 'sha256': file_sha(source), 'archiveBytes': destination.stat().st_size, 'archiveSha256': file_sha(destination)})
        print(f'Packed {relative}: {source.stat().st_size} -> {destination.stat().st_size} bytes.', flush=True)
    (ROOT / 'basemap/assets-manifest.json').write_text(json.dumps(entries, indent=2) + '\n', encoding='utf-8')
    return entries


if __name__ == '__main__':
    pack()
