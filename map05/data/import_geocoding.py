"""Validate a local Geoapify Online CSV. Never contacts the provider or edits XLSX.

Original inputs identify records; row order is deliberately irrelevant. Accepted
coordinates live in a separate layer, so address/order IDs and saved plans survive.
"""
import argparse
from collections import Counter
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_COLUMNS = {
    'original_address', 'lat', 'lon', 'formatted', 'housenumber', 'street',
    'postcode', 'city', 'country_code', 'confidence', 'confidence_city_level',
    'confidence_street_level', 'confidence_building_level', 'attribution',
    'attribution_license', 'attribution_url',
}
REASON_LABELS = {
    'COORDINATES_INVALID': 'Brak poprawnego punktu w granicach obszaru Polski',
    'COUNTRY_MISMATCH': 'Kraj wyniku różni się od Polski',
    'BUILDING_MISMATCH': 'Numer budynku jest niepełny, różny lub nie został zwrócony',
    'CITY_MISMATCH': 'Miejscowość wyniku różni się od wejściowej',
    'POSTCODE_MISMATCH': 'Kod pocztowy jest inny lub nie został zwrócony',
    'STREET_MISMATCH': 'Nazwa ulicy nie jest identyczna po usunięciu prefiksu ul./ulica',
    'LOW_CONFIDENCE': 'Ogólna pewność wyniku jest mniejsza niż 0,95 lub nie została podana',
    'CITY_CONFIDENCE': 'Pewność miejscowości jest mniejsza niż 0,95 lub nie została podana',
    'STREET_CONFIDENCE': 'Pewność ulicy jest mniejsza niż 0,95 lub nie została podana',
    'BUILDING_CONFIDENCE': 'Pewność budynku jest mniejsza niż 0,95 lub nie została podana',
}


def clean(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(value or ''))).strip()


def normalized(value):
    return clean(value).casefold()


def street_key(value):
    return re.sub(r'^(ul\.?|ulica)\s+', '', normalized(value))


def input_text(address):
    return f"{address['postcode']} {address['city']}, {address['street'] + ' ' if address['street'] else ''}{address['building']}, Polska".strip()


def number(value, confidence=False):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(result) or (confidence and not 0 <= result <= 1):
        return None
    return result


def assess_result(address, row):
    lon, lat = number(row.get('lon')), number(row.get('lat'))
    # This broad bounding box is only a sanity check, not an administrative proof.
    coordinates = [lon, lat] if lon is not None and lat is not None and 14 <= lon <= 24.5 and 49 <= lat <= 55 else None
    confidence = {key: number(row.get(column), confidence=True) for key, column in [
        ('overall', 'confidence'), ('city', 'confidence_city_level'),
        ('street', 'confidence_street_level'), ('building', 'confidence_building_level')]}
    reasons = []
    if coordinates is None:
        reasons.append('COORDINATES_INVALID')
    if normalized(row.get('country_code')) != 'pl':
        reasons.append('COUNTRY_MISMATCH')
    if normalized(address['building']) != normalized(row.get('housenumber')):
        reasons.append('BUILDING_MISMATCH')
    if normalized(address['city']) != normalized(row.get('city')):
        reasons.append('CITY_MISMATCH')
    if normalized(address['postcode']) != normalized(row.get('postcode')):
        reasons.append('POSTCODE_MISMATCH')
    if address['street'] and street_key(address['street']) != street_key(row.get('street')):
        reasons.append('STREET_MISMATCH')
    for key, code in [('overall', 'LOW_CONFIDENCE'), ('city', 'CITY_CONFIDENCE'), ('building', 'BUILDING_CONFIDENCE')]:
        if confidence[key] is None or confidence[key] < .95:
            reasons.append(code)
    if address['street'] and (confidence['street'] is None or confidence['street'] < .95):
        reasons.append('STREET_CONFIDENCE')
    accepted = not reasons
    return {
        'addressId': address['id'],
        'status': 'MATCHED_BUILDING' if accepted else 'REVIEW_REQUIRED',
        'coordinates': coordinates if accepted else None,
        'reasons': reasons,
        'candidate': {
            'coordinates': coordinates,
            **{key: clean(row.get(key)) for key in ['formatted', 'housenumber', 'street', 'city', 'postcode', 'country_code', 'attribution', 'attribution_license', 'attribution_url']},
            'confidence': confidence,
        },
    }


