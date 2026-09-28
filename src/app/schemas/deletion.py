from uuid import UUID

from pydantic import BaseModel, Field


class DeletionRequest(BaseModel):
    """Body of every permanent-deletion endpoint.

    `confirmation` must repeat the phrase returned by the matching
    `deletion-impact` endpoint, so a stray API call cannot erase data.
    """

    confirmation: str
    justification: str = Field(min_length=10, max_length=2000)


class DeletionImpact(BaseModel):
    entity_type: str
    entity_id: UUID
    label: str
    confirmation_phrase: str
    counts: dict[str, int]
    detached: dict[str, int]
    storage_objects: int
    active_jobs: int
    can_delete: bool
