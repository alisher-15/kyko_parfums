from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import PasswordResetToken, User
from app.schemas.auth import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    ProfileUpdate,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenPair,
    UserOut,
    WholesaleRequestIn,
)
from app.schemas.common import Message
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.services.email import send_password_reset

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(prefix="/me", tags=["account"])


def issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id, user.token_version),
        user=UserOut.model_validate(user),
    )


def _authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Учётная запись заблокирована")
    return user


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже существует")
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return issue_tokens(user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginIn, db: Session = Depends(get_db)):
    return issue_tokens(_authenticate(db, data.email, data.password))


@router.post("/token", response_model=TokenPair, include_in_schema=True)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow (used by the Swagger UI "Authorize" button)."""
    return issue_tokens(_authenticate(db, form.username, form.password))


@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshIn, db: Session = Depends(get_db)):
    payload = decode_token(data.refresh_token, "refresh")
    user = db.get(User, int(payload["sub"])) if payload else None
    if (
        payload is None
        or user is None
        or not user.is_active
        or payload.get("ver") != user.token_version
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла, войдите заново")
    return issue_tokens(user)


@router.post("/forgot-password", response_model=Message)
def forgot_password(
    data: ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)
):
    user = db.scalar(select(User).where(User.email == data.email))
    if user is not None and user.is_active:
        # Only the latest link is valid.
        db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
            .values(used_at=datetime.now(UTC))
        )
        raw, token_hash = generate_reset_token()
        ttl = timedelta(minutes=get_settings().password_reset_ttl_minutes)
        db.add(
            PasswordResetToken(
                user_id=user.id, token_hash=token_hash, expires_at=datetime.now(UTC) + ttl
            )
        )
        db.commit()
        background.add_task(send_password_reset, user.email, raw)
    # Same answer whether or not the email exists.
    return Message(detail="Если такой email зарегистрирован, мы отправили на него ссылку")


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    token = db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == hash_reset_token(data.token))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if token is None or token.used_at is not None or token.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ссылка недействительна или устарела")
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ссылка недействительна или устарела")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    token.used_at = now
    db.commit()
    return Message(detail="Пароль изменён, теперь можно войти")


# ---------- Account ----------


@me_router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@me_router.patch("", response_model=UserOut)
def update_me(
    data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@me_router.post("/change-password", response_model=TokenPair)
def change_password(
    data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль указан неверно")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # log out other sessions
    db.commit()
    db.refresh(user)
    return issue_tokens(user)


@me_router.post("/wholesale-request", response_model=UserOut)
def request_wholesale(
    data: WholesaleRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Ask for a wholesale account; an admin reviews it and changes the role manually."""
    user.company_name = data.company_name
    user.phone = data.phone
    user.wholesale_requested = True
    db.commit()
    db.refresh(user)
    return user
