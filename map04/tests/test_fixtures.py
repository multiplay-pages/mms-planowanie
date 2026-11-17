import json
import unittest
from pathlib import Path


FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures.json").read_text(encoding="utf-8"))


class SyntheticFixtureTests(unittest.TestCase):
    def test_fixture_has_repeatable_seed_and_only_synthetic_jobs(self):
        self.assertTrue(FIXTURE["synthetic_only"])
        self.assertEqual(FIXTURE["seed"], 20261115)
        self.assertEqual(len(FIXTURE["regions"]["OPO"]["jobs"]), 12)
        self.assertEqual(len(FIXTURE["regions"]["KNU"]["jobs"]), 7)

    def test_no_real_address_field_is_present(self):
        for region in FIXTURE["regions"].values():
            for job in region["jobs"]:
                self.assertNotIn("address", job)
                self.assertTrue(job["job_id"].endswith(tuple(str(i).zfill(3) for i in range(1, 13))))

    def test_knu_windows_are_marked_as_test_only(self):
        self.assertIn("test parameter only", FIXTURE["regions"]["KNU"]["windows_status"])

    def test_each_region_contains_separate_mpl_bsa_and_measurement_cases(self):
        for region in FIXTURE["regions"].values():
            operators = {job["operator"] for job in region["jobs"]}
            self.assertTrue({"MPL", "BSA", "POMIAR"}.issubset(operators))

    def test_unverified_bsa_term_is_flagged_for_manual_acceptance(self):
        jobs = [job for region in FIXTURE["regions"].values() for job in region["jobs"]]
        unverified = [job for job in jobs if "BSA_DEADLINE_UNVERIFIED" in job["special_requirements"]]
        self.assertEqual(len(unverified), 2)
        self.assertTrue(all("MANUAL_ACCEPTANCE_REQUIRED" in job["special_requirements"] for job in unverified))


if __name__ == "__main__":
    unittest.main()
