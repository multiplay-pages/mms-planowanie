"""Fetch the approved address-only manifest directly from GUGiK; never run from UI.

Default is a local validation/dry run. --execute makes one GET per new record.
Checkpointing avoids resending completed inputs after interruption. No other host,
credentials, apartment numbers, network coverage or work-plan fields are sent.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
ENDPOINT = 'https://services.gugik.gov.pl/uug/'


def expected_query(address):
    street = address['street']
    if street.lower().startswith('ul. '):
        street = street[4:]
    return address['city'] + (f", {street} {address['building']}" if street else f" {address['building']}")


def validate_manifest(manifest, dataset):
    if manifest.get('recipient') != ENDPOINT or manifest.get('operation') != 'GetAddress' or manifest.get('datasetId') != dataset['source']['sha256']:
        raise ValueError('Manifest nie odpowiada zatwierdzonemu odbiorcy lub zbiorowi.')
    records = manifest.get('records', [])
    expected = {a['id']: expected_query(a) for a in dataset['addresses']}
    if len(records) != len(expected) or len({r.get('addressId') for r in records}) != len(expected):
        raise ValueError('Niepełna lub powtórzona lista adresów.')
    for record in records:
        if set(record) != {'addressId', 'address'} or expected.get(record['addressId']) != record['address']:
            raise ValueError('Zmieniono zatwierdzony adres lub dodano niedozwolone dane.')


def query_url(address):
    return ENDPOINT + '?' + urllib.parse.urlencode({'request': 'GetAddress', 'address': address, 'exact_number': '1', 'srid': '4326'})


class SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if target.scheme != 'https' or target.hostname != 'services.gugik.gov.pl' or target.port not in (None, 443):
            raise ValueError('Odrzucono przekierowanie poza zatwierdzony host GUGiK.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def save_checkpoint(path, data):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--retry-errors', action='store_true', help='Retry only transport errors, preserving attempt metadata.')
    args = parser.parse_args()
    manifest_bytes = (ROOT / 'uug-input.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    dataset = json.loads((ROOT / 'addresses.json').read_text(encoding='utf-8'))
    validate_manifest(manifest, dataset)
    if not args.execute:
        print(f"DRY RUN: {len(manifest['records'])} zatwierdzonych adresów; 0 zapytań sieciowych.")
        return
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    output = ROOT / 'uug-responses.json'
    result = {'schemaVersion': 1, 'datasetId': manifest['datasetId'], 'source': {
        'provider': 'GUGIK_UUG', 'endpoint': ENDPOINT, 'srid': 4326, 'exactNumber': True,
        'manifestSha256': manifest_sha}, 'records': []}
    if output.exists():
        previous = json.loads(output.read_text(encoding='utf-8'))
        if previous.get('datasetId') != manifest['datasetId'] or previous.get('source') != result['source']:
            raise ValueError('Istniejący checkpoint dotyczy innego manifestu; nie będzie nadpisany.')
        result = previous
    previous_by_id = {r['addressId']: r for r in result['records']}
    if len(previous_by_id) != len(result['records']):
        raise ValueError('Powtórzone wyniki w checkpoint.')
    opener = urllib.request.build_opener(SameHostRedirect())
    for record in manifest['records']:
        previous_record = previous_by_id.get(record['addressId'])
        if previous_record and (previous_record['status'] == 'OK' or not args.retry_errors):
            continue
        request = urllib.request.Request(query_url(record['address']), headers={'User-Agent': 'MMS-Planowanie-Local-QA/1.0', 'Accept': 'application/json'})
        response_record = {'addressId': record['addressId'], 'query': record['address']}
        if previous_record:
            response_record['previousAttempts'] = previous_record.get('previousAttempts', []) + [{k: previous_record.get(k) for k in ['status', 'errorType', 'httpStatus']}]
        stop = False
        try:
            with opener.open(request, timeout=20) as response:
                body = response.read(1_000_001)
                if len(body) > 1_000_000:
                    raise ValueError('Przekroczony limit odpowiedzi.')
                response_record.update(status='OK', httpStatus=response.status, data=json.loads(body))
        except (OSError, ValueError) as error:
            response_record.update(status='TRANSPORT_ERROR', errorType=type(error).__name__, httpStatus=getattr(error, 'code', None))
            stop = getattr(error, 'code', 0) in (429, 500, 502, 503, 504)
        if previous_record:
            index = next(i for i, value in enumerate(result['records']) if value['addressId'] == record['addressId'])
            result['records'][index] = response_record
        else:
            result['records'].append(response_record)
        save_checkpoint(output, result)
        count = len(result['records'])
        if count == 1 or count % 10 == 0 or count == len(manifest['records']):
            errors = sum(r['status'] != 'OK' for r in result['records'])
            print(f"GUGiK: {count}/{len(manifest['records'])}; błędy transportu: {errors}", flush=True)
        if stop:
            print('Usługa ograniczyła ruch lub jest niedostępna; przerwano bez ponawiania zapytań.', flush=True)
            break
        time.sleep(1)


if __name__ == '__main__':
    main()
