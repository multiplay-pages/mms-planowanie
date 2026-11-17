"""Geoapify CSV is external data; match identity and building fields before plotting."""
import csv
import importlib.util
import io
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('import_geocoding', ROOT / 'data/import_geocoding.py')


def load_importer():
    module = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(module)
    return module


def csv_bytes(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode('utf-8-sig')


class GeocodingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = load_importer()
        cls.dataset = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))
        cls.source = ROOT.parent / 'geocoded_by_geoapify-16.11.2026, 16_49_56.csv'

    def setUp(self):
        self.rows = list(csv.DictReader(io.StringIO(self.source.read_text(encoding='utf-8-sig'))))

    def test_complete_batch_preserves_every_input_and_matches_by_identity_not_position(self):
        result = self.api.build_layer(self.dataset, self.source.read_bytes(), self.source.name)
        reversed_result = self.api.build_layer(self.dataset, csv_bytes(list(reversed(self.rows))), 'reordered.csv')
        self.assertEqual(len(result['records']), 109)
        self.assertEqual(result['datasetId'], self.dataset['source']['sha256'])
        self.assertEqual(result['records'], reversed_result['records'])
        self.assertEqual(result['summary']['total'], 109)
        self.assertGreater(result['summary']['matched'], 0)
        self.assertGreater(result['summary']['review'], 0)

    def test_suffix_mismatch_is_not_accepted_despite_high_provider_confidence(self):
        result = self.api.build_layer(self.dataset, self.source.read_bytes(), self.source.name)
        first = result['records'][0]
        self.assertEqual(first['status'], 'REVIEW_REQUIRED')
        self.assertIn('BUILDING_MISMATCH', first['reasons'])
        self.assertIsNone(first['coordinates'])
        self.assertEqual(first['candidate']['housenumber'], '32')
        self.assertEqual(first['candidate']['confidence']['building'], .95)

    def test_exact_building_is_accepted_and_original_catalog_is_unchanged(self):
        before = json.dumps(self.dataset, sort_keys=True)
        result = self.api.build_layer(self.dataset, self.source.read_bytes(), self.source.name)
        second = result['records'][1]
        self.assertEqual(second['status'], 'MATCHED_BUILDING')
        self.assertEqual(second['coordinates'], [18.0254902, 50.9844843])
        self.assertEqual(second['reasons'], [])
        self.assertEqual(json.dumps(self.dataset, sort_keys=True), before)
        self.assertIn('OpenStreetMap', second['candidate']['attribution'])

    def test_missing_duplicate_foreign_or_changed_original_input_rejects_entire_import(self):
        for rows in [self.rows[:-1], self.rows+[self.rows[0]], [dict(self.rows[0], original_address='not-an-approved-input')]+self.rows[1:]]:
            with self.subTest(size=len(rows)):
                with self.assertRaisesRegex(ValueError, '109|wejściow|powtórzon'):
                    self.api.build_layer(self.dataset, csv_bytes(rows), 'invalid.csv')

    def test_low_confidence_missing_number_wrong_city_postcode_and_street_are_reviewed(self):
        changes = [
            ('housenumber', '', 'BUILDING_MISMATCH'),
            ('confidence_building_level', '', 'BUILDING_CONFIDENCE'),
            ('confidence_building_level', '.9', 'BUILDING_CONFIDENCE'),
            ('confidence', '.9', 'LOW_CONFIDENCE'),
            ('city', 'inna miejscowość', 'CITY_MISMATCH'),
            ('postcode', '00-000', 'POSTCODE_MISMATCH'),
            ('street', 'Inna', 'STREET_MISMATCH'),
            ('country_code', 'de', 'COUNTRY_MISMATCH'),
        ]
        address = self.dataset['addresses'][1]
        for field, value, reason in changes:
            with self.subTest(field=field, value=value):
                result = self.api.assess_result(address, dict(self.rows[1], **{field: value}))
                self.assertIn(reason, result['reasons'])
                self.assertIsNone(result['coordinates'])

    def test_nan_infinity_and_out_of_country_coordinates_are_not_plot_coordinates(self):
        for field, value in [('lat', 'NaN'), ('lon', 'Infinity'), ('lat', '0'), ('lon', '17,9'), ('lat', '')]:
            with self.subTest(field=field, value=value):
                result = self.api.assess_result(self.dataset['addresses'][1], dict(self.rows[1], **{field: value}))
                self.assertIsNone(result['coordinates'])
                self.assertIn('COORDINATES_INVALID', result['reasons'])
                json.dumps(result, allow_nan=False)

    def test_csv_schema_is_required_and_is_not_silently_guessed(self):
        with self.assertRaisesRegex(ValueError, 'kolumn'):
            self.api.build_layer(self.dataset, b'address,lat,lon\nx,50,18\n', 'unknown.csv')


if __name__ == '__main__':
    unittest.main()
