export type UserRole = "retail" | "wholesale" | "bulk_wholesale" | "admin";
export type Gender = "female" | "male" | "unisex";
export type PriceTier = "retail" | "wholesale" | "bulk";
export type PricingMode = "order_total" | "item_quantity";
export type OrderStatus = "new" | "processing" | "shipped" | "delivered" | "cancelled";

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

export interface VariantPublic {
  id: number;
  volume_ml: number;
  sku: string | null;
  stock: number;
  photo_url: string | null;
  price: number;
  price_tier: PriceTier;
  retail_price: number;
  wholesale_price: number | null;
  bulk_price: number | null;
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
}

export interface QuoteLine {
  variant_id: number;
  product_id: number;
  product_name: string;
  brand_name: string;
  volume_ml: number;
  image_url: string | null;
  quantity: number;
  stock: number;
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
}

export interface OrderItem {
  id: number;
  variant_id: number | null;
  product_id: number | null;
  brand_name: string;
  product_name: string;
  volume_ml: number;
  quantity: number;
  price_applied: number;
  price_tier: PriceTier;
  line_total: number;
}

export interface Order {
  id: number;
  status: OrderStatus;
  total_amount: number;
  customer_role: UserRole;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  delivery_city: string;
  delivery_address: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface OrderBrief {
  id: number;
  status: OrderStatus;
  total_amount: number;
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
  user_id: number;
  user_email: string;
  admin_note: string | null;
}

export interface AdminOrderBrief {
  id: number;
  status: OrderStatus;
  total_amount: number;
  customer_role: UserRole;
  contact_name: string;
  contact_phone: string;
  user_email: string;
  items_count: number;
  created_at: string;
}

export interface PricingSettings {
  mode: PricingMode;
  wholesale_min_order_amount: number;
  bulk_min_order_amount: number;
  wholesale_min_item_qty: number;
  bulk_min_item_qty: number;
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
  products_total: number;
  products_without_variants: number;
  variants_low_stock: number;
  brands_total: number;
}
