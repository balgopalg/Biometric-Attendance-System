from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Migration:
    migration_id: str
    name: str
    upgrade: Callable[[], dict]