def build_layer(dataset, csv_data, filename):
    if dataset.get('schemaVersion') != 1 or not dataset.get('addresses'):
        raise ValueError('Nieprawidłowy katalog adresów.')
    if not isinstance(csv_data, bytes) or len(csv_data) > 2_000_000:
        raise ValueError('Nieprawidłowy plik wynikowy (limit 2 MB).')
    reader = csv.DictReader(io.StringIO(csv_data.decode('utf-8-sig'), newline=''), strict=True)
    columns = reader.fieldnames or []
    if len(set(columns)) != len(columns) or not REQUIRED_COLUMNS.issubset(columns):
        raise ValueError('Brak wymaganych kolumn Geoapify lub powtórzone nagłówki.')
    rows = list(reader)
    expected = {normalized(input_text(address)): address for address in dataset['addresses']}
    if len(rows) != len(expected):
        raise ValueError(f"Oczekiwano dokładnie {len(expected)} wyników wejściowych; otrzymano {len(rows)}.")
    found = {}
    for row in rows:
        if None in row or any(value is None or len(value) > 6000 for value in row.values()):
            raise ValueError('Nieprawidłowa liczba kolumn lub zbyt długa wartość CSV.')
        key = normalized(row['original_address'])
        if key not in expected:
            raise ValueError('Wynik zawiera nieznany adres wejściowy; import przerwany.')
        if key in found:
            raise ValueError('Wynik zawiera powtórzony adres wejściowy; import przerwany.')
        found[key] = row
    records = [assess_result(address, found[normalized(input_text(address))]) for address in dataset['addresses']]
    matched = sum(record['status'] == 'MATCHED_BUILDING' for record in records)
    return {
        'schemaVersion': 1, 'datasetId': dataset['source']['sha256'],
        'source': {'provider': 'Geoapify', 'method': 'online-tool', 'filename': Path(filename).name,
                   'sha256': hashlib.sha256(csv_data).hexdigest(),
                   'url': 'https://www.geoapify.com/tools/geocoding-online/'},
        'policy': {'version': 1, 'minimumConfidence': .95, 'streetMatch': 'exact-after-ul-prefix',
                   'independentlyVerified': False},
        'summary': {'total': len(records), 'matched': matched, 'review': len(records) - matched,
                    'candidateCoordinates': sum(record['candidate']['coordinates'] is not None for record in records),
                    'reasons': dict(Counter(reason for record in records for reason in record['reasons']))},
        'records': records,
    }


def report_markdown(dataset, layer):
    safe = lambda text: html.escape(str(text)).replace('|', '\\|').replace('\n', ' ')
    summary = layer['summary']
    lines = [
        '# Wyniki Geoapify — ocena lokalna', '',
        f"Źródło CSV: `{layer['source']['filename']}`; SHA256 `{layer['source']['sha256']}`.",
        f"Katalog adresowy / datasetId: `{layer['datasetId']}`. XLSX i CSV pozostawiono bez zmian.", '',
        f"- Rozliczono: **{summary['total']} / {len(dataset['addresses'])}** wejść, po `original_address`, nie po kolejności.",
        f"- Zgodne dopasowania budynków: **{summary['matched']}** — te punkty trafiają na mapę.",
        f"- Do weryfikacji: **{summary['review']}** — współrzędne kandydata zachowano, ale nie użyto jako pewnego punktu.", '',
        'Warunki: zgodny kraj, numer budynku (łącznie z literą), miejscowość, kod pocztowy i nazwa ulicy po usunięciu prefiksu ul./ulica; confidence ogólny, miejscowości, budynku i wymaganej ulicy ≥ 0,95. Brak confidence budynku nie jest zastępowany confidence ogólnym. Rozwinięcia patronów ulic pozostają do sprawdzenia, bez niejawnych aliasów.', '',
        'To automatyczna kontrola zgodności odpowiedzi dostawcy, nie niezależne potwierdzenie fizycznej lokalizacji, zasięgu sieci ani wykonalności trasy. Nie wykonano ponownego geokodowania, routingu i zewnętrznych zapytań.', '',
        'Pochodzenie danych: Geoapify; © OpenStreetMap contributors, Open Database License. Atrybucję każdego rekordu zachowano w warstwie JSON. https://www.openstreetmap.org/copyright', '',
        '## Rekordy do sprawdzenia', '',
        '| Wiersz XLSX | Adres wejściowy | Wynik Geoapify | Powody |',
        '| --- | --- | --- | --- |',
    ]
    by_id = {address['id']: address for address in dataset['addresses']}
    for record in layer['records']:
        if record['status'] == 'MATCHED_BUILDING':
            continue
        address = by_id[record['addressId']]
        reasons = '; '.join(REASON_LABELS[reason] for reason in record['reasons'])
        lines.append(f"| {', '.join(map(str, address['sourceRows']))} | {safe(address['label'])} | {safe(record['candidate']['formatted'])} | {safe(reasons)} |")
    return '\n'.join(lines) + '\n'


def atomic_write(path, content):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n', dir=path.parent, prefix='.geocoding-', suffix='.tmp', delete=False) as output:
        temporary = Path(output.name)
        output.write(content)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    args = parser.parse_args()
    dataset = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))
    layer = build_layer(dataset, args.csv.read_bytes(), args.csv.name)
    serialized = json.dumps(layer, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    report = report_markdown(dataset, layer)
    atomic_write(ROOT / 'data/geocoding.json', serialized)
    atomic_write(ROOT / 'data/GEOCODING-REPORT.md', report)
    print(json.dumps(layer['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
