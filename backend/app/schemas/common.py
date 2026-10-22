from typing import Any, Generic, Sequence, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: Sequence[T]
    total: int
    page: int
    page_size: int
    pages: int
