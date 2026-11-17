import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data'))
SPEC = importlib.util.spec_from_file_location('import_uug', ROOT / 'data/import_uug.py')


class UugImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(cls.api)
        cls.dataset = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))
        cls.raw_bytes = (ROOT / 'data/uug-responses.json').read_bytes()
        cls.raw = json.loads(cls.raw_bytes)
        cls.manifest = json.loads((ROOT / 'data/uug-input.json').read_text(encoding='utf-8'))

    def test_all_109_are_accounted_for_without_changing_user_addresses(self):
        before = copy.deepcopy(self.dataset)
        layer = self.api.build_layer(self.dataset, self.raw_bytes, self.manifest)
        self.assertEqual(layer['summary']['total'], 109)
        self.assertGreater(layer['summary']['matched'], 46)
        self.assertEqual(layer['summary']['matched'] + layer['summary']['review'], 109)
        self.assertEqual(self.dataset, before)
        shuffled = copy.deepcopy(self.raw)
        shuffled['records'].reverse()
        other = self.api.build_layer(self.dataset, json.dumps(shuffled).encode(), self.manifest)
        self.assertEqual(layer['records'], other['records'])

    def test_wawelno_32a_is_found_exactly_without_accepting_neighbour_32(self):
        address = self.dataset['addresses'][0]
        packet = self.raw['records'][0]
        result = self.api.assess_result(address, packet)
        self.assertEqual(result['status'], 'MATCHED_BUILDING')
        self.assertEqual(result['candidate']['housenumber'], '32a')
        self.assertEqual(result['candidate']['registry']['simc'], '0496892')
        wrong = copy.deepcopy(packet)
        wrong['data']['results']['1']['number'] = '32'
        rejected = self.api.assess_result(address, wrong)
        self.assertIsNone(rejected['coordinates'])
        self.assertIn('BUILDING_MISMATCH', rejected['reasons'])

    def test_multiple_eligible_points_are_not_silently_reduced_to_first(self):
        packet = copy.deepcopy(self.raw['records'][0])
        duplicate = copy.deepcopy(packet['data']['results']['1'])
        duplicate['x'] = str(float(duplicate['x']) + .01)
        packet['data']['results']['2'] = duplicate
        result = self.api.assess_result(self.dataset['addresses'][0], packet)
        self.assertEqual(result['status'], 'REVIEW_REQUIRED')
        self.assertIn('AMBIGUOUS_REGISTER_MATCH', result['reasons'])
        self.assertIsNone(result['coordinates'])

    def test_output_metres_invalid_number_city_and_postcode_do_not_become_markers(self):
        for field, value, reason in [('x', '644234', 'COORDINATES_INVALID'), ('x', 'NaN', 'COORDINATES_INVALID'), ('city', 'Inna', 'CITY_MISMATCH'), ('code', '00-000', 'POSTCODE_MISMATCH')]:
            packet = copy.deepcopy(self.raw['records'][0])
            packet['data']['results']['1'][field] = value
            result = self.api.assess_result(self.dataset['addresses'][0], packet)
            self.assertIsNone(result['coordinates'])
            self.assertIn(reason, result['reasons'])

    def test_documented_street_expansion_uses_registry_evidence_not_geoapify_confidence(self):
        packet = {'status': 'OK', 'data': json.loads((ROOT / 'data/uug-public-example.json').read_text(encoding='utf-8'))}
        address = {'id': 'example', 'city': 'Marki', 'street': 'ul. Andersa', 'building': '1', 'postcode': '05-270'}
        result = self.api.assess_result(address, packet)
        self.assertEqual(result['status'], 'MATCHED_BUILDING')
        self.assertLess(result['candidate']['confidence']['overall'], .95)
        self.assertEqual(result['matchEvidence']['streetPartExact'], True)

    def test_failed_or_empty_provider_response_never_marks_the_source_address_invalid(self):
        for packet, reason in [({'status': 'TRANSPORT_ERROR'}, 'PROVIDER_UNAVAILABLE'), ({'status': 'OK', 'data': {'type': 'address', 'results': None}}, 'NO_REGISTER_MATCH')]:
            result = self.api.assess_result(self.dataset['addresses'][0], packet)
            self.assertEqual(result['status'], 'REVIEW_REQUIRED')
            self.assertIn(reason, result['reasons'])
            self.assertIsNone(result['coordinates'])

    def test_single_exact_building_with_same_postal_area_can_keep_point_with_explicit_postcode_note(self):
        packet = copy.deepcopy(self.raw['records'][0])
        packet['data']['results']['1']['code'] = '46-071'
        result = self.api.assess_result(self.dataset['addresses'][0], packet)
        self.assertEqual(result['status'], 'MATCHED_BUILDING_POSTCODE_NOTE')
        self.assertIsNotNone(result['coordinates'])
        self.assertEqual(result['reasons'], ['POSTCODE_DIFFERENCE'])
        self.assertEqual(result['matchEvidence']['returnedCount'], 1)
        packet['data']['results']['2'] = copy.deepcopy(packet['data']['results']['1'])
        ambiguous = self.api.assess_result(self.dataset['addresses'][0], packet)
        self.assertEqual(ambiguous['status'], 'REVIEW_REQUIRED')
        self.assertIsNone(ambiguous['coordinates'])

    def test_missing_duplicate_changed_query_and_foreign_source_reject_entire_import(self):
        for mutate in [lambda value: value['records'].pop(), lambda value: value['records'].__setitem__(0, value['records'][1]), lambda value: value['records'][0].update(query='changed'), lambda value: value['source'].update(endpoint='https://other.example/')]:
            bad = copy.deepcopy(self.raw)
            mutate(bad)
            with self.assertRaises(ValueError):
                self.api.build_layer(self.dataset, json.dumps(bad).encode(), self.manifest)


if __name__ == '__main__':
    unittest.main()
