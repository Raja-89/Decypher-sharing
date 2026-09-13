from datetime import datetime
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict[str, str]


class CaseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10)
    priority: Literal["low","medium","high","critical"] = "medium"
    lead_investigator: str = "Current Investigator"


class CaseOut(ORMModel):
    id: str
    case_number: str
    title: str
    title_hi: str
    description: str
    description_hi: str
    status: str
    priority: str
    lead_investigator: str
    created_at: datetime
    updated_at: datetime


class EvidenceOut(ORMModel):
    id: str
    case_id: str
    name: str
    description: str
    type: str
    mime_type: str
    size: int
    sha256: str
    status: str
    verification_token: str
    created_at: datetime
    registered_at: datetime | None


class CopilotQuery(BaseModel):
    case_id: str
    question: str = Field(min_length=3, max_length=1000)
    locale: str = Field(default="en", pattern="^(en|hi)$")


class ReportRequest(BaseModel):
    locale: str = Field(default="en", pattern="^(en|hi)$")


class CustodyCreate(BaseModel):
    event: Literal["TRANSFERRED","RECEIVED","REVIEWED","SEALED","RELEASED"]
    actor_from: str = ""
    actor_to: str = ""
    location: str = ""
    notes: str = Field(default="",max_length=2000)


class ApiMessage(BaseModel):
    message: str
    data: dict[str, Any] | None = None
