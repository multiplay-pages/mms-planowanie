"""The approved boundary is 109 address strings to the GUGiK HTTPS host only."""
import importlib.util
import json
from pathlib import Path
import unittest
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('fetch_uug', ROOT / 'data/fetch_uug.py')


class UugFetchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(cls.api)
        cls.manifest = json.loads((ROOT / 'data/uug-input.json').read_text(encoding='utf-8'))
        cls.dataset = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))

    def test_manifest_is_exactly_the_approved_dataset_without_extra_fields(self):
        self.api.validate_manifest(self.manifest, self.dataset)
        self.assertEqual(len(self.manifest['records']), 109)
        for record in self.manifest['records']:
            self.assertEqual(set(record), {'addressId', 'address'})
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.api.query_url(self.manifest['records'][0]['address'])).query)
        self.assertEqual(set(query), {'request', 'address', 'exact_number', 'srid'})
        self.assertEqual(query['exact_number'], ['1'])
        self.assertEqual(query['srid'], ['4326'])
        self.assertIn('32A', query['address'][0])
        self.assertNotIn(self.manifest['records'][0]['addressId'], query['address'][0])

    def test_foreign_recipient_changed_address_and_duplicate_identity_are_rejected(self):
        for change in [
            lambda d: d.update(recipient='https://other.example/'),
            lambda d: d['records'][0].update(address='changed'),
            lambda d: d['records'].__setitem__(0, d['records'][1]),
        ]:
            bad = json.loads(json.dumps(self.manifest))
            change(bad)
            with self.assertRaises(ValueError):
                self.api.validate_manifest(bad, self.dataset)


if __name__ == '__main__':
    unittest.main()
