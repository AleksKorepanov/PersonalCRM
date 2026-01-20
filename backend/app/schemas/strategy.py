from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Strategy(BaseModel):
    workspace_id: str
    vision: Optional[str] = None
    goals: List[Dict[str, Any]] = []
    swot: Dict[str, Any] = {}
    roadmap: Dict[str, Any] = {}
    updated_at: str


class StrategyUpsert(BaseModel):
    vision: Optional[str] = None
    goals: Optional[List[Dict[str, Any]]] = None
    swot: Optional[Dict[str, Any]] = None
    roadmap: Optional[Dict[str, Any]] = None


class WheelSegment(BaseModel):
    workspace_id: str
    key: str
    current: int = Field(ge=0, le=10)
    target: int = Field(ge=0, le=10)
    notes: Optional[str] = None
    updated_at: str


class WheelSegmentUpsert(BaseModel):
    key: str
    current: int = Field(ge=0, le=10)
    target: int = Field(ge=0, le=10)
    notes: Optional[str] = None
