"""Management commands.

python -m app.cli create-admin admin@example.com 'password'
python -m app.cli import-catalog ../data/catalog.xlsx [--sheet NAME] [--dry-run]
python -m app.cli template ../data/catalog_template.xlsx
python -m app.cli seed-demo
python -m app.cli migrate
"""

import argparse
import json
import os
import sys
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import select

from alembic import command
from app.db import SessionLocal, engine
from app.models import Product, User, UserRole
from app.security import hash_password
from app.services.importer import build_template, import_catalog


def create_admin(email: str, password: str) -> None:
    email = email.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, password_hash=hash_password(password), role=UserRole.admin)
            db.add(user)
            action = "created"
        else:
            user.role = UserRole.admin
            user.is_active = True
            user.password_hash = hash_password(password)
            user.token_version += 1
            action = "updated"
        db.commit()
    print(f"Admin {email} {action}")


def import_cmd(path: str, sheet: str | None, dry_run: bool) -> int:
    p = Path(path)
    with SessionLocal() as db:
        report = import_catalog(db, p.read_bytes(), p.name, sheet=sheet, dry_run=dry_run)
    print(json.dumps(report.model_dump(), ensure_ascii=False, indent=2))
    return 0


def migrate() -> None:
    """`alembic upgrade head` that still lets the app start when the database is ahead of the code.

    A failed deploy can leave the database migrated by the new version while the platform keeps
    running the previous one. Migrations only add tables, columns and looser constraints, so the
    previous version works on the newer schema; refusing to start would take the site down.
    """
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    known = {script.revision for script in ScriptDirectory.from_config(cfg).walk_revisions()}
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_heads()
    unknown = [rev for rev in current if rev not in known]
    if unknown:
        print(
            f"Database is at revision {', '.join(unknown)}, newer than this code — "
            "migrations skipped, starting anyway",
            file=sys.stderr,
        )
        return
    command.upgrade(cfg, "head")


def bootstrap() -> None:
    email, password = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
    if email and password:
        with SessionLocal() as db:
            exists = db.scalar(select(User.id).where(User.email == email.strip().lower()))
        if exists:
            print(f"Admin {email} already exists — left unchanged")
        elif len(password) < 8:
            print("ADMIN_PASSWORD must be at least 8 characters — admin not created")
        else:
            create_admin(email, password)
    if os.environ.get("SEED_DEMO", "").lower() in {"1", "true", "yes"}:
        with SessionLocal() as db:
            empty = db.scalar(select(Product.id).limit(1)) is None
        if empty:
            from app.seed import seed_demo

            seed_demo()
        else:
            print("Catalog is not empty — demo data skipped")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("create-admin", help="create or promote an admin user")
    p.add_argument("email")
    p.add_argument("password")

    p = sub.add_parser("import-catalog", help="import brands/products from .xlsx or .csv")
    p.add_argument("path")
    p.add_argument("--sheet")
    p.add_argument("--dry-run", action="store_true")

    p = sub.add_parser("template", help="write an empty import template (.xlsx)")
    p.add_argument("path")

    sub.add_parser("seed-demo", help="fill the catalog with demo products, prices and users")
    sub.add_parser("bootstrap", help="create admin / demo data from environment variables")
    sub.add_parser("migrate", help="apply migrations; skip if the database is newer than the code")

    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        if len(args.password) < 8:
            print("Password must be at least 8 characters", file=sys.stderr)
            return 1
        create_admin(args.email, args.password)
    elif args.cmd == "import-catalog":
        return import_cmd(args.path, args.sheet, args.dry_run)
    elif args.cmd == "template":
        Path(args.path).write_bytes(build_template())
        print(f"Template written to {args.path}")
    elif args.cmd == "seed-demo":
        from app.seed import seed_demo

        seed_demo()
    elif args.cmd == "bootstrap":
        bootstrap()
    elif args.cmd == "migrate":
        migrate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
