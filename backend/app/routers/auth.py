import secrets
from datetime import UTC, datetime, timedelta
from math import ceil

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import PasswordResetToken, PushToken, User, UserRole
from app.permissions import STAFF
from app.pricing import next_role
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    ForgotPasswordIn,
    LoginIn,
    ProfileUpdate,
    PushTokenForgetIn,
    PushTokenIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenPair,
    UpgradeRequestIn,
    UserOut,
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
from app.services import push
from app.services.email import send_password_reset
from app.services.throttle import login_failures, reset_emails

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(prefix="/me", tags=["account"])


def issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
        user=UserOut.model_validate(user),
    )


def _authenticate(db: Session, email: str, password: str) -> User:
    email = email.strip().lower()
    wait = login_failures.retry_after(email)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Слишком много неудачных попыток входа. Попробуйте через {ceil(wait / 60)} мин.",
            headers={"Retry-After": str(wait)},
        )
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        login_failures.hit(email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Учётная запись заблокирована")
    login_failures.reset(email)
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
    if user is not None and user.is_active and not reset_emails.retry_after(user.email):
        reset_emails.hit(user.email)
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
    # Same answer whether or not the email exists (or was throttled).
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


@me_router.post("/upgrade-request", response_model=UserOut)
@me_router.post("/wholesale-request", response_model=UserOut, include_in_schema=False)
def request_upgrade(
    data: UpgradeRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Ask for the next price level (retail -> wholesale, wholesale -> bulk).

    An admin reviews the request and changes the role manually.
    """
    target = next_role(user.role)
    if target is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "У вас уже максимальный уровень цен")
    company = (data.company_name or "").strip() or user.company_name
    phone = (data.phone or "").strip() or user.phone
    if target == UserRole.wholesale and not (company and phone):
        raise HTTPException(422, "Укажите компанию и телефон для связи")
    user.company_name = company
    user.phone = phone
    user.wholesale_requested = True
    user.requested_role = target
    user.upgrade_request_note = (data.note or "").strip() or None
    db.commit()
    db.refresh(user)
    return user


@me_router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    data: DeleteAccountIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Delete the account from the app or the site (App Store rule 5.1.1(v)).

    Orders reference their customer and are the shop's sales records, so the row is anonymized
    instead of removed: the email, name, phone, company and upgrade request are erased, the
    password is replaced with a random one, and every session ends. Orders keep the contact
    details given at checkout. The email can be registered again as a new account.
    """
    # Staff accounts belong to the shop: the owner manages them in the admin panel.
    if user.role in STAFF:
        raise HTTPException(status.HTTP_409_CONFLICT, "Аккаунт сотрудника магазина нельзя удалить")
    # The same throttle as logging in: a stolen session must not be a way to guess the password.
    wait = login_failures.retry_after(user.email)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Слишком много неверных паролей. Попробуйте через {ceil(wait / 60)} мин.",
            headers={"Retry-After": str(wait)},
        )
    if not verify_password(data.password, user.password_hash):
        login_failures.hit(user.email)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пароль указан неверно")
    login_failures.reset(user.email)

    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    db.execute(delete(PushToken).where(PushToken.user_id == user.id))
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.full_name = None
    user.phone = None
    user.company_name = None
    user.wholesale_requested = False
    user.requested_role = None
    user.upgrade_request_note = None
    user.is_active = False
    user.token_version += 1  # revoke refresh tokens; access tokens fail on is_active
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Order notifications on phones (services/push.py) ----------


@me_router.post("/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(
    data: PushTokenIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """The app's phone, after the customer allowed notifications. A token already registered
    by someone else on this phone moves to the user signed in now."""
    if not push.is_token(data.token):
        raise HTTPException(422, "Это не адрес для уведомлений Expo")
    db.execute(
        insert(PushToken)
        .values(user_id=user.id, token=data.token, platform=data.platform)
        .on_conflict_do_update(
            index_elements=[PushToken.token],
            set_={"user_id": user.id, "platform": data.platform, "updated_at": func.now()},
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/push-tokens/forget", status_code=status.HTTP_204_NO_CONTENT)
def forget_push_token(data: PushTokenForgetIn, db: Session = Depends(get_db)):
    """On logout the app stops this phone's notifications. No session needed: it may already
    have expired, and the token itself is known only to the phone."""
    db.execute(delete(PushToken).where(PushToken.token == data.token))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
