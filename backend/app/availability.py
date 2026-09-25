"""What customers learn about stock (a pure function, like pricing.py).

Stock is business data, and the shop sells what it doesn't have too (backorders: missing goods
usually arrive in 1-2 days). So the storefront says nothing about stock except "few left"
(1-5 units), which helps sell. In stock, out of stock and backorders are shown in the admin
panel only.
"""

# At or below this, the storefront says "Осталось мало: N шт.".
LOW_STOCK = 5


def low_stock(stock: int) -> int | None:
    """The count to show customers ("осталось 2 шт."), or None to show nothing."""
    return stock if 0 < stock <= LOW_STOCK else None
