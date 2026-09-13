from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from sqlalchemy import select

from .config import settings
from .database import get_db
from .models import User,AuditLog


password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(value: str) -> str:
    return password_hash.hash(value)


def verify_password(value: str, hashed: str) -> bool:
    return password_hash.verify(value, hashed)


def create_token(user: User, kind: str = "access") -> tuple[str, str, datetime]:
    jti = uuid4().hex
    lifetime = timedelta(minutes=settings.access_token_minutes) if kind == "access" else timedelta(hours=settings.refresh_token_hours)
    expires = datetime.now(timezone.utc) + lifetime
    payload = {"sub": user.id, "role": user.role, "type": kind, "jti": jti, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm), jti, expires


def decode_token(token: str, expected: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": "Session is invalid or expired."}) from exc
    if payload.get("type") != expected:
        raise HTTPException(status_code=401, detail={"code": "wrong_token_type", "message": "Incorrect token type."})
    return payload


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "not_authenticated", "message": "Sign in is required."})
    payload = decode_token(credentials.credentials)
    if db.scalar(select(AuditLog.id).where(AuditLog.action=="ACCESS_REVOKED",AuditLog.target==payload["jti"])):
        raise HTTPException(401,detail={"code":"revoked_access","message":"This session was signed out."})
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": "inactive_user", "message": "User is unavailable."})
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Your role cannot perform this action."})
        return user
    return dependency
