from fastapi import APIRouter, Depends

from app.deps import require_admin
from app.routers.admin import catalog, orders, system, users

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
router.include_router(catalog.router)
router.include_router(users.router)
router.include_router(orders.router)
router.include_router(system.router)
