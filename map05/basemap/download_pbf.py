"""Download fixed public province files. No address catalog is read or sent.

Public Geofabrik snapshots replace unavailable Overpass queries. Network use is
explicit (--execute); complete files are reused only after published MD5 checks.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parent / 'public-pbf'
REGIONS = ['opolskie', 'slaskie', 'dolnoslaskie', 'wielkopolskie']
BASE = 'https://download.geofabrik.de/europe/poland/'


def digest(path, method):
    value = hashlib.new(method)
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1_048_576), b''):
            value.update(part)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--only', choices=REGIONS)
    args = parser.parse_args()
    regions = [args.only] if args.only else REGIONS
    if not args.execute:
        print(f'DRY RUN: {len(regions)} fixed public province snapshots; no private location data; 0 requests.')
        return
    ROOT.mkdir(exist_ok=True)
    manifest_path = ROOT / 'sources.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    for region in regions:
        filename = region + '-latest.osm.pbf'
        url = BASE + filename
        request = lambda target: urllib.request.Request(target, headers={'User-Agent': 'MMS-Local-Map/1.0 (public province snapshot, local-only processing)'})
        with urllib.request.urlopen(request(url + '.md5'), timeout=25) as response:
            checksum = response.read(1024).decode('ascii').split()[0].lower()
        if not re.fullmatch(r'[0-9a-f]{32}', checksum):
            raise ValueError('Unexpected published checksum.')
        destination = ROOT / filename
        if destination.exists():
            if digest(destination, 'md5') != checksum:
                raise ValueError('Local snapshot differs from current public version; retained without overwrite.')
            print(f'{region}: verified existing public snapshot.', flush=True)
            continue
        temporary = destination.with_suffix('.pbf.part')
        print(f'{region}: downloading fixed public map file, no order data.', flush=True)
        with urllib.request.urlopen(request(url), timeout=40) as response, temporary.open('wb') as stream:
            total, announced = 0, 0
            expected = int(response.headers.get('Content-Length', '0'))
            modified = response.headers.get('Last-Modified')
            while part := response.read(1_048_576):
                total += len(part)
                if total > 350_000_000:
                    raise ValueError('Province snapshot exceeds bounded file size.')
                stream.write(part)
                if total - announced >= 20_000_000:
                    print(f'{region}: {total // 1_000_000} MB received.', flush=True)
                    announced = total
        if expected and total != expected:
            raise ValueError('Incomplete public snapshot; not promoted to a complete file.')
        if digest(temporary, 'md5') != checksum:
            raise ValueError('Public snapshot checksum mismatch; file not used.')
        os.replace(temporary, destination)
        manifest[region] = {'url': url, 'filename': filename, 'bytes': total, 'md5': checksum, 'sha256': digest(destination, 'sha256'), 'lastModified': modified, 'retrievedAt': datetime.now(timezone.utc).isoformat()}
        temporary_manifest = manifest_path.with_suffix('.json.tmp')
        temporary_manifest.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        os.replace(temporary_manifest, manifest_path)
        print(f'{region}: checksum verified; saved locally.', flush=True)


if __name__ == '__main__':
    main()
