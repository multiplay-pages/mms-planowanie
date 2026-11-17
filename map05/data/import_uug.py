"""Assess GUGiK replies against confirmed source addresses; never edits the source.

Confidence fields have provider-specific meanings. UUG's exact number, locality,
postcode and registered street match are used instead of Geoapify score thresholds.
"""
from collections import Counter
import hashlib
import html
import json
from pathlib import Path
import re

from fetch_uug import ENDPOINT, validate_manifest
from import_geocoding import atomic_write, clean, normalized, street_key, number

ROOT = Path(__file__).resolve().parent
UUG_REASONS = {
    'COORDINATES_INVALID': 'Niepoprawne współrzędne odpowiedzi',
    'BUILDING_MISMATCH': 'Brak zgodnego numeru budynku',
    'CITY_MISMATCH': 'Wynik dla innej miejscowości',
    'POSTCODE_MISMATCH': 'Inny lub brakujący kod pocztowy',
    'POSTCODE_DIFFERENCE': 'Jednoznaczny punkt budynku; kod pocztowy usługi różni się od źródłowego (oba zachowano)',
    'STREET_MISMATCH': 'Brak zgodnego dopasowania ulicy',
    'REGISTRY_IDS_MISSING': 'Brak wymaganych identyfikatorów rejestrowych',
    'AMBIGUOUS_REGISTER_MATCH': 'Kilka zgodnych punktów — nie wybrano arbitralnie pierwszego',
    'NO_REGISTER_MATCH': 'Usługa nie zwróciła dopasowanego punktu',
    'PROVIDER_UNAVAILABLE': 'Błąd lub nieprawidłowa odpowiedź usługi, nie błąd adresu',
}


def candidate_for(address, value):
    lon, lat = number(value.get('x')), number(value.get('y'))
    coordinates = [lon, lat] if lon is not None and lat is not None and 14 <= lon <= 24.5 and 49 <= lat <= 55 else None
    registry = {key: clean(value.get(key)) for key in ['teryt', 'simc', 'ulic']}
    street_part = number(value.get('street_part_accuracy'), confidence=True)
    same_street = street_key(address['street']) == street_key(value.get('street'))
    street_matches = same_street or bool(address['street'] and street_part == 1 and re.fullmatch(r'\d{5}', registry['ulic']))
    matches = {
        'number': normalized(address['building']) == normalized(value.get('number')),
        'city': normalized(address['city']) in {normalized(value.get('city')), normalized(value.get('citypart'))},
        'postcode': normalized(address['postcode']) == normalized(value.get('code')),
        'street': street_matches,
    }
    reasons = []
    if coordinates is None:
        reasons.append('COORDINATES_INVALID')
    for field, reason in [('number', 'BUILDING_MISMATCH'), ('city', 'CITY_MISMATCH'), ('postcode', 'POSTCODE_MISMATCH'), ('street', 'STREET_MISMATCH')]:
        if not matches[field]:
            reasons.append(reason)
    if not re.fullmatch(r'\d{6,7}', registry['teryt']) or not re.fullmatch(r'\d{7}', registry['simc']) or (address['street'] and not re.fullmatch(r'\d{5}', registry['ulic'])):
        reasons.append('REGISTRY_IDS_MISSING')
    city, street, building, postcode = map(clean, [value.get('city'), value.get('street'), value.get('number'), value.get('code')])
    formatted = f"{city}{', ' + street if street else ''} {building}{', ' + postcode if postcode else ''}".strip()
    candidate = {
        'coordinates': coordinates, 'formatted': formatted,
        'housenumber': building, 'street': street, 'city': city,
        'citypart': clean(value.get('citypart')), 'postcode': postcode, 'country_code': 'pl',
        'registry': registry,
        'confidence': {'overall': number(value.get('accuracy'), confidence=True),
                       'city': number(value.get('city_accuracy'), confidence=True),
                       'street': number(value.get('street_accuracy'), confidence=True),
                       'streetPart': street_part, 'building': None},
        'attribution': 'GUGiK — Uniwersalna Usługa Geokodowania',
        'attribution_license': 'Publiczna usługa GUGiK', 'attribution_url': ENDPOINT,
    }
    return candidate, reasons, {'fields': matches, 'streetPartExact': street_part == 1}


