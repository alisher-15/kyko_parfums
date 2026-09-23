from sqlalchemy.orm import Session

from app.models import PricingSettings


def get_pricing_settings(db: Session) -> PricingSettings:
    settings = db.get(PricingSettings, 1)
    if settings is None:
        settings = PricingSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings
