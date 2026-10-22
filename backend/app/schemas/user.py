import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.ENGINEER
    avatar_url: Optional[str] = None
    workspace_id: Optional[uuid.UUID] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None
    workspace_id: Optional[uuid.UUID] = None


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class UserPasswordChange(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class UserResetPassword(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


class UserLogin(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

    @model_validator(mode="before")
    def populate_identifier(cls, values):
        if isinstance(values, dict):
            identifier = values.get("username") or values.get("email")
            values["username"] = identifier
            values["email"] = identifier
        return values


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    avatar_url: Optional[str] = None
    workspace_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None


class GoogleAuthResponse(BaseModel):
    status: str  # "authenticated" or "pending_approval"
    approved: bool
    access_token: Optional[str] = None
    lobby_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    user: Optional[UserResponse] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    message: Optional[str] = None


class LobbyStatusResponse(BaseModel):
    status: str  # "active" or "pending_approval"
    approved: bool
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    user: Optional[UserResponse] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None


class LobbyResendAlertRequest(BaseModel):
    email: str


class GoogleConfigRequest(BaseModel):
    client_id: str
