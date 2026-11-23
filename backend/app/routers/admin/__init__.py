from fastapi import APIRouter, Depends

from app.permissions import Area, allow, require_staff
from app.routers.admin import (
    catalog,
    categories,
    currency,
    orders,
    promotions,
    store,
    suppliers,
    system,
    telegram,
    users,
    warehouse,
)

# Staff only; each part says whose it is (app/permissions.py). allow() alone: the owner's.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_staff)])
router.include_router(catalog.router, dependencies=[Depends(allow())])
router.include_router(categories.router, dependencies=[Depends(allow())])
# The till looks up the customer of a receipt.
router.include_router(users.router, dependencies=[Depends(allow(reading=(Area.till,)))])
router.include_router(orders.router, dependencies=[Depends(allow(Area.orders))])
router.include_router(system.router, dependencies=[Depends(allow())])
# Receipts and stock counts find volumes with the till's search.
router.include_router(store.router, dependencies=[Depends(allow(Area.till, reading=(Area.stock,)))])
router.include_router(warehouse.router, dependencies=[Depends(allow(Area.stock))])
router.include_router(promotions.router, dependencies=[Depends(allow())])
router.include_router(currency.router, dependencies=[Depends(allow())])
router.include_router(telegram.router, dependencies=[Depends(allow())])
router.include_router(suppliers.router, dependencies=[Depends(allow())])
