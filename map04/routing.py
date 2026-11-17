"""Interchangeable routing contract and deterministic synthetic fixture adapter."""

from dataclasses import dataclass
from typing import Mapping, Protocol, Sequence


@dataclass(frozen=True)
class RouteResult:
    distance_m: float
    duration_s: float
    preference: str
    source: str


class RoutingAdapter(Protocol):
    provider: str

    def route(self, points: Sequence[str], *, preference: str = "fastest") -> RouteResult: ...


class FixtureRoutingAdapter:
    """Read route measurements from explicit, synthetic test fixtures only."""

    provider = "synthetic_fixture"

    def __init__(self, fixtures: Mapping[str, Mapping[str, float]]):
        self._fixtures = dict(fixtures)

    def route(self, points: Sequence[str], *, preference: str = "fastest") -> RouteResult:
        if len(points) < 2:
            raise ValueError("A route needs at least two point IDs")
        if preference not in {"fastest", "shortest"}:
            raise ValueError("Preference must be fastest or shortest")
        key = f"{'->'.join(points)}|{preference}"
        result = self._fixtures.get(key)
        if result is None:
            raise LookupError(f"No synthetic fixture for {key}")
        return RouteResult(
            distance_m=float(result["distance_m"]),
            duration_s=float(result["duration_s"]),
            preference=preference,
            source=self.provider,
        )
