export type UserRole = "retail" | "wholesale" | "bulk_wholesale" | "admin";
export type Gender = "female" | "male" | "unisex";
export type PriceTier = "retail" | "wholesale" | "bulk";
export type PricingMode = "order_total" | "item_quantity";
export type OrderStatus = "new" | "processing" | "shipped" | "delivered" | "cancelled";
export type OrderChannel = "online" | "store";
export type PaymentMethod = "cash" | "card" | "transfer" | "other";
export type StockReason =
  | "online_order"
  | "store_sale"
  | "order_cancel"
  | "manual"
  | "import"
  | "order_edit"
  | "return"
  | "receipt"
  | "inventory";
export type DocumentStatus = "draft" | "posted";

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

export type Availability = "in_stock" | "low" | "out";

export interface VariantPublic {
  id: number;
  volume_ml: number;
  sku: string | null;
  /** Hidden (null) from guests and retail buyers unless few units are left. */
  stock: number | null;
  availability: Availability;
  photo_url: string | null;
  price: number;
  price_tier: PriceTier;
  retail_price: number;
  wholesale_price: number | null;
  bulk_price: number | null;
  next_tier: PriceTier | null;
  next_tier_price: number | null;
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
  min_price: number | null;
  volumes: number[];
  in_stock: boolean;
}

export interface ProductDetail extends ProductListItem {
  top_notes: string | null;
  mid_notes: string | null;
  base_notes: string | null;
  description: string | null;
  variants: VariantPublic[];
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
  image_url: string | null;
  quantity: number;
  /** Hidden (null) from guests and retail buyers unless few units are left. */
  stock: number | null;
  available: boolean;
  price_tier: PriceTier;
  unit_price: number;
  retail_unit_price: number;
  line_total: number;
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
  quantity: number;
  original_quantity: number;
  returned_quantity: number;
  list_price: number;
  discount_percent: number;
  price_applied: number;
  price_tier: PriceTier;
  line_total: number;
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

// ---------- Admin ----------

export interface AdminVariant {
  id: number;
  product_id: number;
  volume_ml: number;
  sku: string | null;
  stock: number;
  retail_price: number;
  wholesale_price: number | null;
  bulk_price: number | null;
  cost_price: number | null;
  barcodes: string[];
  photo_url: string | null;
  is_active: boolean;
}

export interface AdminProduct {
  id: number;
  brand_id: number;
  brand: BrandBrief;
  name: string;
  type: string | null;
  category: string | null;
  gender: Gender | null;
  longevity: string | null;
  top_notes: string | null;
  mid_notes: string | null;
  base_notes: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants: AdminVariant[];
}

export interface AdminUser extends User {
  is_active: boolean;
  orders_count: number;
}

export interface AdminOrder extends Order {
  user_id: number | null;
  user_email: string | null;
  created_by_email: string | null;
  admin_note: string | null;
}

export interface AdminOrderBrief {
  id: number;
  channel: OrderChannel;
  status: OrderStatus;
  total_amount: number;
  returned_amount: number;
  customer_role: UserRole;
  payment_method: PaymentMethod | null;
  contact_name: string | null;
  contact_phone: string | null;
  user_email: string | null;
  items_count: number;
  created_at: string;
}

export interface PricingSettings {
  mode: PricingMode;
  wholesale_min_order_amount: number;
  bulk_min_order_amount: number;
  wholesale_min_item_qty: number;
  bulk_min_item_qty: number;
  max_store_discount_percent: number;
  show_next_tier: boolean;
  next_tier_terms: string | null;
  updated_at?: string;
}

export interface ImportReport {
  dry_run: boolean;
  rows_total: number;
  rows_skipped: number;
  brands_created: number;
  products_created: number;
  products_updated: number;
  variants_created: number;
  variants_updated: number;
  errors: { row: number; error: string }[];
  unmapped_columns: string[];
}

export interface Stats {
  users_by_role: Record<UserRole, number>;
  wholesale_requests: number;
  orders_by_status: Record<OrderStatus, number>;
  revenue_total: number;
  refunds_total: number;
  revenue_by_channel: Record<OrderChannel, number>;
  store_sales_today: number;
  store_revenue_today: number;
  /** Placed but not delivered yet: not counted as revenue. */
  pending_orders: number;
  pending_total: number;
  gross_profit: number;
  costed_revenue: number;
  stock_value: number;
  variants_without_cost: number;
  products_total: number;
  products_without_variants: number;
  variants_low_stock: number;
  brands_total: number;
}

// ---------- Store sales (POS) ----------

export interface VariantSearchItem {
  variant_id: number;
  product_id: number;
  brand_name: string;
  product_name: string;
  volume_ml: number;
  sku: string | null;
  image_url: string | null;
  stock: number;
  retail_price: number;
  wholesale_price: number | null;
  bulk_price: number | null;
  cost_price: number | null;
  is_active: boolean;
  product_active: boolean;
}

export interface StoreQuoteLine {
  variant_id: number;
  product_id: number;
  brand_name: string;
  product_name: string;
  volume_ml: number;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  stock: number;
  available: boolean;
  list_price: number;
  discount_percent: number;
  unit_price: number;
  line_total: number;
}

export interface StoreQuote {
  price_tier: PriceTier;
  max_discount_percent: number;
  lines: StoreQuoteLine[];
  unavailable_variant_ids: number[];
  subtotal: number;
  discount_total: number;
  total: number;
  errors: string[];
  can_submit: boolean;
}

export interface StockMovement {
  id: number;
  variant_id: number;
  volume_ml: number;
  delta: number;
  stock_after: number;
  reason: StockReason;
  order_id: number | null;
  receipt_id: number | null;
  count_id: number | null;
  user_email: string | null;
  note: string | null;
  created_at: string;
}

// ---------- Warehouse: receipts and stock counts ----------

export interface ReceiptLine {
  id: number;
  variant_id: number | null;
  label: string;
  sku: string | null;
  quantity: number;
  cost_price: number | null;
  stock: number | null;
  current_cost: number | null;
}

export interface ReceiptBrief {
  id: number;
  status: DocumentStatus;
  supplier: string | null;
  number: string | null;
  total_quantity: number;
  total_cost: number;
  lines: number;
  created_at: string;
  posted_at: string | null;
}

export interface Receipt extends ReceiptBrief {
  note: string | null;
  created_by_email: string | null;
  posted_by_email: string | null;
  items: ReceiptLine[];
  touched_line_id: number | null;
}

export interface CountLine {
  id: number;
  variant_id: number | null;
  label: string;
  sku: string | null;
  counted: number;
  expected: number | null;
}

export interface CountBrief {
  id: number;
  status: DocumentStatus;
  note: string | null;
  lines: number;
  difference: number;
  created_at: string;
  posted_at: string | null;
}

export interface StockCount extends CountBrief {
  created_by_email: string | null;
  posted_by_email: string | null;
  items: CountLine[];
  touched_line_id: number | null;
}
