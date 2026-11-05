export type EventKind = "paid" | "free";
export type EventStatus = "draft" | "published" | "closed";

export type EventRow = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  description: string;
  place_name: string;
  place_address: string;
  place_lat: number | null;
  place_lng: number | null;
  starts_at: string;
  ends_at: string | null;
  kind: EventKind;
  capacity: number;
  status: EventStatus;
  banner_path: string | null;
  age_ref_date: string | null;
};

export type Lot = { id: number; event_id: number; name: string; price_cents: number; quantity: number; starts_at: string | null; ends_at: string | null; position: number };
export type AgeBand = { id: number; event_id: number; min_age: number; max_age: number; discount_type: "percent" | "amount" | "free"; discount_value: number };
export type Combo = { id: number; event_id: number; name: string; ticket_count: number; price_cents: number; active: boolean };
export type QuestionType = "short_text" | "long_text" | "yes_no" | "single_choice" | "multi_choice" | "number" | "date";
export type Question = { id: number; event_id: number; label: string; type: QuestionType; required: boolean; options: string[]; position: number };
export type Coupon = { id: number; code: string; discount_type: "percent" | "amount"; discount_value: number; valid_until: string | null; max_uses: number | null; event_id: number | null; active: boolean };
export type Session = { id: number; event_id: number; name: string; starts_at: string };

export type OrderStatus = "pending" | "confirmed" | "waitlist" | "cancelled" | "expired";
export type Order = {
  id: number; code: string; event_id: number; session_id: number | null;
  buyer_name: string; buyer_email: string; buyer_phone: string; buyer_cpf: string;
  status: OrderStatus; ticket_count: number; requested_coupon: string | null;
  subtotal_cents: number; age_discount_cents: number; combo_discount_cents: number; coupon_discount_cents: number; total_cents: number;
  expires_at: string | null; offered_until: string | null; offer_notified_at: string | null; tickets_emailed_at: string | null;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
};
export type Ticket = {
  id: number; code: string; order_id: number; event_id: number; position: number; name: string; gender: "F" | "M"; birth_date: string;
  lot_id: number | null; combo_id: number | null; base_price_cents: number; age_discount_cents: number; price_cents: number;
};

export type Quote = {
  tickets: { position: number; lot_id: number | null; base: number; age: number; age_band_id: number | null; age_discount: number; price: number; combo_id: number | null }[];
  subtotal: number; age_discount: number; combo_discount: number; combo_total: number; coupon_id: number | null; coupon_discount: number; total: number;
};

export const ORDER_STATUS: Record<OrderStatus, string> = {
  confirmed: "Confirmada", pending: "Aguardando pagamento", waitlist: "Fila de espera", cancelled: "Cancelada", expired: "Expirada",
};
export const QUESTION_TYPES: Record<QuestionType, string> = {
  short_text: "Texto curto", long_text: "Texto longo", yes_no: "Sim ou não", single_choice: "Escolha única",
  multi_choice: "Múltipla escolha", number: "Número", date: "Data",
};
