# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kyko Parfums is a perfume marketplace for retail and wholesale buyers. The backend is FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16 in `backend/`. The frontend is Next.js 16 (App Router) + React 19 + Tailwind 4 in `frontend/`, and the admin panel lives at `/admin` in the same app. The README and the UI are in Russian; code and comments are in English. [README.md](README.md) is the detailed product spec (pricing rules, POS, returns, warehouse). Read it before you change business logic.

## Commands

Backend (run from `backend/`; needs a local PostgreSQL with DBs `kyko` and `kyko_test`, owner `kyko`/`kyko`):

```bash
pip install -r requirements-dev.txt
cp .env.example .env
python -m app.cli migrate                # alembic upgrade + schema_compat check (use this, not bare alembic)
python -m app.cli create-admin admin@example.com admin12345
python -m app.cli seed-demo              # demo catalog + retail/wholesale/bulk@example.com, password123
uvicorn app.main:app --reload            # http://localhost:8000, Swagger at /docs

pytest                                   # all tests
pytest tests/test_orders.py::test_name   # single test
ruff check . && ruff format --check .
```

Other CLI subcommands: `import-catalog <file> [--dry-run]`, `template <file>`, `bootstrap` (admin/demo data from the ADMIN_EMAIL / ADMIN_PASSWORD / SEED_DEMO env vars; used on deploy).

Product photos: `python scripts/normalize_photos.py ../frontend/public/bottles [--dry-run]` (needs Pillow, in requirements-dev) makes every bottle photo a 600×600 white square with the bottle at the same scale. Run it after adding photos; processed files are marked and skipped next time.

Frontend (run from `frontend/`):

```bash
npm run dev                  # http://localhost:3000; /api and /media are proxied to BACKEND_URL (default :8000)
npm run lint && npm run typecheck && npm run build   # typecheck = next typegen + tsc (PageProps/LayoutProps are generated)
```

Browser tests (run from `e2e/`; Playwright starts the API on a wiped `kyko_e2e` database with demo data and `next start` on the existing frontend build):

```bash
npm ci && npx playwright install chromium
PYTHON=../backend/.venv/bin/python npx playwright test          # all 29 scenarios, ~2 min
npx playwright test tests/warehouse.spec.ts                      # one file
```

Tests share one database and run one at a time, so each test creates the users and barcodes it changes (`newCustomer`, `randomEan`) and tops up the stock it sells (`ensureStock`); don't rely on demo data staying as seeded. Any JS error in the browser fails the test (`tests/support.ts`). The camera tests use a generated Y4M video of `CAMERA_CODES` as Chromium's fake webcam.

Full stack: `docker compose up -d --build`.

## Frontend: Next.js 16

