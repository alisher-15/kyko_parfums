// The customer-facing API types, the same as frontend/src/lib/types.ts (admin types left out).

// Staff (admin, cashier, warehouse) buy at retail prices on the storefront.
export type UserRole =
  "retail" | "wholesale" | "bulk_wholesale" | "admin" | "cashier" | "warehouse";
export type Gender = "female" | "male" | "unisex";
export type PriceTier = "retail" | "wholesale" | "bulk";
export type PricingMode = "order_total" | "item_quantity";
export type OrderStatus = "new" | "processing" | "shipped" | "delivered" | "cancelled";
export type OrderChannel = "online" | "store";
export type PaymentMethod = "cash" | "card" | "transfer" | "other";
export type ProductSort = "default" | "price_asc" | "price_desc" | "name" | "new";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface User {
  id: number;
  email: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  wholesale_requested: boolean;
  requested_role: UserRole | null;
  upgrade_request_note: string | null;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface BrandBrief {
  id: number;
  name: string;
}

export interface Brand extends BrandBrief {
  logo_url: string | null;
  description: string | null;
  product_count: number;
}

export interface CurrencyInfo {
  /** Tenge per dollar; null while the shop has no rate. */
  usd_rate: number | null;
  updated_at: string | null;
}

/** A running promotion that lowers the price the viewer pays. */
export interface Deal {
  promotion_id: number;
  title: string;
  /** Percent off the retail price. */
  discount_percent: number;
  ends_on: string | null;
}

export interface VariantPublic {
  id: number;
  volume_ml: number;
  /** The same perfume in plain packaging, sold next to the bottle of the same volume. */
  is_tester: boolean;
  sku: string | null;
  /** Only when few units are left ("Осталось мало"); stock state is admin data. */
  stock: number | null;
  photo_url: string | null;
  price: number;
  price_tier: PriceTier;
  retail_price: number;
  wholesale_price: number | null;
  bulk_price: number | null;
  next_tier: PriceTier | null;
  next_tier_price: number | null;
  /** Set when `price` is a promotion price. */
  deal: Deal | null;
}

export interface ProductListItem {
  id: number;
  name: string;
  brand: BrandBrief;
  type: string | null;
  category: string | null;
  gender: Gender | null;
  longevity: string | null;
  image_url: string | null;
  /** The cheapest variant the viewer can buy, testers included. */
  min_price: number | null;
  /** Distinct volumes: a bottle and a tester of one size count once. */
  volumes: number[];
  /** Marked «Новинка» by an admin. */
  is_new: boolean;
  /** A running promotion lowers a price the viewer pays (the "−15%" badge). */
  deal: Deal | null;
}

export interface ProductDetail extends ProductListItem {
  top_notes: string | null;
  mid_notes: string | null;
  base_notes: string | null;
  description: string | null;
  variants: VariantPublic[];
}

export interface PromotionPublic {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  /** A finished banner with its own text: shown whole, without the app's text over it. */
  image_only: boolean;
  discount_percent: number | null;
  starts_on: string | null;
  ends_on: string | null;
}

export interface Filters {
  brands: (BrandBrief & { product_count: number })[];
  genders: Gender[];
  categories: string[];
  types: string[];
  price_min: number | null;
  price_max: number | null;
}

export interface PricingRules {
  mode: PricingMode;
  role: UserRole | null;
  max_tier: PriceTier;
  visible_tiers: PriceTier[];
  wholesale_min_order_amount: number | null;
  bulk_min_order_amount: number | null;
  wholesale_min_item_qty: number | null;
  bulk_min_item_qty: number | null;
  next_role: UserRole | null;
  next_tier: PriceTier | null;
  next_tier_terms: string | null;
}

export interface QuoteLine {
  variant_id: number;
  product_id: number;
  product_name: string;
  brand_name: string;
  volume_ml: number;
  is_tester: boolean;
  image_url: string | null;
  quantity: number;
  price_tier: PriceTier;
  unit_price: number;
  retail_unit_price: number;
  line_total: number;
  promotion_title: string | null;
}

export interface TierHint {
  tier: PriceTier;
  missing_amount: number | null;
  variant_id: number | null;
  missing_qty: number | null;
}

export interface Quote {
  mode: PricingMode;
  lines: QuoteLine[];
  unavailable_variant_ids: number[];
  total: number;
  retail_total: number;
  savings: number;
  price_tier: PriceTier | null;
  hints: TierHint[];
  can_checkout: boolean;
  next_tier: PriceTier | null;
  next_tier_total: number | null;
}

export interface OrderItem {
  id: number;
  variant_id: number | null;
  product_id: number | null;
  brand_name: string;
  product_name: string;
  volume_ml: number;
  is_tester: boolean;
  quantity: number;
  original_quantity: number;
  /** Admin only: units not in stock at checkout, ordered from a supplier. */
  backordered?: number;
  returned_quantity: number;
  list_price: number;
  discount_percent: number;
  price_applied: number;
  price_tier: PriceTier;
  line_total: number;
  promotion_title: string | null;
}

export interface OrderReturn {
  id: number;
  created_at: string;
  refund_amount: number;
  refund_method: PaymentMethod | null;
  reason: string | null;
  items: {
    order_item_id: number;
    product_label: string;
    quantity: number;
    restock: boolean;
    amount: number;
  }[];
}

export interface OrderEvent {
  kind: "created" | "status" | "edited" | "returned";
  message: string;
  created_at: string;
}

export interface Order {
  id: number;
  channel: OrderChannel;
  status: OrderStatus;
  total_amount: number;
  discount_total: number;
  customer_role: UserRole;
  payment_method: PaymentMethod | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  delivery_city: string | null;
  delivery_address: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  returned_amount: number;
  net_total: number;
  fully_returned: boolean;
  returns: OrderReturn[];
  events: OrderEvent[];
}

export interface OrderBrief {
  id: number;
  channel: OrderChannel;
  status: OrderStatus;
  total_amount: number;
  returned_amount: number;
  created_at: string;
  items_count: number;
}
