"""Management commands.

python -m app.cli create-admin admin@example.com 'password'
python -m app.cli import-catalog ../data/catalog.xlsx [--sheet NAME] [--dry-run]
python -m app.cli template ../data/catalog_template.xlsx
python -m app.cli seed-demo
"""

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, UserRole
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