[frontend/AGENTS.md](frontend/AGENTS.md): this Next.js version has breaking changes compared with your training data. Before you write Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/`. `next dev` re-adds that AGENTS.md block, so commit it rather than removing it.

## Architecture

**Single origin.** The browser only talks to Next.js. `next.config.ts` rewrites `/api/*` and `/media/*` to FastAPI. Rewrites are resolved at build time, so `BACKEND_URL` must be set during `next build`. Pages are client-rendered because prices depend on the viewer's role. `src/lib/api.ts` is the API client (JWT in localStorage, automatic refresh), and `src/lib/cart.tsx` keeps the cart in localStorage.

**Deploy.** There are two packaging modes:
- `docker-compose.yml` uses the separate `backend/` and `frontend/` images.
- The root `Dockerfile` plus `deploy/start.sh` is an all-in-one image for Render (`render.yaml`): migrate → bootstrap → uvicorn on 127.0.0.1:8000 → Next standalone server on `$PORT`.

**Pricing** (`app/pricing.py`, pure functions). There are three tiers: retail, wholesale and bulk. The customer's role caps the best tier they can get. The tier is chosen by the thresholds in the `pricing_settings` row, in `order_total` mode (one tier for the whole order) or `item_quantity` mode (a tier per line). A missing wholesale or bulk price falls back to the tier above it. Business rule: the wholesale level is decided by the role, not by the order size, so in production both thresholds are 0 (the threshold modes stay available in «Цены и скидки»). Wholesale customers additionally see the bulk price as a teaser (`next_tier_price`, `teaser_tier`), switchable by `pricing_settings.show_next_tier`; upgrade requests always target the next role (`next_role`). The server always computes prices (`POST /api/cart/quote`, `POST /api/orders`), and order items store a snapshot of price, tier, cost and product. Retail users and guests must never see wholesale prices in API responses; see `visible_tiers`.

**Stock.** Every stock change must go through `services/stock.move_stock` (or `set_stock`), which writes the `stock_movements` journal. The caller locks the rows with `lock_variants` (SELECT … FOR UPDATE) and commits. Stock is deducted when an order is placed and returned on cancel, edit or return. Stock may go below zero only through online checkout and stock counts (`allow_backorder=True`): customers can order what the shop doesn't have (a backorder, `order_items.backordered` records the missing units), and the minus is what they are owed; receipts fill it first, the till never sells into it. Stock counts set stock = counted − units in orders not shipped yet (`services/warehouse.reserved`). Receipts (`services/warehouse.py`) update `cost_price` by a moving average. Stock counts set counted variants to the counted quantity. Barcodes live in `variant_barcodes`, and `services/barcodes.py` normalizes them (UPC-A = EAN-13 with a leading 0). Exact stock is business data: customer-facing responses send `availability` (in_stock / low / out) and `stock` only when it is low (≤ 5) or the viewer is wholesale, bulk or admin (`app/availability.py`); never return the exact count to guests or retail buyers.

**Orders** (`services/orders.py`). There are two channels (`OrderChannel`): `online` (placed on the site) and `store` (entered by an admin at `/admin/pos`). Store sales are created as delivered, with an optional customer and a per-line discount capped by `max_store_discount_percent`. Status flow: new → processing → shipped → delivered; an order can be cancelled before delivery. Before delivery an order can be edited (lines removed or reduced). After delivery it gets partial returns, where each line goes back to stock or is written off. Every change is added to the order history, which the customer also sees. Dashboard revenue and margin count delivered orders only (net of returns); orders not handed over yet are shown separately as in progress.

**Routers.** `routers/{auth,catalog,orders}.py` are public or customer-facing. `routers/admin/*` are protected by `deps.require_admin`. The Pydantic schemas are in `app/schemas/`.

**Models.** Enums are stored as VARCHAR + CHECK (`_enum()` in `models.py`), not native PG enums, so adding an enum value (e.g. a new `StockReason`) needs a migration that drops and recreates the CHECK constraint (see migrations 0003 and 0006). Money is `Decimal` internally and serialized to JSON as a number (`schemas/common.Money`). After a commit in the same session, reload objects with `.execution_options(populate_existing=True)` (see `order_load_options()`), and lock with `with_for_update(of=Model)` when the query has outer joins.

## Workflow

Work on a branch and open a PR into `main`. GitHub Actions (`.github/workflows/ci.yml`) runs the backend checks, the frontend checks and the browser tests on every PR and on `main`; merge only when all three jobs are green. When a UI text or flow changes, update the matching spec in `e2e/tests/`. Render auto-deploys `main`; migrations run at container start via `python -m app.cli migrate`. Before pushing, run the same checks locally.

## Migrations: required rule

Every Alembic migration must declare a module-level `backward_compatible = True/False`: can the code from before this migration run on the schema after it? Use True for new tables, nullable or server-default columns and looser constraints. Use False for NOT NULL without a default, drops, renames and stricter constraints. `app/migrations.py` records the newest breaking revision in the `schema_compat` table, so a previous build can still start after a failed deploy. A migration without the flag won't be applied, and `tests/test_migrations.py` fails. Never rename or change `schema_compat`. Split breaking changes into two releases: first add, then tighten or drop. Name migration files `YYYYMMDD_NNNN_description.py` with sequential revision ids (`"0006"`).

## Tests

pytest runs against real PostgreSQL at `TEST_DATABASE_URL` (default `postgresql+psycopg://kyko:kyko@localhost:5432/kyko_test`), never `DATABASE_URL`. The session fixture drops the schema and rebuilds it through the real Alembic migrations, and each test truncates all tables. Helpers are in `tests/conftest.py`: the `auth(role)` fixture returns headers for a new user with that role, plus `make_user` and `login`.
