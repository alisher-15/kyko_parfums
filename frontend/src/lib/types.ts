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

export interface PromotionPublic {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  /** A finished banner with its own text: shown whole, without the site's text over it. */
  image_only: boolean;
  discount_percent: number | null;
  starts_on: string | null;
  ends_on: string | null;
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
  /** Admin only: type and gender of the catalog product (for the delivery note). */
  product_type?: string | null;
  gender?: Gender | null;
  returned_quantity: number;
  list_price: number;
  discount_percent: number;
  price_applied: number;
  price_tier: PriceTier;
  line_total: number;
  /** The promotion the price came from (discount_percent is its discount). */
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

// ---------- Admin ----------

export interface AdminVariant {
  id: number;
  product_id: number;
  volume_ml: number;
  is_tester: boolean;
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
  /** «Новинка»: shown in «Новые поступления» on the home page. */
  is_new: boolean;
  new_at: string | null;
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
  /** Current stock of the order's volumes; below zero = backordered units not here yet. */
  variant_stock: Record<number, number>;
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
  has_backorder: boolean;
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
  /** Rows read as testers: a "Тестер" column, or "tester" in the name, volume or type. */
  tester_rows: number;
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
  /** Volumes customers ordered beyond stock: to get from a supplier. */
  variants_backordered: number;
  units_backordered: number;
}

// ---------- Store sales (POS) ----------

export interface VariantSearchItem {
  variant_id: number;
  product_id: number;
  brand_name: string;
  product_name: string;
  volume_ml: number;
  is_tester: boolean;
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
  is_tester: boolean;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  stock: number;
  available: boolean;
  list_price: number;
  /** The cashier's discount as entered; unit_price may come from a promotion instead. */
  discount_percent: number;
  unit_price: number;
  line_total: number;
  /** A promotion gave a better price than the cashier's discount (they don't add up). */
  promotion_title: string | null;
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
  is_tester: boolean;
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
  /** Drafts: units in orders not shipped yet (part of `expected`, not for sale). */
  reserved: number | null;
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

// ---------- Promotions (admin) ----------

export type PromotionStatus = "running" | "scheduled" | "ended" | "off";

export interface PromotionBrief {
  id: number;
  title: string;
  image_url: string | null;
  image_only: boolean;
  discount_percent: number | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  all_products: boolean;
  brands_count: number;
  products_count: number;
  status: PromotionStatus;
}

export interface Promotion extends PromotionBrief {
  description: string | null;
  brands: BrandBrief[];
  products: { id: number; name: string; brand: BrandBrief }[];
  created_at: string;
  updated_at: string;
}

// ---------- Dollar rate (admin) ----------

export interface RateInfo {
  effective_rate: number | null;
  source_rate: number | null;
  source_updated_at: string | null;
  checked_at: string | null;
  /** Why the last read of mig.kz failed; null when it worked. */
  source_error: string | null;
  adjustment: number;
  manual_rate: number | null;
}

// ---------- Telegram notifications (admin) ----------

export interface TelegramRecipient {
  id: number;
  /** The chat's name when it was connected: a person or a group. */
  title: string;
  created_at: string;
}

export interface TelegramState {
  /** False until TELEGRAM_BOT_TOKEN is set on the server. */
  enabled: boolean;
  bot_username: string | null;
  /** Why Telegram couldn't be reached (wrong token, Telegram down). */
  error: string | null;
  recipients: TelegramRecipient[];
}

export interface TelegramLink {
  private_url: string;
  group_url: string;
  valid_hours: number;
}

export interface TelegramCheck {
  added: TelegramRecipient[];
  recipients: TelegramRecipient[];
}

export interface TelegramTest {
  sent: number;
  /** Names of the chats the message didn't reach. */
  failed: string[];
}
