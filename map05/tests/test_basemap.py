import importlib.util
from pathlib import Path
import unittest
from xml.etree import ElementTree as ET

spec=importlib.util.spec_from_file_location('download_osm',Path(__file__).resolve().parents[1]/'basemap/download_osm.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BasemapConversionTests(unittest.TestCase):
    def test_preserves_real_forest_tracks_and_drops_non_map_metadata(self):
        root=ET.fromstring('''<osm><node id="1" lon="18.38" lat="50.21" user="public-contributor"/><node id="2" lon="18.39" lat="50.22"/><way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="track"/><tag k="name" v="Droga leśna"/><tag k="contact:phone" v="not-for-the-basemap"/></way><way id="11"><nd ref="1"/><nd ref="2"/><tag k="building" v="yes"/></way></osm>''')
        result=module.convert([root])
        self.assertEqual(result,[{'id':'10','kind':'road','category':'track','name':'Droga leśna','points':[[18.38,50.21],[18.39,50.22]]}])


if __name__=='__main__':
    unittest.main()
