from __future__ import annotations

from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field


class Error(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    data: List[T]
    next_cursor: Optional[str] = None