def assess_result(address, packet):
    empty, _, _ = candidate_for(address, {})
    record = {'addressId': address['id'], 'status': 'REVIEW_REQUIRED', 'coordinates': None,
              'candidate': empty, 'reasons': [], 'matchEvidence': {'eligibleCount': 0, 'streetPartExact': False}}
    if packet.get('status') != 'OK':
        record['reasons'] = ['PROVIDER_UNAVAILABLE']
        return record
    data = packet.get('data')
    values = (data.get('results') or {}) if isinstance(data, dict) else {}
    if not isinstance(values, dict) or not values or data.get('type') != 'address':
        record['reasons'] = ['NO_REGISTER_MATCH']
        return record
    candidates = [candidate_for(address, value) for value in values.values() if isinstance(value, dict)]
    eligible = [item for item in candidates if not item[1]]
    if len(eligible) == 1:
        candidate, _, evidence = eligible[0]
        record.update(status='MATCHED_BUILDING', coordinates=candidate['coordinates'], candidate=candidate,
                      matchEvidence={**evidence, 'eligibleCount': 1, 'returnedCount': len(candidates)})
    elif len(candidates) == 1 and candidates[0][1] == ['POSTCODE_MISMATCH'] and re.fullmatch(r'\d{2}-\d{3}', address['postcode']) and re.fullmatch(r'\d{2}-\d{3}', candidates[0][0]['postcode']) and address['postcode'][:2] == candidates[0][0]['postcode'][:2]:
        candidate, _, evidence = candidates[0]
        record.update(status='MATCHED_BUILDING_POSTCODE_NOTE', coordinates=candidate['coordinates'], candidate=candidate,
                      reasons=['POSTCODE_DIFFERENCE'], matchEvidence={**evidence, 'eligibleCount': 1, 'returnedCount': 1})
    elif candidates:
        best = min(candidates, key=lambda item: (len(item[1]), item[0]['formatted']))
        record.update(candidate=best[0], reasons=['AMBIGUOUS_REGISTER_MATCH'] if len(eligible) > 1 else best[1],
                      matchEvidence={**best[2], 'eligibleCount': len(eligible)})
    else:
        record['reasons'] = ['NO_REGISTER_MATCH']
    return record


def build_layer(dataset, raw_bytes, manifest):
    validate_manifest(manifest, dataset)
    raw = json.loads(raw_bytes)
    if raw.get('schemaVersion') != 1 or raw.get('datasetId') != dataset['source']['sha256'] or raw.get('source', {}).get('endpoint') != ENDPOINT or raw.get('source', {}).get('srid') != 4326:
        raise ValueError('Wyniki UUG dotyczą innego źródła, zbioru lub układu współrzędnych.')
    packets = raw.get('records', [])
    expected = {r['addressId']: r['address'] for r in manifest['records']}
    if len(packets) != len(expected) or len({r.get('addressId') for r in packets}) != len(expected):
        raise ValueError('Niepełna lub powtórzona partia UUG.')
    for packet in packets:
        if packet.get('addressId') not in expected or packet.get('query') != expected[packet['addressId']]:
            raise ValueError('Podmieniono tożsamość lub treść zapytania UUG.')
    by_id = {r['addressId']: r for r in packets}
    records = [assess_result(address, by_id[address['id']]) for address in dataset['addresses']]
    exact = sum(record['status'] == 'MATCHED_BUILDING' for record in records)
    postcode_notes = sum(record['status'] == 'MATCHED_BUILDING_POSTCODE_NOTE' for record in records)
    matched = exact + postcode_notes
    return {
        'schemaVersion': 1, 'datasetId': dataset['source']['sha256'],
        'source': {'provider': 'GUGIK_UUG', 'method': 'GetAddress', 'filename': 'uug-responses.json',
                   'sha256': hashlib.sha256(raw_bytes).hexdigest(), 'url': ENDPOINT, 'srid': 4326},
        'policy': {'version': 1, 'exactNumber': True, 'exactLocality': True,
                   'uniqueEligiblePoint': True, 'street': 'exact-name-or-registry-street-part',
                   'postcodeDifferenceOnlyForSingleReturnedPointInSamePostalArea': True,
                   'sourceAddressesConfirmedBy': 'USER_QGIS', 'independentlyVerifiedNetworkCoverage': False},
        'summary': {'total': len(records), 'matched': matched, 'exactMatched': exact, 'postcodeNotes': postcode_notes, 'review': len(records) - matched,
                    'candidateCoordinates': sum(r['candidate']['coordinates'] is not None for r in records),
                    'reasons': dict(Counter(reason for r in records for reason in r['reasons']))},
        'records': records,
    }


