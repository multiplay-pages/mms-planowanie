"""Read XLSX values only; emit local normalized data without changing the source.

Run with the bundled Codex Python (openpyxl is used only for reading).
No formula evaluation, external links, network requests or XLSX writes.
"""
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'dane_adresowe-v2.xlsx'
HEADERS = ['Lp.', 'Kod pocztowy', 'Miejscowość', 'Ulica', 'Nr budynku', 'Nr lokalu', 'Pełny adres']


def clean(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(value or ''))).strip()


def key(parts):
    return '|'.join(clean(part).casefold() for part in parts)


def extract(source=SOURCE):
    original = source.read_bytes()
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True, keep_links=False)
    sheet = workbook['Dane adresowe']
    rows = list(sheet.values)
    if list(rows[0]) != HEADERS:
        raise ValueError('Unexpected workbook headers; review schema before importing.')
    addresses, by_key, duplicates, incomplete = [], {}, [], []
    source_count = 0
    for row_number, row in enumerate(rows[1:], 2):
        if not any(value is not None for value in row):
            continue
        source_count += 1
        _, postcode, city, street, building, unit, original_label = map(clean, row)
        if not city or not building:
            incomplete.append(row_number)
            continue
        normalized = key([postcode, city, street, building, unit])
        if normalized in by_key:
            previous = by_key[normalized]
            previous['sourceRows'].append(row_number)
            duplicates.append({'row': row_number, 'sameAsRow': previous['sourceRows'][0], 'addressId': previous['id']})
            continue
        label = f'{postcode} {city}, {street + " " if street else ""}{building}{"/" + unit if unit else ""}'.strip()
        address = {
            'id': 'ADR-' + hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:12],
            'postcode': postcode, 'city': city, 'street': street, 'building': building,
            'unit': unit, 'label': label, 'sourceLabel': original_label,
            'sourceRows': [row_number], 'region': None, 'coordinates': None,
            'coverageStatus': 'USER_TEST_LIST', 'locationStatus': 'MISSING_COORDINATES',
        }
        addresses.append(address)
        by_key[normalized] = address
    workbook.close()
    if source.read_bytes() != original:
        raise RuntimeError('Source changed during read; abort import.')
    dataset = {
        'schemaVersion': 1,
        'source': {'filename': source.name, 'sheet': 'Dane adresowe', 'range': f'A1:G{len(rows)}',
                   'sha256': hashlib.sha256(original).hexdigest(), 'coverageBasis': 'User-supplied test address list; not independently verified'},
        'quality': {'sourceRows': source_count, 'uniqueAddresses': len(addresses),
                    'uniqueBuildings': len({key([a['postcode'], a['city'], a['street'], a['building']]) for a in addresses}),
                    'cities': len({a['city'] for a in addresses}), 'duplicates': duplicates,
                    'incompleteRows': incomplete, 'withoutStreet': sum(not a['street'] for a in addresses),
                    'withoutCoordinates': sum(a['coordinates'] is None for a in addresses)},
        'addresses': addresses,
    }
    return dataset


if __name__ == '__main__':
    dataset = extract()
    (ROOT / 'data' / 'addresses.json').write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Reviewable prospective request only. No connection is opened here.
    # Apartments, internal IDs, network coverage and order parameters are omitted.
    geocoding_input = [f"{a['postcode']} {a['city']}, {a['street'] + ' ' if a['street'] else ''}{a['building']}, Polska".strip() for a in dataset['addresses']]
    (ROOT / 'data' / 'geocoding-input.json').write_text(json.dumps(geocoding_input, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    correspondence = {'datasetId': dataset['source']['sha256'], 'provider': 'Geoapify; coordinate results are a separate layer in geocoding.json',
                      'items': [{'inputIndex': i, 'addressId': a['id']} for i, a in enumerate(dataset['addresses'])]}
    (ROOT / 'data' / 'geocoding-correspondence.json').write_text(json.dumps(correspondence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    quality = dataset['quality']
    report = f'''# Import listy adresowej

Źródło: `{dataset['source']['filename']}`, arkusz `Dane adresowe`, `{dataset['source']['range']}`.
SHA256: `{dataset['source']['sha256']}`. Plik źródłowy pozostawiono bez zmian.

- Wiersze danych: {quality['sourceRows']}.
- Unikalne adresy / budynki: {quality['uniqueAddresses']} / {quality['uniqueBuildings']}.
- Miejscowości: {quality['cities']}.
- Powtórzone wiersze: {json.dumps(quality['duplicates'], ensure_ascii=False)}.
- Niekompletne (bez miejscowości lub numeru budynku): {quality['incompleteRows']}.
- Bez ulicy: {quality['withoutStreet']} — zachowane; numeracja miejscowości może nie wymagać ulicy.
- Bez współrzędnych: {quality['withoutCoordinates']}.

Wszystkie unikalne adresy włączono, bez dopisywania fikcyjnych punktów do 120.
Nie przypisano regionów OPO/KNU na podstawie zgadywania. Pokrycie siecią opisano jako pochodzące z listy testowej użytkownika; brak niezależnej weryfikacji.
To raport samego odczytu XLSX. Aktualny stan zaakceptowanego geokodowania i osobnej warstwy współrzędnych: `GEOCODING-SCOPE.md` oraz `GEOCODING-REPORT.md`. Ponowne uruchomienie tego importera nie zmienia `geocoding.json`. Parametry zleceń i ekip są syntetyczne i oddzielone od katalogu adresów.
'''
    (ROOT / 'data' / 'IMPORT-REPORT.md').write_text(report, encoding='utf-8')
    print(json.dumps(quality, ensure_ascii=False))
