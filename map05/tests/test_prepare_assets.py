import gzip
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PrepareAssetsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('prepare_assets', ROOT / 'prepare_assets.py')
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)

    def fixture(self, directory):
        root = Path(directory)
        target = root / 'basemap/regional-roads.json'
        target.parent.mkdir()
        raw = b'{"sample":"public map"}\n'
        archive = target.with_suffix('.json.gz')
        archive.write_bytes(gzip.compress(raw, mtime=0))
        entry = {'path': 'basemap/regional-roads.json', 'archive': 'basemap/regional-roads.json.gz', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
        return root, target, raw, entry

    def test_restores_exact_bytes_without_network_and_reuses_an_unchanged_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root, target, raw, entry = self.fixture(directory)
            self.api.restore_asset(root, entry)
            self.assertEqual(target.read_bytes(), raw)
            self.api.restore_asset(root, entry)
            self.assertEqual(target.read_bytes(), raw)

    def test_changed_local_file_is_not_silently_overwritten_and_paths_cannot_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root, target, raw, entry = self.fixture(directory)
            target.write_bytes(b'USER CHANGE')
            with self.assertRaises(ValueError):
                self.api.restore_asset(root, entry)
            self.assertEqual(target.read_bytes(), b'USER CHANGE')
            with self.assertRaises(ValueError):
                self.api.restore_asset(root, {**entry, 'path': '../outside.json'})

    def test_corrupt_or_oversized_archive_never_becomes_a_complete_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            root, target, raw, entry = self.fixture(directory)
            with self.assertRaises(ValueError):
                self.api.restore_asset(root, {**entry, 'archiveSha256': '0' * 64})
            self.assertFalse(target.exists())
            with self.assertRaises(ValueError):
                self.api.restore_asset(root, {**entry, 'bytes': 1})
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