def report_markdown(dataset, layer, geoapify):
    safe = lambda text: html.escape(str(text)).replace('|', '\\|').replace('\n', ' ')
    old = {r['addressId']: r for r in geoapify['records']}
    summary = layer['summary']
    lines = ['# GUGiK — porównanie lokalizacji potwierdzonych adresów', '',
             'Adresy użytkownika były już sprawdzone w QGIS. Nie prowadzono tam dalszej weryfikacji i nie zmieniano adresów pod odpowiedzi geokoderów.', '',
             f"Rozliczono **{summary['total']}/109** rekordów: **{summary['exactMatched']} pełnych zgodności**, **{summary['postcodeNotes']} jednoznacznych punktów budynków z różnym kodem pocztowym**, **{summary['review']} lokalizacji nadal nieustalonych jednoznacznie**.",
             'Brak wyniku, nieobsłużony numer lub błąd odpowiedzi nie oznacza błędnego adresu w bazie użytkownika.', '',
             'Źródło: https://services.gugik.gov.pl/uug/ ; metoda GetAddress, exact_number=1, srid=4326. Weryfikacja pól: pełny numer z literą, miejscowość/część miejscowości, kod, zarejestrowana ulica i jeden zgodny punkt. UUG może rozpoznać część nazwy ulicy z identyfikatorem ULIC; jego ogólny wskaźnik accuracy nie jest confidence Geoapify.', '',
             'Różny kod pocztowy nie zmienia źródłowego adresu. Punkt z taką uwagą jest dopuszczony wyłącznie wtedy, gdy usługa zwróciła dokładnie jednego kandydata, numer/miejscowość/ulica i identyfikatory są zgodne, a oba poprawne kody mają ten sam dwucyfrowy prefiks. Wieloznaczny Maciejów pozostaje poza mapą. Na mapie takie punkty mają osobne oznaczenie i uwagę.', '',
             f"SHA256 surowego wyniku: `{layer['source']['sha256']}`; datasetId `{layer['datasetId']}`. Surowe odpowiedzi i metadane prób zachowano w `uug-responses.json`. Oryginalne XLSX i CSV pozostają bez zmian.", '',
             '| Wiersz XLSX | Adres źródłowy | Wynik GUGiK | Stan / uwagi | Poprzedni Geoapify |',
             '| --- | --- | --- | --- | --- |']
    addresses = {a['id']: a for a in dataset['addresses']}
    for record in layer['records']:
        address = addresses[record['addressId']]
        state = 'Dopasowany punkt' if record['status'] == 'MATCHED_BUILDING' else '; '.join(UUG_REASONS.get(reason, reason) for reason in record['reasons'])
        previous = 'dopasowany' if old[record['addressId']]['status'] == 'MATCHED_BUILDING' else 'nierozstrzygnięty'
        lines.append(f"| {', '.join(map(str, address['sourceRows']))} | {safe(address['label'])} | {safe(record['candidate']['formatted'])} | {safe(state)} | {previous} |")
    return '\n'.join(lines) + '\n'


def main():
    dataset = json.loads((ROOT / 'addresses.json').read_text(encoding='utf-8'))
    manifest = json.loads((ROOT / 'uug-input.json').read_text(encoding='utf-8'))
    layer = build_layer(dataset, (ROOT / 'uug-responses.json').read_bytes(), manifest)
    old = json.loads((ROOT / 'geocoding.json').read_text(encoding='utf-8'))
    atomic_write(ROOT / 'uug-geocoding.json', json.dumps(layer, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    atomic_write(ROOT / 'UUG-REPORT.md', report_markdown(dataset, layer, old))
    print(json.dumps(layer['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
