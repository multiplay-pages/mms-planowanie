"""Verify the normalized dataset against source XLSX bytes without evaluating cells."""
import hashlib
import json
from pathlib import Path
import re
import unittest
import zipfile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def source_rows():
    with zipfile.ZipFile(ROOT.parent / 'dane_adresowe-v2.xlsx') as archive:
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in archive.namelist() else []
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        rows = {}
        for row in sheet.findall('.//s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                value = cell.find('s:v', NS)
                if value is not None:
                    values[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
                elif cell.attrib.get('t') == 'inlineStr':
                    values[re.sub(r'\d', '', cell.attrib['r'])] = ''.join(node.text or '' for node in cell.findall('.//s:t', NS))
            rows[int(row.attrib['r'])] = values
        return rows


class AddressDataTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))

    def test_source_checksum_counts_and_every_source_row_preserved(self):
        self.assertEqual(hashlib.sha256((ROOT.parent / 'dane_adresowe-v2.xlsx').read_bytes()).hexdigest(), self.data['source']['sha256'])
        self.assertEqual(self.data['quality']['sourceRows'], 110)
        self.assertEqual(len(self.data['addresses']), 109)
        rows = source_rows()
        seen = []
        for address in self.data['addresses']:
            for number in address['sourceRows']:
                self.assertEqual(address['city'], rows[number]['C'])
                self.assertEqual(address['building'], rows[number]['E'])
                self.assertEqual(address['sourceLabel'], rows[number]['G'])
                seen.append(number)
            self.assertIsNone(address['coordinates'])
            self.assertIsNone(address['region'])
        self.assertEqual(sorted(seen), list(range(2, 112)))
        self.assertEqual(self.data['quality']['duplicates'][0]['row'], 107)
        self.assertEqual(self.data['quality']['duplicates'][0]['sameAsRow'], 100)

    def test_prospective_geocoding_payload_is_minimal_and_local_only(self):
        payload = json.loads((ROOT / 'data/geocoding-input.json').read_text(encoding='utf-8'))
        correspondence = json.loads((ROOT / 'data/geocoding-correspondence.json').read_text(encoding='utf-8'))
        self.assertEqual(len(payload), 109)
        self.assertEqual(len(set(payload)), 109)
        self.assertEqual(correspondence['datasetId'], self.data['source']['sha256'])
        for i, address in enumerate(self.data['addresses']):
            expected = f"{address['postcode']} {address['city']}, {address['street'] + ' ' if address['street'] else ''}{address['building']}, Polska".strip()
            self.assertEqual(payload[i], expected)
            self.assertEqual(correspondence['items'][i], {'inputIndex': i, 'addressId': address['id']})


if __name__ == '__main__':
    unittest.main()
