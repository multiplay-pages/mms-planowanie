"""Business-rule validator for the synthetic MAP-04 benchmark.

The module accepts routing measurements as inputs. It does not fabricate road
distances: a live provider or an explicitly synthetic fixture must supply them.
"""

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence


DISTANCE_LIMIT_M = 30_000
MEASUREMENT_EXTRA_LIMIT_M = 10_000


@dataclass(frozen=True)
class RouteActivity:
    activity_id: str
    start_s: int | None
    end_s: int | None


def check_30km_limit(distance_m: int | float | None, *, via_measurement: bool = False) -> str:
    """Check the actually travelled road distance between consecutive installs."""
    del via_measurement  # the same limit applies to the complete traveled path
    if distance_m is None or distance_m < 0:
        return "ROUTE_UNKNOWN"
    return "PASS" if distance_m <= DISTANCE_LIMIT_M else "DISTANCE_LIMIT"


def check_measurement_extra_km(
    baseline_route_m: int | float | None,
    route_with_measurements_m: int | float | None,
    *,
    measurement_count: int = 1,
    before_first_install: bool = False,
    after_last_install: bool = False,
    end_point_known: bool = True,
) -> str:
    """Apply one shared +10 km cap to the route delta for all measurements."""
    del measurement_count, before_first_install  # qualifiers affect route construction, not the cap
    if after_last_install and not end_point_known:
        return "MANUAL_REVIEW"
    if baseline_route_m is None or route_with_measurements_m is None:
        return "ROUTE_UNKNOWN"
    if baseline_route_m < 0 or route_with_measurements_m < 0:
        return "ROUTE_UNKNOWN"
    delta_m = route_with_measurements_m - baseline_route_m
    return "PASS" if delta_m <= MEASUREMENT_EXTRA_LIMIT_M else "EXTRA_DISTANCE_LIMIT"


def check_window_fit(travel_s: int, service_s: int, window_s: int = 10_800) -> str:
    """Travel and on-site work share the customer window."""
    if min(travel_s, service_s, window_s) < 0:
        return "INVALID_DURATION"
    return "PASS" if travel_s + service_s <= window_s else "WINDOW_EXCEEDED"


def check_continuity(activities: Sequence[RouteActivity]) -> str:
    """Reject unknown times and overlaps in the actual shared-person schedule."""
    if any(a.start_s is None or a.end_s is None or a.end_s < a.start_s for a in activities):
        return "TIME_UNKNOWN"
    ordered = sorted(activities, key=lambda a: (a.start_s, a.end_s))
    for previous, current in zip(ordered, ordered[1:]):
        if current.start_s < previous.end_s:  # adjacent activities may touch
            return "SCHEDULE_COLLISION"
    return "PASS"


def route_distance(
    leg_distances_m: Iterable[int | float],
    *,
    include_return: bool = False,
    return_distance_m: int | float = 0,
) -> int | float:
    """Sum exact leg meters; return leg is deliberately opt-in."""
    distances = list(leg_distances_m)
    if any(d < 0 for d in distances) or return_distance_m < 0:
        raise ValueError("Route distances must be non-negative meters")
    return sum(distances) + (return_distance_m if include_return else 0)


def route_has_missing_data(activities: Sequence[RouteActivity]) -> bool:
    return any(a.start_s is None or a.end_s is None for a in activities)


def two_slot_reservation_ok(slots: Sequence[tuple[str, int]]) -> bool:
    """A two-slot job uses two consecutive slots on one qualified team."""
    return (
        len(slots) == 2
        and slots[0][0] == slots[1][0]
        and slots[1][1] == slots[0][1] + 1
    )


def _eligible_teams(reservation: Mapping, teams: Sequence[Mapping]) -> list[str]:
    needed = set(reservation.get("skills", []))
    return [str(team["id"]) for team in teams if needed.issubset(set(team.get("skills", [])))]


def _overlap(a: Mapping, b: Mapping) -> bool:
    return max(a["start"], b["start"]) < min(a["end"], b["end"])


def check_resource_matching(
    reservations: Sequence[Mapping],
    teams: Sequence[Mapping],
    *,
    final_assignments: Mapping[str, str] | None = None,
) -> str:
    """Find a simultaneous qualified allocation without fixing a team in advance.

    When D-1 assignments are supplied, they must preserve the confirmed window,
    qualifications, and non-overlap. Otherwise a backtracking matching proves
    the pool can serve all overlapping reservations at the same time.
    """
    team_ids = {str(t["id"]) for t in teams}
    if final_assignments is not None:
        for reservation in reservations:
            assigned = final_assignments.get(str(reservation["id"]))
            if assigned not in team_ids or assigned not in _eligible_teams(reservation, teams):
                return "CONFIRMATION_VIOLATION"
        for i, first in enumerate(reservations):
            for second in reservations[i + 1 :]:
                if final_assignments.get(str(first["id"])) == final_assignments.get(str(second["id"])) and _overlap(first, second):
                    return "CONFIRMATION_VIOLATION"
        return "PASS"

    ordered = sorted(reservations, key=lambda r: len(_eligible_teams(r, teams)))
    assigned: dict[str, str] = {}

    def place(index: int) -> bool:
        if index == len(ordered):
            return True
        current = ordered[index]
        for team_id in _eligible_teams(current, teams):
            conflict = any(
                assigned.get(str(other["id"])) == team_id and _overlap(current, other)
                for other in ordered[:index]
            )
            if not conflict:
                assigned[str(current["id"])] = team_id
                if place(index + 1):
                    return True
                assigned.pop(str(current["id"]), None)
        return False

    return "PASS" if place(0) else "NO_QUALIFIED_CAPACITY"


def manual_override(issue: str, decision: Mapping) -> tuple[str, dict | None]:
    """Only warning-level travel risk may be overridden in the default policy."""
    if issue != "TRAVEL_TIME_RISK":
        return "HARD_BLOCK", None
    required = ("actor", "reason", "at")
    if any(not decision.get(key) for key in required):
        return "AUDIT_REQUIRED", None
    return "WARN_OVERRIDDEN", {"issue": issue, **{key: decision[key] for key in required}}
