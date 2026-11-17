import unittest

from map04.rules import (
    RouteActivity,
    check_30km_limit,
    check_measurement_extra_km,
    check_resource_matching,
    check_window_fit,
    manual_override,
    route_distance,
    route_has_missing_data,
    two_slot_reservation_ok,
)
from map04.routing import FixtureRoutingAdapter


class RouteDistanceTests(unittest.TestCase):
    def test_30000_meters_is_accepted(self):
        self.assertEqual(check_30km_limit(30_000), "PASS")

    def test_30001_meters_is_over_limit(self):
        self.assertEqual(check_30km_limit(30_001), "DISTANCE_LIMIT")

    def test_missing_route_is_unknown_not_zero(self):
        self.assertEqual(check_30km_limit(None), "ROUTE_UNKNOWN")

    def test_measurement_route_counts_actual_legs_between_installations(self):
        self.assertEqual(check_30km_limit(29_999, via_measurement=True), "PASS")
        self.assertEqual(check_30km_limit(30_001, via_measurement=True), "DISTANCE_LIMIT")


class MeasurementDeltaTests(unittest.TestCase):
    def test_10000_meters_extra_is_accepted(self):
        self.assertEqual(check_measurement_extra_km(20_000, 30_000), "PASS")

    def test_10001_meters_extra_is_over_limit(self):
        self.assertEqual(check_measurement_extra_km(20_000, 30_001), "EXTRA_DISTANCE_LIMIT")

    def test_multiple_measurements_share_one_total_extra_limit(self):
        self.assertEqual(check_measurement_extra_km(20_000, 30_001, measurement_count=2), "EXTRA_DISTANCE_LIMIT")

    def test_measurement_before_first_install_uses_team_start_as_baseline(self):
        self.assertEqual(check_measurement_extra_km(8_000, 18_000, before_first_install=True), "PASS")

    def test_after_last_measurement_without_end_point_is_unknown(self):
        self.assertEqual(check_measurement_extra_km(20_000, 22_000, after_last_install=True, end_point_known=False), "MANUAL_REVIEW")


class ScheduleTests(unittest.TestCase):
    def test_three_hour_window_includes_drive_and_work(self):
        self.assertEqual(check_window_fit(3_600, 7_200), "PASS")
        self.assertEqual(check_window_fit(3_601, 7_200), "WINDOW_EXCEEDED")

    def test_continuous_schedule_detects_overlap(self):
        activities = [RouteActivity("install-1", 0, 7_200), RouteActivity("measurement-1", 7_100, 8_000)]
        self.assertEqual(route_distance([5_000, 3_000]), 8_000)
        self.assertEqual(route_has_missing_data(activities), False)
        from map04.rules import check_continuity
        self.assertEqual(check_continuity(activities), "SCHEDULE_COLLISION")

    def test_return_after_last_install_is_not_counted(self):
        self.assertEqual(route_distance([10_000, 5_000], include_return=False), 15_000)
        self.assertEqual(route_distance([10_000, 5_000], include_return=True, return_distance_m=5_000), 20_000)

    def test_one_worker_cannot_overlap_measurement_and_installation(self):
        activities = [RouteActivity("install", 0, 3_600), RouteActivity("measurement", 3_500, 5_000)]
        from map04.rules import check_continuity
        self.assertEqual(check_continuity(activities), "SCHEDULE_COLLISION")


class CapacityAndOverrideTests(unittest.TestCase):
    def test_two_slot_job_requires_adjacent_slots_of_one_team(self):
        self.assertTrue(two_slot_reservation_ok([("team-a", 1), ("team-a", 2)]))
        self.assertFalse(two_slot_reservation_ok([("team-a", 1), ("team-a", 3)]))
        self.assertFalse(two_slot_reservation_ok([("team-a", 1), ("team-b", 2)]))

    def test_capacity_requires_qualified_non_conflicting_matching(self):
        reservations = [
            {"id": "a", "start": 0, "end": 100, "skills": ["fiber"]},
            {"id": "b", "start": 0, "end": 100, "skills": ["fiber", "bsa"]},
        ]
        teams = [
            {"id": "t1", "skills": ["fiber"]},
            {"id": "t2", "skills": ["fiber", "bsa"]},
        ]
        self.assertEqual(check_resource_matching(reservations, teams), "PASS")
        self.assertEqual(check_resource_matching(reservations, teams[:1]), "NO_QUALIFIED_CAPACITY")

    def test_non_overlapping_reservations_can_share_one_team(self):
        reservations = [
            {"id": "morning", "start": 0, "end": 100, "skills": ["fiber"]},
            {"id": "afternoon", "start": 100, "end": 200, "skills": ["fiber"]},
        ]
        teams = [{"id": "only-team", "skills": ["fiber"]}]
        self.assertEqual(check_resource_matching(reservations, teams), "PASS")

    def test_d_minus_one_assignment_preserves_confirmed_window(self):
        reservations = [{"id": "confirmed", "start": 100, "end": 200, "skills": ["bsa"], "confirmed": True}]
        teams = [{"id": "qualified", "skills": ["bsa"]}]
        self.assertEqual(check_resource_matching(reservations, teams, final_assignments={"confirmed": "qualified"}), "PASS")
        self.assertEqual(check_resource_matching(reservations, teams, final_assignments={"confirmed": "wrong"}), "CONFIRMATION_VIOLATION")

    def test_risky_travel_can_be_overridden_only_with_audit_record(self):
        decision = {"issue": "TRAVEL_TIME_RISK", "actor": "coordinator", "reason": "confirmed with team", "at": "2026-11-15T18:00:00+01:00"}
        self.assertEqual(manual_override("TRAVEL_TIME_RISK", decision)[0], "WARN_OVERRIDDEN")
        self.assertEqual(manual_override("DISTANCE_LIMIT", decision)[0], "HARD_BLOCK")
        self.assertEqual(manual_override("TRAVEL_TIME_RISK", {"actor": "coordinator"})[0], "AUDIT_REQUIRED")


class FixtureRoutingAdapterTests(unittest.TestCase):
    def test_fixture_adapter_returns_repeatable_provider_labeled_results(self):
        adapter = FixtureRoutingAdapter({
            "A->B|fastest": {"distance_m": 31_200, "duration_s": 1_800},
            "A->B|shortest": {"distance_m": 29_800, "duration_s": 2_100},
        })
        fastest = adapter.route(["A", "B"], preference="fastest")
        shortest = adapter.route(["A", "B"], preference="shortest")
        self.assertEqual((fastest.distance_m, fastest.duration_s), (31_200, 1_800))
        self.assertEqual((shortest.distance_m, shortest.duration_s), (29_800, 2_100))
        self.assertEqual(fastest.source, "synthetic_fixture")
        self.assertEqual(adapter.route(["A", "B"], preference="fastest"), fastest)


if __name__ == "__main__":
    unittest.main()
