// Admin API types, the same as frontend/src/lib/types.ts (the admin part). Keep them in step.
import type {
  BrandBrief,
  Category,
  Gender,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PriceTier,
  PricingMode,
  User,
  UserRole,
} from "./types";

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
  /** Markups on the cost remembered from the prices set by hand, percent. */
  retail_markup: number | null;
  wholesale_markup: number | null;
  bulk_markup: number | null;
  barcodes: string[];
  photo_url: string | null;
  is_active: boolean;
}

/** `image_url` here is only the picture set in the admin panel (null: a photo of its products). */
export interface AdminCategory extends Category {
  position: number;
  /** All products in this node and below it, hidden ones too. */
  product_count: number;
  /** Products placed right in this node. */
  own_product_count: number;
}

export interface AdminProduct {
  id: number;
  brand_id: number;
  brand: BrandBrief;
  /** The catalog section or group (`/admin/categories`). */
  category_id: number | null;
  name: string;
  type: string | null;
  /** The olfactory group («Цветочные»). */
  category: string | null;
  gender: Gender | null;
  longevity: string | null;
  top_notes: string | null;
  mid_notes: string | null;
  base_notes: string | null;
  description: string | null;
  /** Other names customers search by («соваж, баккара»). */
  search_names: string | null;
  image_url: string | null;
  is_active: boolean;
  /** «Выбор Kyko»: shown in its block on the home page. */
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

export type PriceFormat = "usd_1c" | "barcode_kzt";

export interface PriceListInfo {
  id: number;
  file_name: string;
  uploaded_at: string;
  user_email: string | null;
  lines: number;
  matched: number;
  unmatched: number;
}

export interface Supplier {
  id: number;
  name: string;
  is_main: boolean;
  price_format: PriceFormat;
  /** Volumes with a price from this supplier. */
  prices: number;
  /** Price list lines linked to a volume; lines marked «не наш товар». */
  links: number;
  ignored: number;
  last_list: PriceListInfo | null;
}

export interface UnmatchedLine {
  row: number;
  line: string;
  price: number;
  barcode: string | null;
}

export interface PriceChangeLine {
  variant_id: number;
  product_id: number;
  label: string;
  line: string;
  supplier_old: number | null;
  supplier_new: number;
  cost_old: number | null;
  cost_new: number | null;
  retail_old: number;
  retail_new: number;
  wholesale_old: number | null;
  wholesale_new: number | null;
  bulk_old: number | null;
  bulk_new: number | null;
}

export interface PriceListReport {
  dry_run: boolean;
  lines: number;
  matched: number;
  by_barcode: number;
  ignored: number;
  duplicates: number;
  unmatched: UnmatchedLine[];
  supplier_new: number;
  supplier_up: number;
  supplier_down: number;
  cost_up: number;
  cost_down: number;
  prices_raised: number;
  prices_kept: number;
  remembered: number;
  /** Another supplier's list before the main supplier's first one: costs stay as they are. */
  waiting_for_main: boolean;
  changes: PriceChangeLine[];
  // Older servers don't send the three below.
  /** Lines whose price cell has something that is not a price: left out. */
  unreadable?: { row: number; line: string; value: string }[];
  /** Lines whose cost looks wrong: the supplier's price is kept, cost and prices are not changed. */
  suspicious?: SuspiciousLine[];
  /** Volumes whose cost went up while their prices could not follow by the markups. */
  prices_not_raised?: number;
}

export interface SuspiciousLine {
  variant_id: number;
  product_id: number;
  label: string;
  line: string;
  cost_old: number | null;
  cost_new: number;
  reason: string;
}

export interface LinksReport {
  dry_run: boolean;
  rows: number;
  linked: number;
  ignored: number;
  problems: { row: number; line: string; error: string }[];
}

export interface VariantSupplierPrice {
  variant_id: number;
  supplier_id: number;
  supplier: string;
  is_main: boolean;
  price: number;
  price_usd: number | null;
  line: string;
  updated_at: string;
  /** From the supplier's latest price list. */
  latest: boolean;
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
  barcodes_added: number;
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
  /** Active volumes with 1–5 left, and with none (older servers don't send them). */
  variants_few?: number;
  variants_out?: number;
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
  /** The volume's cost, for «Показать себестоимость». */
  cost_price: number | null;
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

export type PriceField = "cost" | "retail" | "wholesale" | "bulk";

/** A change of a volume's cost or price: where it came from and who made it. */
export interface PriceChange {
  id: number;
  variant_id: number;
  volume_ml: number;
  is_tester: boolean;
  field: PriceField;
  old_value: number | null;
  new_value: number | null;
  /** «Админка», «Импорт Excel», «Прайс Канат», «Приёмка №12», … */
  source: string;
  user_email: string | null;
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
  /** Every supplier's price of the volume (drafts), the main supplier first; null: none. */
  supplier_prices: { supplier: string; price: number | null }[];
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
  /** type and image_url: two products of one name (EDP, Extrait) differ by them. */
  products: {
    id: number;
    name: string;
    type?: string | null;
    image_url?: string | null;
    brand: BrandBrief;
  }[];
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

// ---------- Banners and stories from templates ----------

export interface CreativeOut {
  width: number;
  height: number;
  /** save=false: the picture as a data URL, to look at or share. */
  preview: string | null;
  /** save=true: where it is kept. */
  url: string | null;
  /** Products whose photo couldn't be read: their place stays empty. */
  missing_photos: number[];
}
