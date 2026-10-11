-- 99 Shop retail ERP: complete database schema and starting data.
-- Apply to an empty PostgreSQL database with `npm run db:migrate`, then
-- `npm run db:seed`. Later changes go in new numbered files after this one.

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    subtype text,
    parent_id integer,
    is_active integer DEFAULT 1,
    is_system integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT accounts_type_check CHECK ((type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text])))
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    user_id integer NOT NULL,
    business_date text NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    note text,
    marked_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id integer NOT NULL,
    name text NOT NULL,
    account_number text,
    account_id integer,
    opening_balance numeric(14,2) DEFAULT 0,
    is_active integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_accounts_id_seq OWNED BY public.bank_accounts.id;


--
-- Name: bank_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_reconciliations (
    id integer NOT NULL,
    bank_account_id integer,
    statement_date date NOT NULL,
    statement_balance numeric(14,2) NOT NULL,
    book_balance numeric(14,2) NOT NULL,
    difference numeric(14,2) NOT NULL,
    note text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bank_reconciliations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_reconciliations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_reconciliations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_reconciliations_id_seq OWNED BY public.bank_reconciliations.id;


--
-- Name: business_day_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_day_audit (
    id integer NOT NULL,
    business_day_id integer NOT NULL,
    action text NOT NULL,
    actor_id integer,
    actor_name text,
    previous_value text,
    new_value text,
    reason text,
    detail text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL
);


--
-- Name: business_day_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_day_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_day_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_day_audit_id_seq OWNED BY public.business_day_audit.id;


--
-- Name: business_day_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_day_sessions (
    id integer NOT NULL,
    business_day_id integer NOT NULL,
    session_number integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    opened_by integer,
    opening_cash numeric(14,2) DEFAULT 0 NOT NULL,
    opening_note text,
    closed_at timestamp without time zone,
    closed_by integer,
    expected_cash numeric(14,2),
    counted_cash numeric(14,2),
    cash_difference numeric(14,2),
    closing_note text,
    force_closed integer DEFAULT 0 NOT NULL,
    force_close_reason text,
    closing_snapshot text,
    drawer_session_id integer,
    opening_journal_id integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    CONSTRAINT business_day_sessions_opening_cash_check CHECK ((opening_cash >= (0)::numeric)),
    CONSTRAINT business_day_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: business_day_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_day_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_day_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_day_sessions_id_seq OWNED BY public.business_day_sessions.id;


--
-- Name: business_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_days (
    id integer NOT NULL,
    business_date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    opened_by integer,
    opening_cash numeric(14,2) DEFAULT 0 NOT NULL,
    opening_note text,
    closed_at timestamp without time zone,
    closed_by integer,
    expected_cash numeric(14,2),
    counted_cash numeric(14,2),
    cash_difference numeric(14,2),
    closing_note text,
    force_closed integer DEFAULT 0 NOT NULL,
    force_close_reason text,
    approved_by integer,
    closing_snapshot text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    stale_ack_date date,
    CONSTRAINT business_days_opening_cash_check CHECK ((opening_cash >= (0)::numeric)),
    CONSTRAINT business_days_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: business_days_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_days_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_days_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_days_id_seq OWNED BY public.business_days.id;


--
-- Name: business_funding_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_funding_transactions (
    id integer NOT NULL,
    transaction_date date NOT NULL,
    transaction_type text NOT NULL,
    amount numeric(14,2) NOT NULL,
    note text,
    created_by integer,
    journal_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_funding_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT business_funding_transactions_transaction_type_check CHECK ((transaction_type = 'investment'::text))
);


--
-- Name: business_funding_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_funding_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_funding_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_funding_transactions_id_seq OWNED BY public.business_funding_transactions.id;


--
-- Name: cash_drawers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_drawers (
    id integer NOT NULL,
    name text NOT NULL,
    is_active integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cash_drawers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cash_drawers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cash_drawers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cash_drawers_id_seq OWNED BY public.cash_drawers.id;


--
-- Name: cash_variance_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_variance_reviews (
    id integer NOT NULL,
    store_session_id integer NOT NULL,
    status text NOT NULL,
    resolution_note text NOT NULL,
    reviewed_by integer NOT NULL,
    reviewed_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    CONSTRAINT cash_variance_reviews_status_check CHECK ((status = ANY (ARRAY['ACCEPTED'::text, 'ESCALATED'::text])))
);


--
-- Name: cash_variance_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cash_variance_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cash_variance_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cash_variance_reviews_id_seq OWNED BY public.cash_variance_reviews.id;


--
-- Name: customer_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_ledger (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    payment_id integer,
    entry_type text NOT NULL,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    due_date date,
    note text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    idempotency_key text NOT NULL,
    business_day_id integer,
    CONSTRAINT customer_ledger_check CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))),
    CONSTRAINT customer_ledger_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT customer_ledger_debit_check CHECK ((debit >= (0)::numeric)),
    CONSTRAINT customer_ledger_entry_type_check CHECK ((entry_type = ANY (ARRAY['credit_sale'::text, 'credit_payment'::text, 'refund'::text, 'adjustment'::text])))
);


--
-- Name: customer_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_ledger_id_seq OWNED BY public.customer_ledger.id;


--
-- Name: customer_master_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_master_audit (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    action text NOT NULL,
    actor_id integer,
    before_json text,
    after_json text,
    reason text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    CONSTRAINT customer_master_audit_action_check CHECK ((action = ANY (ARRAY['CREATED'::text, 'UPDATED'::text, 'DELETED'::text])))
);


--
-- Name: customer_master_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_master_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_master_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_master_audit_id_seq OWNED BY public.customer_master_audit.id;


--
-- Name: customer_payment_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_payment_reminders (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    channel text NOT NULL,
    amount_due numeric(14,2) NOT NULL,
    message text NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT customer_payment_reminders_channel_check CHECK ((channel = 'whatsapp'::text))
);


--
-- Name: customer_payment_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_payment_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_payment_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_payment_reminders_id_seq OWNED BY public.customer_payment_reminders.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    total_visits integer DEFAULT 0,
    total_spent double precision DEFAULT 0,
    credit_limit double precision DEFAULT 0,
    current_credit double precision DEFAULT 0,
    is_vip integer DEFAULT 0,
    is_blacklisted integer DEFAULT 0,
    notes text,
    phone_digits text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    store_credit_balance numeric(14,2) DEFAULT 0 NOT NULL,
    commercial_group_id integer,
    loyalty_points_balance numeric(14,2) DEFAULT 0 NOT NULL
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_active integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designations (
    id integer NOT NULL,
    name text NOT NULL,
    department_id integer,
    description text,
    is_active integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: designations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.designations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: designations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.designations_id_seq OWNED BY public.designations.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id integer NOT NULL,
    device_id text NOT NULL,
    device_name text,
    device_type text,
    ip_address text,
    last_seen timestamp without time zone,
    user_id integer,
    is_active integer DEFAULT 1
);


--
-- Name: devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.devices_id_seq OWNED BY public.devices.id;


--
-- Name: document_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_counters (
    id integer NOT NULL,
    document_type text NOT NULL,
    last_value integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_counters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_counters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_counters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_counters_id_seq OWNED BY public.document_counters.id;


--
-- Name: drawer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drawer_sessions (
    id integer NOT NULL,
    drawer_id integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opening_amount numeric(14,2) DEFAULT 0 NOT NULL,
    opened_by integer,
    opened_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    expected_amount numeric(14,2),
    counted_amount numeric(14,2),
    difference numeric(14,2),
    note text,
    closed_by integer,
    closed_at timestamp without time zone,
    business_day_id integer,
    CONSTRAINT drawer_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: drawer_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drawer_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drawer_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drawer_sessions_id_seq OWNED BY public.drawer_sessions.id;


--
-- Name: expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_categories (
    id integer NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: expense_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expense_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expense_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expense_categories_id_seq OWNED BY public.expense_categories.id;


--
-- Name: expense_change_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_change_audit (
    id integer NOT NULL,
    expense_id integer NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    before_json text,
    after_json text,
    request_key text,
    performed_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL
);


--
-- Name: expense_change_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expense_change_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expense_change_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expense_change_audit_id_seq OWNED BY public.expense_change_audit.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id integer NOT NULL,
    description text,
    category text,
    amount double precision NOT NULL,
    expense_date date,
    purchase_date text,
    supplier text,
    notes text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    payment_method text DEFAULT 'cash'::text,
    logged_by integer,
    receipt_url text,
    source_type text,
    source_id integer,
    business_day_id integer,
    status text DEFAULT 'active'::text,
    void_reason text,
    voided_at timestamp without time zone,
    voided_by integer
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: goods_receipt_line_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_line_batches (
    id integer NOT NULL,
    goods_receipt_line_id integer NOT NULL,
    batch_number text NOT NULL,
    manufactured_date date,
    expiry_date date,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT goods_receipt_line_batches_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: goods_receipt_line_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipt_line_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipt_line_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipt_line_batches_id_seq OWNED BY public.goods_receipt_line_batches.id;


--
-- Name: goods_receipt_line_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_line_serials (
    id integer NOT NULL,
    goods_receipt_line_id integer NOT NULL,
    serial_number text NOT NULL
);


--
-- Name: goods_receipt_line_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipt_line_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipt_line_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipt_line_serials_id_seq OWNED BY public.goods_receipt_line_serials.id;


--
-- Name: goods_receipt_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_lines (
    id integer NOT NULL,
    goods_receipt_id integer NOT NULL,
    purchase_order_line_id integer,
    variant_id integer NOT NULL,
    quantity_received numeric(14,3) NOT NULL,
    purchase_unit text DEFAULT 'unit'::text NOT NULL,
    conversion_factor numeric(14,4) DEFAULT 1 NOT NULL,
    stock_quantity numeric(14,3) NOT NULL,
    unit_cost numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    CONSTRAINT goods_receipt_lines_conversion_factor_check CHECK ((conversion_factor > (0)::numeric)),
    CONSTRAINT goods_receipt_lines_quantity_received_check CHECK ((quantity_received > (0)::numeric)),
    CONSTRAINT goods_receipt_lines_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: goods_receipt_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipt_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipt_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipt_lines_id_seq OWNED BY public.goods_receipt_lines.id;


--
-- Name: goods_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipts (
    id integer NOT NULL,
    grn_number text NOT NULL,
    supplier_id integer NOT NULL,
    purchase_order_id integer,
    location_id integer NOT NULL,
    receipt_date date DEFAULT CURRENT_DATE NOT NULL,
    received_by integer,
    invoice_number text,
    invoice_date date,
    payment_method text DEFAULT 'credit'::text NOT NULL,
    notes text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    posted_at timestamp without time zone,
    voided_at timestamp without time zone,
    void_reason text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT goods_receipts_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'VOIDED'::text])))
);


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipts_id_seq OWNED BY public.goods_receipts.id;


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    id integer NOT NULL,
    holiday_date text NOT NULL,
    name text NOT NULL,
    note text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: holidays_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.holidays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: holidays_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.holidays_id_seq OWNED BY public.holidays.id;


--
-- Name: inventory_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_balances (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    location_id integer NOT NULL,
    batch_id integer,
    quantity_on_hand numeric(14,3) DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text)
);


--
-- Name: inventory_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_costs (
    variant_id integer NOT NULL,
    average_cost numeric(14,4) DEFAULT 0 NOT NULL,
    quantity_on_hand numeric(14,3) DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    carrying_value numeric(14,2) DEFAULT 0 NOT NULL,
    baseline_value numeric(14,2) DEFAULT 0 NOT NULL,
    baseline_movement_id integer DEFAULT 0 NOT NULL
);


--
-- Name: inventory_balance_valuation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.inventory_balance_valuation AS
 SELECT b.id,
    b.variant_id,
    b.location_id,
    b.batch_id,
    b.quantity_on_hand,
    b.updated_at,
    b.pool_quantity,
    b.cumulative_quantity,
        CASE
            WHEN (b.pool_quantity > (0)::numeric) THEN ((floor(((round((COALESCE(c.carrying_value, (0)::numeric) * (100)::numeric), 0) * round((b.cumulative_quantity * (1000)::numeric), 0)) / round((b.pool_quantity * (1000)::numeric), 0))) - floor(((round((COALESCE(c.carrying_value, (0)::numeric) * (100)::numeric), 0) * round(((b.cumulative_quantity - b.quantity_on_hand) * (1000)::numeric), 0)) / round((b.pool_quantity * (1000)::numeric), 0)))) / 100.0)
            ELSE (0)::numeric
        END AS allocated_value
   FROM (( SELECT ib.id,
            ib.variant_id,
            ib.location_id,
            ib.batch_id,
            ib.quantity_on_hand,
            ib.updated_at,
            sum(ib.quantity_on_hand) OVER (PARTITION BY ib.variant_id) AS pool_quantity,
            sum(ib.quantity_on_hand) OVER (PARTITION BY ib.variant_id ORDER BY ib.location_id, ib.id ROWS UNBOUNDED PRECEDING) AS cumulative_quantity
           FROM public.inventory_balances ib) b
     LEFT JOIN public.inventory_costs c ON ((c.variant_id = b.variant_id)));


--
-- Name: inventory_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_balances_id_seq OWNED BY public.inventory_balances.id;


--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    batch_number text NOT NULL,
    manufactured_date date,
    expiry_date date,
    supplier_id integer,
    unit_cost numeric(14,2),
    status text DEFAULT 'active'::text NOT NULL,
    received_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT inventory_batches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'written_off'::text, 'depleted'::text])))
);


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_batches_id_seq OWNED BY public.inventory_batches.id;


--
-- Name: inventory_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_locations (
    id integer NOT NULL,
    branch_id integer,
    name text NOT NULL,
    code text,
    location_type text DEFAULT 'shop'::text NOT NULL,
    is_default integer DEFAULT 0,
    is_active integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    is_sellable integer DEFAULT 1 NOT NULL,
    CONSTRAINT inventory_locations_location_type_check CHECK ((location_type = ANY (ARRAY['shop'::text, 'warehouse'::text, 'display'::text, 'damaged'::text, 'returns'::text, 'other'::text, 'in_transit'::text])))
);


--
-- Name: inventory_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_locations_id_seq OWNED BY public.inventory_locations.id;


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    location_id integer NOT NULL,
    batch_id integer,
    movement_type text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    balance_after numeric(14,3),
    unit_cost numeric(14,2),
    total_cost numeric(14,2),
    reference_type text,
    reference_id integer,
    reason text,
    business_day_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    carrying_value_delta numeric(14,2),
    CONSTRAINT inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['OPENING_STOCK'::text, 'PURCHASE_RECEIPT'::text, 'SALE'::text, 'CUSTOMER_RETURN'::text, 'PURCHASE_RETURN'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'STOCK_ADJUSTMENT_IN'::text, 'STOCK_ADJUSTMENT_OUT'::text, 'DAMAGE'::text, 'EXPIRY'::text, 'LOSS'::text, 'SHRINKAGE'::text, 'TESTER'::text, 'SAMPLE'::text, 'INTERNAL_USE'::text])))
);


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_movements_id_seq OWNED BY public.inventory_movements.id;


--
-- Name: inventory_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_reservations (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    location_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    source_type text NOT NULL,
    source_id integer NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    expires_at timestamp with time zone,
    CONSTRAINT inventory_reservations_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_reservations_id_seq OWNED BY public.inventory_reservations.id;


--
-- Name: inventory_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_serials (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    serial_number text NOT NULL,
    location_id integer,
    status text DEFAULT 'IN_STOCK'::text NOT NULL,
    supplier_id integer,
    reference_type text,
    reference_id integer,
    unit_cost numeric(14,4),
    received_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    sold_at timestamp without time zone,
    sale_line_id integer,
    returned_at timestamp without time zone,
    warranty_months integer,
    warranty_end_date date,
    warranty_notes text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text)
);


--
-- Name: inventory_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_serials_id_seq OWNED BY public.inventory_serials.id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id integer NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    memo text,
    source_type text,
    source_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    external_ref text,
    business_day_id integer
);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id integer NOT NULL,
    journal_id integer NOT NULL,
    account_id integer NOT NULL,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    memo text,
    drawer_id integer,
    bank_account_id integer,
    supplier_id integer,
    reconciled integer DEFAULT 0,
    reconciled_at timestamp without time zone,
    customer_id integer,
    reconciliation_id integer,
    CONSTRAINT chk_line_one_side CHECK ((NOT (((debit)::double precision > (0)::double precision) AND ((credit)::double precision > (0)::double precision)))),
    CONSTRAINT journal_lines_credit_check CHECK (((credit)::double precision >= (0)::double precision)),
    CONSTRAINT journal_lines_debit_check CHECK (((debit)::double precision >= (0)::double precision))
);


--
-- Name: journal_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_lines_id_seq OWNED BY public.journal_lines.id;


--
-- Name: loyalty_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_transactions (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    type text NOT NULL,
    points numeric(14,2) NOT NULL,
    balance_after numeric(14,2) NOT NULL,
    source_type text,
    source_id integer,
    reason text,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text)
);


--
-- Name: loyalty_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loyalty_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loyalty_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loyalty_transactions_id_seq OWNED BY public.loyalty_transactions.id;


--
-- Name: operations_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_decisions (
    id integer NOT NULL,
    snapshot_id integer NOT NULL,
    action text NOT NULL,
    suggested_quantity numeric(14,3) NOT NULL,
    final_quantity numeric(14,3),
    supplier_id integer,
    reason text NOT NULL,
    actor_id integer,
    po_id integer,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: operations_decisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.operations_decisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operations_decisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.operations_decisions_id_seq OWNED BY public.operations_decisions.id;


--
-- Name: operations_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_policies (
    variant_id integer NOT NULL,
    config text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: operations_policy_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_policy_audit (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    before_config text,
    after_config text NOT NULL,
    actor_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: operations_policy_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.operations_policy_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operations_policy_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.operations_policy_audit_id_seq OWNED BY public.operations_policy_audit.id;


--
-- Name: operations_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_snapshots (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    horizon integer NOT NULL,
    fingerprint text NOT NULL,
    evidence text NOT NULL,
    generated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: operations_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.operations_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operations_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.operations_snapshots_id_seq OWNED BY public.operations_snapshots.id;


--
-- Name: payment_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_settlements (
    id integer NOT NULL,
    method text NOT NULL,
    gross_amount numeric(14,2) NOT NULL,
    fee_amount numeric(14,2) DEFAULT 0,
    net_amount numeric(14,2) NOT NULL,
    bank_account_id integer,
    reference text,
    note text,
    settled_by integer,
    settled_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    journal_id integer,
    business_day_id integer
);


--
-- Name: payment_settlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_settlements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_settlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_settlements_id_seq OWNED BY public.payment_settlements.id;


--
-- Name: permission_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_audit (
    id integer NOT NULL,
    role text NOT NULL,
    permission_key text NOT NULL,
    previous_value integer,
    new_value integer NOT NULL,
    actor_id integer,
    actor_name text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: permission_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permission_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permission_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permission_audit_id_seq OWNED BY public.permission_audit.id;


--
-- Name: product_attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_attribute_values (
    id integer NOT NULL,
    attribute_id integer NOT NULL,
    value text NOT NULL,
    display_order integer DEFAULT 0,
    short_code text,
    swatch text
);


--
-- Name: product_attribute_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_attribute_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_attribute_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_attribute_values_id_seq OWNED BY public.product_attribute_values.id;


--
-- Name: product_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_attributes (
    id integer NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    online_filter integer DEFAULT 0 NOT NULL,
    CONSTRAINT product_attributes_online_filter_check CHECK ((online_filter = ANY (ARRAY[0, 1])))
);


--
-- Name: product_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_attributes_id_seq OWNED BY public.product_attributes.id;


--
-- Name: product_barcodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_barcodes (
    id integer NOT NULL,
    product_id integer,
    variant_id integer,
    barcode text NOT NULL,
    barcode_type text DEFAULT 'primary'::text NOT NULL,
    is_primary integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT product_barcodes_barcode_type_check CHECK ((barcode_type = ANY (ARRAY['primary'::text, 'manufacturer'::text, 'internal'::text, 'supplier'::text, 'other'::text]))),
    CONSTRAINT product_barcodes_check CHECK ((((product_id IS NOT NULL) AND (variant_id IS NULL)) OR ((product_id IS NULL) AND (variant_id IS NOT NULL))))
);


--
-- Name: product_barcodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_barcodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_barcodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_barcodes_id_seq OWNED BY public.product_barcodes.id;


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id integer CONSTRAINT product_categories_id_not_null NOT NULL,
    name text CONSTRAINT product_categories_name_not_null NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    icon text,
    is_active integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    merchandising_active integer DEFAULT 1 CONSTRAINT product_categories_merchandising_active_not_null NOT NULL,
    online_enabled integer DEFAULT 1 CONSTRAINT product_categories_online_enabled_not_null NOT NULL,
    image_url text
);


--
-- Name: product_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_categories_id_seq OWNED BY public.product_categories.id;


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id integer CONSTRAINT product_variants_id_not_null NOT NULL,
    product_id integer CONSTRAINT product_variants_product_id_not_null NOT NULL,
    variant_name text CONSTRAINT product_variants_variant_name_not_null NOT NULL,
    price_modifier double precision DEFAULT 0,
    is_default integer DEFAULT 0,
    barcode text,
    sku text,
    mrp numeric(14,2),
    wholesale_price numeric(14,2),
    tax_category text,
    tracking_mode text DEFAULT 'none'::text CONSTRAINT product_variants_tracking_mode_not_null NOT NULL,
    reorder_point numeric(14,2),
    reorder_quantity numeric(14,2),
    price double precision,
    stock_unit text,
    merchandising_signature text,
    purchase_cost numeric(14,2),
    wholesale_min_quantity numeric(14,3) DEFAULT 1 CONSTRAINT product_variants_wholesale_min_quantity_not_null NOT NULL,
    merchandising_active integer DEFAULT 1 CONSTRAINT product_variants_merchandising_active_not_null NOT NULL,
    weight numeric(14,3),
    CONSTRAINT product_variants_tracking_mode_check CHECK ((tracking_mode = ANY (ARRAY['none'::text, 'batch'::text, 'serial'::text])))
);


--
-- Name: product_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_variants_id_seq OWNED BY public.product_variants.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer CONSTRAINT products_id_not_null NOT NULL,
    name text CONSTRAINT products_name_not_null NOT NULL,
    description text,
    category_id integer CONSTRAINT products_category_id_not_null NOT NULL,
    base_price double precision CONSTRAINT products_base_price_not_null NOT NULL,
    image_url text,
    is_available integer DEFAULT 1,
    tags text,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cost_price numeric(14,2) DEFAULT 0,
    unit text,
    cost numeric(14,2),
    barcode text,
    sku text,
    brand text,
    merchandising_type text DEFAULT 'simple'::text CONSTRAINT products_merchandising_type_not_null NOT NULL,
    online_title text,
    online_description text,
    online_summary text,
    online_slug text,
    seo_title text,
    seo_description text,
    online_enabled integer DEFAULT 1 CONSTRAINT products_online_enabled_not_null NOT NULL,
    featured integer DEFAULT 0 CONSTRAINT products_featured_not_null NOT NULL,
    online_sort integer DEFAULT 0 CONSTRAINT products_online_sort_not_null NOT NULL,
    online_category_id integer,
    CONSTRAINT products_base_price_check CHECK ((base_price >= (0)::double precision)),
    CONSTRAINT products_cost_price_check CHECK ((cost_price >= (0)::numeric))
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: promotion_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_redemptions (
    id integer NOT NULL,
    promotion_id integer NOT NULL,
    promotion_name text NOT NULL,
    promotion_code text,
    channel text NOT NULL,
    discount_amount double precision NOT NULL,
    customer_phone text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: promotion_redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotion_redemptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotion_redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotion_redemptions_id_seq OWNED BY public.promotion_redemptions.id;


--
-- Name: promotion_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_targets (
    id integer NOT NULL,
    promotion_id integer NOT NULL,
    target_type text NOT NULL,
    target_id integer NOT NULL,
    target_value text,
    CONSTRAINT promotion_targets_target_type_check CHECK ((target_type = ANY (ARRAY['category'::text, 'item'::text, 'brand'::text, 'variant'::text, 'bundle_component'::text])))
);


--
-- Name: promotion_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotion_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotion_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotion_targets_id_seq OWNED BY public.promotion_targets.id;


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id integer NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    discount_type text NOT NULL,
    discount_value double precision NOT NULL,
    scope text NOT NULL,
    minimum_order_amount double precision DEFAULT 0,
    maximum_discount_amount double precision,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    days_of_week text DEFAULT '[]'::text,
    channels text DEFAULT '["pos","website","qr"]'::text,
    auto_apply integer DEFAULT 0,
    is_active integer DEFAULT 1,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    offer_type text DEFAULT 'discount'::text,
    buy_quantity integer DEFAULT 1,
    reward_quantity integer DEFAULT 1,
    reward_discount_percent double precision DEFAULT 100,
    daily_start_time text,
    daily_end_time text,
    usage_limit integer,
    per_customer_limit integer,
    stackable integer DEFAULT 0,
    image_url text,
    website_featured integer DEFAULT 0,
    priority integer DEFAULT 0 NOT NULL,
    quantity_price_amount double precision,
    CONSTRAINT promotions_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT promotions_discount_value_check CHECK (
CASE
    WHEN (COALESCE(offer_type, 'discount'::text) = ANY (ARRAY['bundle'::text, 'quantity_price'::text, 'buy_x_get_y'::text])) THEN (discount_value >= (0)::double precision)
    ELSE (discount_value > (0)::double precision)
END),
    CONSTRAINT promotions_scope_check CHECK ((scope = ANY (ARRAY['order'::text, 'category'::text, 'item'::text, 'brand'::text, 'variant'::text])))
);


--
-- Name: promotions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotions_id_seq OWNED BY public.promotions.id;


--
-- Name: purchase_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_lines (
    id integer NOT NULL,
    purchase_order_id integer NOT NULL,
    variant_id integer NOT NULL,
    supplier_product_code text,
    ordered_quantity numeric(14,3) NOT NULL,
    purchase_unit text DEFAULT 'unit'::text NOT NULL,
    conversion_factor numeric(14,4) DEFAULT 1 NOT NULL,
    unit_cost numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    quantity_received numeric(14,3) DEFAULT 0 NOT NULL,
    notes text,
    CONSTRAINT purchase_order_lines_conversion_factor_check CHECK ((conversion_factor > (0)::numeric)),
    CONSTRAINT purchase_order_lines_ordered_quantity_check CHECK ((ordered_quantity > (0)::numeric)),
    CONSTRAINT purchase_order_lines_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_order_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_lines_id_seq OWNED BY public.purchase_order_lines.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    po_number text NOT NULL,
    supplier_id integer NOT NULL,
    location_id integer,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_date date,
    currency text DEFAULT 'NPR'::text NOT NULL,
    notes text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by integer,
    approved_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    submitted_by integer,
    submitted_at timestamp without time zone,
    approved_at timestamp without time zone,
    rejected_by integer,
    rejected_at timestamp without time zone,
    rejection_reason text,
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'PARTIALLY_RECEIVED'::text, 'RECEIVED'::text, 'CANCELLED'::text, 'CLOSED'::text])))
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: purchase_return_line_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_line_serials (
    id integer NOT NULL,
    purchase_return_line_id integer NOT NULL,
    serial_number text NOT NULL
);


--
-- Name: purchase_return_line_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_return_line_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_return_line_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_return_line_serials_id_seq OWNED BY public.purchase_return_line_serials.id;


--
-- Name: purchase_return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_lines (
    id integer NOT NULL,
    purchase_return_id integer NOT NULL,
    goods_receipt_line_id integer,
    variant_id integer NOT NULL,
    batch_id integer,
    quantity numeric(14,3) NOT NULL,
    unit_cost numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    reason text,
    inventory_unit_cost numeric(14,4),
    inventory_value numeric(14,2),
    variance_amount numeric(14,2),
    CONSTRAINT purchase_return_lines_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: purchase_return_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_return_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_return_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_return_lines_id_seq OWNED BY public.purchase_return_lines.id;


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id integer NOT NULL,
    return_number text NOT NULL,
    supplier_id integer NOT NULL,
    goods_receipt_id integer,
    location_id integer NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text,
    refund_method text DEFAULT 'credit_note'::text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by integer,
    posted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT purchase_returns_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'VOIDED'::text])))
);


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_returns_id_seq OWNED BY public.purchase_returns.id;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id integer NOT NULL,
    rate_key text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limits_id_seq OWNED BY public.rate_limits.id;


--
-- Name: retail_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_brands (
    id integer NOT NULL,
    name text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    description text,
    logo_url text
);


--
-- Name: retail_brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_brands_id_seq OWNED BY public.retail_brands.id;


--
-- Name: retail_catalog_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_catalog_jobs (
    id integer NOT NULL,
    kind text NOT NULL,
    created_by integer NOT NULL,
    payload_json text NOT NULL,
    status text DEFAULT 'PREVIEW'::text NOT NULL,
    result_json text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    applied_at timestamp with time zone
);


--
-- Name: retail_catalog_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_catalog_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_catalog_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_catalog_jobs_id_seq OWNED BY public.retail_catalog_jobs.id;


--
-- Name: retail_credit_collection_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_credit_collection_allocations (
    id integer NOT NULL,
    collection_id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    amount numeric(14,2) NOT NULL,
    CONSTRAINT retail_credit_collection_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: retail_credit_collection_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_credit_collection_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_credit_collection_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_credit_collection_allocations_id_seq OWNED BY public.retail_credit_collection_allocations.id;


--
-- Name: retail_credit_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_credit_collections (
    id integer NOT NULL,
    collection_number text NOT NULL,
    customer_id integer NOT NULL,
    amount numeric(14,2) NOT NULL,
    method text NOT NULL,
    bank_account_id integer,
    payment_reference text,
    external_ref text NOT NULL,
    journal_id integer,
    business_day_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_credit_collections_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: retail_credit_collections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_credit_collections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_credit_collections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_credit_collections_id_seq OWNED BY public.retail_credit_collections.id;


--
-- Name: retail_credit_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_credit_overrides (
    id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    customer_id integer NOT NULL,
    credit_amount numeric(14,2) NOT NULL,
    exposure_before numeric(14,2) NOT NULL,
    credit_limit numeric(14,2) NOT NULL,
    reason text NOT NULL,
    approved_by integer NOT NULL,
    approved_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_credit_overrides_credit_amount_check CHECK ((credit_amount > (0)::numeric))
);


--
-- Name: retail_credit_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_credit_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_credit_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_credit_overrides_id_seq OWNED BY public.retail_credit_overrides.id;


--
-- Name: retail_credit_writeoffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_credit_writeoffs (
    id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    customer_id integer NOT NULL,
    amount numeric(14,2) NOT NULL,
    reason text NOT NULL,
    external_ref text NOT NULL,
    journal_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_credit_writeoffs_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: retail_credit_writeoffs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_credit_writeoffs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_credit_writeoffs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_credit_writeoffs_id_seq OWNED BY public.retail_credit_writeoffs.id;


--
-- Name: retail_customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_customer_accounts (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: retail_customer_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_customer_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_customer_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_customer_accounts_id_seq OWNED BY public.retail_customer_accounts.id;


--
-- Name: retail_customer_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_customer_groups (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    pricing_mode text DEFAULT 'retail'::text NOT NULL,
    active integer DEFAULT 1 NOT NULL
);


--
-- Name: retail_customer_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_customer_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_customer_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_customer_groups_id_seq OWNED BY public.retail_customer_groups.id;


--
-- Name: retail_customer_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_customer_invites (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_by integer NOT NULL
);


--
-- Name: retail_customer_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_customer_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_customer_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_customer_invites_id_seq OWNED BY public.retail_customer_invites.id;


--
-- Name: retail_customer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_customer_sessions (
    token_hash text NOT NULL,
    account_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: retail_exchanges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_exchanges (
    id integer NOT NULL,
    exchange_number text,
    return_id integer NOT NULL,
    new_sale_id integer NOT NULL,
    difference_amount numeric(14,2) DEFAULT 0 NOT NULL,
    settlement_method text,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text)
);


--
-- Name: retail_exchanges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_exchanges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_exchanges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_exchanges_id_seq OWNED BY public.retail_exchanges.id;


--
-- Name: retail_inventory_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_inventory_adjustments (
    id integer NOT NULL,
    adjustment_number text,
    type text NOT NULL,
    variant_id integer NOT NULL,
    location_id integer,
    destination_location_id integer,
    batch_id integer,
    quantity numeric(14,3) NOT NULL,
    unit_cost numeric(14,4),
    total_value numeric(14,2),
    reason text,
    notes text,
    idempotency_key text,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_inventory_adjustments_type_check CHECK ((type = ANY (ARRAY['DAMAGE'::text, 'EXPIRY'::text, 'TESTER'::text, 'SAMPLE'::text, 'INTERNAL_USE'::text, 'SHRINKAGE'::text, 'MANUAL_POSITIVE'::text, 'MANUAL_NEGATIVE'::text, 'QUARANTINE_MOVE'::text, 'QUARANTINE_RELEASE'::text])))
);


--
-- Name: retail_inventory_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_inventory_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_inventory_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_inventory_adjustments_id_seq OWNED BY public.retail_inventory_adjustments.id;


--
-- Name: retail_loyalty_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_loyalty_settings_audit (
    id integer NOT NULL,
    old_value text NOT NULL,
    new_value text NOT NULL,
    actor_id integer,
    changed_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text)
);


--
-- Name: retail_loyalty_settings_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_loyalty_settings_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_loyalty_settings_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_loyalty_settings_audit_id_seq OWNED BY public.retail_loyalty_settings_audit.id;


--
-- Name: retail_margin_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_margin_policy (
    id integer NOT NULL,
    mode text DEFAULT 'off'::text NOT NULL,
    minimum_percent numeric(6,2) DEFAULT 0 NOT NULL,
    CONSTRAINT retail_margin_policy_id_check CHECK ((id = 1)),
    CONSTRAINT retail_margin_policy_minimum_percent_check CHECK (((minimum_percent >= (0)::numeric) AND (minimum_percent <= (100)::numeric))),
    CONSTRAINT retail_margin_policy_mode_check CHECK ((mode = ANY (ARRAY['off'::text, 'warn'::text, 'manager'::text])))
);


--
-- Name: retail_online_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_online_events (
    id integer NOT NULL,
    order_id integer NOT NULL,
    event text NOT NULL,
    actor_id integer,
    detail text,
    notification_status text DEFAULT 'NO_PROVIDER'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: retail_online_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_online_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_online_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_online_events_id_seq OWNED BY public.retail_online_events.id;


--
-- Name: retail_online_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_online_order_lines (
    id integer NOT NULL,
    retail_online_order_id integer NOT NULL,
    variant_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    product_name_snapshot text,
    variant_name_snapshot text,
    CONSTRAINT retail_online_order_lines_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: retail_online_order_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_online_order_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_online_order_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_online_order_lines_id_seq OWNED BY public.retail_online_order_lines.id;


--
-- Name: retail_online_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_online_orders (
    id integer NOT NULL,
    order_number text,
    source text DEFAULT 'MANUAL_ONLINE'::text NOT NULL,
    customer_id integer,
    customer_name text,
    customer_phone text,
    customer_email text,
    fulfillment_type text DEFAULT 'PICKUP'::text NOT NULL,
    shipping_address text,
    delivery_phone text,
    delivery_notes text,
    delivery_charge numeric(14,2) DEFAULT 0 NOT NULL,
    location_id integer,
    status text DEFAULT 'PENDING'::text NOT NULL,
    payment_status text DEFAULT 'UNPAID'::text NOT NULL,
    payment_method text,
    payment_reference text,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    retail_sale_id integer,
    idempotency_key text,
    cancel_reason text,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    confirmed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    fulfilled_at timestamp without time zone,
    owner_hash text,
    request_hash text,
    quote_json text,
    coupon_code text,
    reservation_expires_at timestamp with time zone
);


--
-- Name: retail_online_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_online_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_online_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_online_orders_id_seq OWNED BY public.retail_online_orders.id;


--
-- Name: retail_online_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_online_settings (
    id integer NOT NULL,
    enabled integer DEFAULT 0 NOT NULL,
    store_name text DEFAULT '99 Shop by Shahana'::text NOT NULL,
    pickup_instructions text DEFAULT 'Collect from our store after your order is ready.'::text NOT NULL,
    delivery_enabled integer DEFAULT 0 NOT NULL,
    delivery_fee numeric(14,2) DEFAULT 0 NOT NULL,
    free_delivery_threshold numeric(14,2),
    reservation_minutes integer DEFAULT 120 NOT NULL,
    payment_instructions text DEFAULT ''::text NOT NULL,
    manual_payment_enabled integer DEFAULT 0 NOT NULL,
    return_policy text DEFAULT 'Contact the store with your order number for a return or exchange.'::text NOT NULL,
    brand_color text DEFAULT '#20372e'::text NOT NULL,
    logo_url text,
    contact_text text DEFAULT ''::text NOT NULL,
    hero_text text DEFAULT 'Thoughtfully selected essentials. A little discovery in every visit.'::text NOT NULL,
    guest_enabled integer DEFAULT 1 NOT NULL,
    CONSTRAINT retail_online_settings_id_check CHECK ((id = 1))
);


--
-- Name: retail_price_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_price_audit (
    id integer NOT NULL,
    action text NOT NULL,
    actor_id integer,
    source_id integer,
    before_json text,
    after_json text,
    reason text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: retail_price_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_price_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_price_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_price_audit_id_seq OWNED BY public.retail_price_audit.id;


--
-- Name: retail_price_list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_price_list_items (
    id integer NOT NULL,
    price_list_id integer NOT NULL,
    product_id integer,
    variant_id integer,
    min_quantity numeric(14,3) DEFAULT 1 NOT NULL,
    fixed_price numeric(14,2),
    adjustment_percent numeric(10,4),
    CONSTRAINT retail_price_list_items_check CHECK (((product_id IS NULL) <> (variant_id IS NULL))),
    CONSTRAINT retail_price_list_items_check1 CHECK (((fixed_price IS NULL) <> (adjustment_percent IS NULL))),
    CONSTRAINT retail_price_list_items_fixed_price_check CHECK (((fixed_price IS NULL) OR (fixed_price >= (0)::numeric))),
    CONSTRAINT retail_price_list_items_min_quantity_check CHECK ((min_quantity > (0)::numeric))
);


--
-- Name: retail_price_list_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_price_list_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_price_list_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_price_list_items_id_seq OWNED BY public.retail_price_list_items.id;


--
-- Name: retail_price_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_price_lists (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    channel text,
    customer_group_id integer,
    priority integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT retail_price_lists_channel_check CHECK (((channel IS NULL) OR (channel = ANY (ARRAY['retail_pos'::text, 'online'::text])))),
    CONSTRAINT retail_price_lists_check CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at)))
);


--
-- Name: retail_price_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_price_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_price_lists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_price_lists_id_seq OWNED BY public.retail_price_lists.id;


--
-- Name: retail_product_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_product_media (
    id integer NOT NULL,
    product_id integer NOT NULL,
    variant_id integer,
    url text NOT NULL,
    alt text DEFAULT ''::text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_primary integer DEFAULT 0 NOT NULL
);


--
-- Name: retail_product_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_product_media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_product_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_product_media_id_seq OWNED BY public.retail_product_media.id;


--
-- Name: retail_public_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_public_limits (
    bucket text NOT NULL,
    window_start bigint NOT NULL,
    hits integer NOT NULL
);


--
-- Name: retail_return_line_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_return_line_batches (
    id integer NOT NULL,
    retail_return_line_id integer NOT NULL,
    batch_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT retail_return_line_batches_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: retail_return_line_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_return_line_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_return_line_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_return_line_batches_id_seq OWNED BY public.retail_return_line_batches.id;


--
-- Name: retail_return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_return_lines (
    id integer NOT NULL,
    retail_return_id integer NOT NULL,
    original_sale_line_id integer NOT NULL,
    variant_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    discount_allocated numeric(14,2) DEFAULT 0 NOT NULL,
    tax_allocated numeric(14,2) DEFAULT 0 NOT NULL,
    refund_amount numeric(14,2) DEFAULT 0 NOT NULL,
    unit_cogs numeric(14,4),
    condition text NOT NULL,
    disposition text NOT NULL,
    batch_id integer,
    reason text,
    notes text,
    total_cogs numeric(14,2),
    CONSTRAINT retail_return_lines_condition_check CHECK ((condition = ANY (ARRAY['RESELLABLE'::text, 'UNOPENED'::text, 'OPENED'::text, 'DAMAGED'::text, 'DEFECTIVE'::text, 'EXPIRED'::text, 'WRONG_ITEM'::text, 'OTHER'::text]))),
    CONSTRAINT retail_return_lines_disposition_check CHECK ((disposition = ANY (ARRAY['RETURN_TO_SELLABLE'::text, 'QUARANTINE'::text, 'WRITE_OFF'::text, 'NO_STOCK_RETURN'::text]))),
    CONSTRAINT retail_return_lines_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: retail_return_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_return_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_return_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_return_lines_id_seq OWNED BY public.retail_return_lines.id;


--
-- Name: retail_return_serial_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_return_serial_events (
    id integer NOT NULL,
    return_line_id integer NOT NULL,
    serial_id integer NOT NULL
);


--
-- Name: retail_return_serial_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_return_serial_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_return_serial_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_return_serial_events_id_seq OWNED BY public.retail_return_serial_events.id;


--
-- Name: retail_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_returns (
    id integer NOT NULL,
    return_number text,
    original_sale_id integer NOT NULL,
    business_day_id integer,
    customer_id integer,
    cashier_id integer,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    reason text,
    notes text,
    refund_method text,
    refund_total numeric(14,2) DEFAULT 0 NOT NULL,
    tax_reversal_total numeric(14,2) DEFAULT 0 NOT NULL,
    store_credit_issued numeric(14,2) DEFAULT 0 NOT NULL,
    without_receipt integer DEFAULT 0 NOT NULL,
    idempotency_key text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    posted_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_returns_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'CANCELLED'::text])))
);


--
-- Name: retail_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_returns_id_seq OWNED BY public.retail_returns.id;


--
-- Name: retail_sale_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_sale_audit (
    id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    event text NOT NULL,
    actor_id integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text) NOT NULL,
    CONSTRAINT retail_sale_audit_event_check CHECK ((event = 'REPRINT_REQUESTED'::text))
);


--
-- Name: retail_sale_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_sale_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_sale_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_sale_audit_id_seq OWNED BY public.retail_sale_audit.id;


--
-- Name: retail_sale_line_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_sale_line_batches (
    id integer NOT NULL,
    retail_sale_line_id integer NOT NULL,
    batch_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    CONSTRAINT retail_sale_line_batches_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: retail_sale_line_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_sale_line_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_sale_line_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_sale_line_batches_id_seq OWNED BY public.retail_sale_line_batches.id;


--
-- Name: retail_sale_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_sale_lines (
    id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    variant_id integer NOT NULL,
    sku_snapshot text,
    product_name_snapshot text NOT NULL,
    variant_name_snapshot text,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    list_price numeric(14,2),
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    unit_cost numeric(14,4),
    total_cost numeric(14,2),
    notes text,
    serial_numbers_json text,
    price_explanation_json text,
    CONSTRAINT retail_sale_lines_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: retail_sale_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_sale_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_sale_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_sale_lines_id_seq OWNED BY public.retail_sale_lines.id;


--
-- Name: retail_sale_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_sale_payments (
    id integer NOT NULL,
    retail_sale_id integer NOT NULL,
    method text NOT NULL,
    amount numeric(14,2) NOT NULL,
    cash_tendered numeric(14,2),
    change_given numeric(14,2),
    reference text,
    provider text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_sale_payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: retail_sale_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_sale_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_sale_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_sale_payments_id_seq OWNED BY public.retail_sale_payments.id;


--
-- Name: retail_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_sales (
    id integer NOT NULL,
    sale_number text,
    location_id integer,
    customer_id integer,
    cashier_id integer,
    business_day_id integer,
    status text DEFAULT 'HELD'::text NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_reason text,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    grand_total numeric(14,2) DEFAULT 0 NOT NULL,
    amount_paid numeric(14,2) DEFAULT 0 NOT NULL,
    amount_due numeric(14,2) DEFAULT 0 NOT NULL,
    cogs_total numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    idempotency_key text,
    held_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    completed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    channel text DEFAULT 'retail_pos'::text NOT NULL,
    delivery_charge numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT retail_sales_status_check CHECK ((status = ANY (ARRAY['HELD'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: retail_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_sales_id_seq OWNED BY public.retail_sales.id;


--
-- Name: retail_stock_count_line_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_stock_count_line_serials (
    id integer NOT NULL,
    retail_stock_count_line_id integer CONSTRAINT retail_stock_count_line_ser_retail_stock_count_line_id_not_null NOT NULL,
    serial_number text NOT NULL,
    expected integer DEFAULT 0 NOT NULL,
    counted integer DEFAULT 0 NOT NULL
);


--
-- Name: retail_stock_count_line_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_stock_count_line_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_stock_count_line_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_stock_count_line_serials_id_seq OWNED BY public.retail_stock_count_line_serials.id;


--
-- Name: retail_stock_count_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_stock_count_lines (
    id integer NOT NULL,
    retail_stock_count_id integer NOT NULL,
    variant_id integer NOT NULL,
    batch_id integer,
    expected_quantity numeric(14,3) DEFAULT 0 NOT NULL,
    snapshot_movement_id integer DEFAULT 0 NOT NULL,
    physical_quantity numeric(14,3),
    reconciled_expected_quantity numeric(14,3),
    variance numeric(14,3),
    value_variance numeric(14,2)
);


--
-- Name: retail_stock_count_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_stock_count_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_stock_count_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_stock_count_lines_id_seq OWNED BY public.retail_stock_count_lines.id;


--
-- Name: retail_stock_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_stock_counts (
    id integer NOT NULL,
    count_number text,
    location_id integer NOT NULL,
    count_type text DEFAULT 'CYCLE'::text NOT NULL,
    status text DEFAULT 'COUNTING'::text NOT NULL,
    blind integer DEFAULT 0 NOT NULL,
    created_by integer,
    counted_by integer,
    approved_by integer,
    snapshot_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    snapshot_movement_id integer DEFAULT 0 NOT NULL,
    started_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    completed_at timestamp without time zone,
    posted_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_stock_counts_count_type_check CHECK ((count_type = ANY (ARRAY['FULL'::text, 'CYCLE'::text, 'LOCATION'::text, 'CATEGORY'::text]))),
    CONSTRAINT retail_stock_counts_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'COUNTING'::text, 'REVIEW'::text, 'POSTED'::text, 'CANCELLED'::text])))
);


--
-- Name: retail_stock_counts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_stock_counts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_stock_counts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_stock_counts_id_seq OWNED BY public.retail_stock_counts.id;


--
-- Name: retail_supplier_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_supplier_skus (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    supplier_id integer NOT NULL,
    supplier_sku text,
    supplier_barcode text,
    minimum_order_quantity numeric(14,3),
    preferred integer DEFAULT 0 NOT NULL
);


--
-- Name: retail_supplier_skus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_supplier_skus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_supplier_skus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_supplier_skus_id_seq OWNED BY public.retail_supplier_skus.id;


--
-- Name: retail_transfer_line_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_transfer_line_serials (
    id integer NOT NULL,
    retail_transfer_line_id integer NOT NULL,
    serial_number text NOT NULL,
    received_at timestamp without time zone
);


--
-- Name: retail_transfer_line_serials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_transfer_line_serials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_transfer_line_serials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_transfer_line_serials_id_seq OWNED BY public.retail_transfer_line_serials.id;


--
-- Name: retail_transfer_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_transfer_lines (
    id integer NOT NULL,
    retail_transfer_id integer NOT NULL,
    variant_id integer NOT NULL,
    batch_id integer,
    requested_quantity numeric(14,3) NOT NULL,
    dispatched_quantity numeric(14,3) DEFAULT 0 NOT NULL,
    received_quantity numeric(14,3) DEFAULT 0 NOT NULL,
    unit_cost_snapshot numeric(14,4),
    discrepancy_reason text,
    discrepancy_disposition text,
    notes text,
    CONSTRAINT retail_transfer_lines_requested_quantity_check CHECK ((requested_quantity > (0)::numeric))
);


--
-- Name: retail_transfer_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_transfer_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_transfer_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_transfer_lines_id_seq OWNED BY public.retail_transfer_lines.id;


--
-- Name: retail_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_transfers (
    id integer NOT NULL,
    transfer_number text,
    source_location_id integer NOT NULL,
    destination_location_id integer NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    requested_by integer,
    dispatched_by integer,
    received_by integer,
    requested_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    dispatched_at timestamp without time zone,
    received_at timestamp without time zone,
    notes text,
    reason text,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    updated_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT retail_transfers_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'DISPATCHED'::text, 'RECEIVED'::text, 'CANCELLED'::text])))
);


--
-- Name: retail_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retail_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retail_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retail_transfers_id_seq OWNED BY public.retail_transfers.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role text NOT NULL,
    permission_key text NOT NULL,
    allowed integer DEFAULT 0 NOT NULL,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: salary_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_advances (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    amount double precision NOT NULL,
    advanced_on date DEFAULT CURRENT_DATE NOT NULL,
    method text DEFAULT 'cash'::text NOT NULL,
    note text,
    given_by integer,
    business_day_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT salary_advances_amount_check CHECK ((amount > (0)::double precision))
);


--
-- Name: salary_advances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_advances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_advances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_advances_id_seq OWNED BY public.salary_advances.id;


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_payments (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    amount double precision NOT NULL,
    period_label text,
    paid_on date DEFAULT CURRENT_DATE NOT NULL,
    method text DEFAULT 'cash'::text,
    note text,
    paid_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    business_day_id integer,
    gross_amount double precision,
    advance_deduction double precision DEFAULT 0 NOT NULL,
    CONSTRAINT salary_payments_amount_check CHECK ((amount >= (0)::double precision))
);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_payments_id_seq OWNED BY public.salary_payments.id;


--
-- Name: savings_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.savings_deposits (
    id integer NOT NULL,
    deposit_date date DEFAULT CURRENT_DATE NOT NULL,
    deposit_type text DEFAULT 'bank'::text NOT NULL,
    destination_name text NOT NULL,
    source_account text NOT NULL,
    amount numeric(14,2) NOT NULL,
    reference_number text,
    notes text,
    status text DEFAULT 'active'::text NOT NULL,
    journal_id integer,
    business_day_id integer,
    created_by integer,
    voided_by integer,
    voided_at timestamp without time zone,
    void_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT savings_deposits_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT savings_deposits_source_account_check CHECK ((source_account = ANY (ARRAY['cash'::text, 'online'::text]))),
    CONSTRAINT savings_deposits_status_check CHECK ((status = ANY (ARRAY['active'::text, 'voided'::text])))
);


--
-- Name: savings_deposits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.savings_deposits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: savings_deposits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.savings_deposits_id_seq OWNED BY public.savings_deposits.id;


--
-- Name: scheduled_cash_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_cash_counts (
    id integer NOT NULL,
    count_date date NOT NULL,
    scheduled_time text NOT NULL,
    cashier_id integer NOT NULL,
    business_day_id integer,
    counted_cash numeric(14,2) NOT NULL,
    expected_cash numeric(14,2) NOT NULL,
    cash_difference numeric(14,2) NOT NULL,
    denominations text NOT NULL,
    expected_breakdown text,
    submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT scheduled_cash_counts_counted_cash_check CHECK ((counted_cash >= (0)::numeric))
);


--
-- Name: scheduled_cash_counts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_cash_counts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_cash_counts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_cash_counts_id_seq OWNED BY public.scheduled_cash_counts.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    token_hash text
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: site_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_content (
    content_key text NOT NULL,
    content_value text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_credit_transactions (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(14,2) NOT NULL,
    balance_after numeric(14,2) NOT NULL,
    source_type text,
    source_id integer,
    reason text,
    created_by integer,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    idempotency_key text,
    CONSTRAINT store_credit_transactions_type_check CHECK ((type = ANY (ARRAY['ISSUE'::text, 'REDEEM'::text, 'ADJUSTMENT'::text, 'REVERSAL'::text])))
);


--
-- Name: store_credit_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_credit_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_credit_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_credit_transactions_id_seq OWNED BY public.store_credit_transactions.id;


--
-- Name: supplier_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payment_allocations (
    id integer NOT NULL,
    supplier_id integer NOT NULL,
    payment_journal_id integer NOT NULL,
    charge_journal_id integer NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'::text),
    CONSTRAINT supplier_payment_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: supplier_payment_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_payment_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_payment_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_payment_allocations_id_seq OWNED BY public.supplier_payment_allocations.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    phone text,
    email text,
    address text,
    notes text,
    is_archived integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    setting_key text NOT NULL,
    setting_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    email text,
    phone text,
    is_active integer DEFAULT 1,
    must_change_password integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    salary double precision,
    hire_date date,
    "position" text,
    department_id integer,
    designation_id integer,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'cashier'::text, 'inventory_staff'::text, 'purchasing_staff'::text, 'accountant'::text, 'manager'::text, 'waiter'::text, 'kitchen'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: variant_attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_attribute_values (
    id integer NOT NULL,
    variant_id integer NOT NULL,
    attribute_id integer NOT NULL,
    attribute_value_id integer NOT NULL
);


--
-- Name: variant_attribute_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.variant_attribute_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: variant_attribute_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.variant_attribute_values_id_seq OWNED BY public.variant_attribute_values.id;


--
-- Name: warranty_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claims (
    id integer NOT NULL,
    claim_number text NOT NULL,
    snapshot_id integer,
    sale_id integer NOT NULL,
    sale_line_id integer NOT NULL,
    variant_id integer NOT NULL,
    customer_id integer,
    serial_number text DEFAULT ''::text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    issue text NOT NULL,
    description text NOT NULL,
    condition text DEFAULT ''::text NOT NULL,
    accessories text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    eligibility text NOT NULL,
    resolution text,
    disposition text,
    custody text DEFAULT 'CUSTOMER'::text NOT NULL,
    assigned_to integer,
    channel text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    return_id integer,
    replacement_serial text,
    replacement_variant_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp without time zone,
    closed_at timestamp without time zone,
    batch_id integer,
    CONSTRAINT warranty_claims_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: warranty_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_claims_id_seq OWNED BY public.warranty_claims.id;


--
-- Name: warranty_economics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_economics (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    kind text NOT NULL,
    variant_id integer NOT NULL,
    quantity numeric(14,3) NOT NULL,
    serial_numbers text DEFAULT '[]'::text NOT NULL,
    carrying_value numeric(14,2) DEFAULT 0 NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT warranty_economics_kind_check CHECK ((kind = ANY (ARRAY['PART'::text, 'REPLACEMENT'::text]))),
    CONSTRAINT warranty_economics_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: warranty_economics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_economics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_economics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_economics_id_seq OWNED BY public.warranty_economics.id;


--
-- Name: warranty_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_events (
    id integer NOT NULL,
    claim_id integer,
    kind text NOT NULL,
    actor_id integer,
    internal_note text DEFAULT ''::text NOT NULL,
    customer_note text DEFAULT ''::text NOT NULL,
    evidence text DEFAULT '{}'::text NOT NULL,
    request_key text,
    request_hash text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: warranty_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_events_id_seq OWNED BY public.warranty_events.id;


--
-- Name: warranty_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_inspections (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    received_condition text NOT NULL,
    observed_fault text NOT NULL,
    test_result text NOT NULL,
    customer_damage integer DEFAULT 0 NOT NULL,
    eligibility text NOT NULL,
    recommended_resolution text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    inspector_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: warranty_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_inspections_id_seq OWNED BY public.warranty_inspections.id;


--
-- Name: warranty_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_policies (
    id integer NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    scope_key text DEFAULT ''::text NOT NULL,
    duration integer NOT NULL,
    duration_unit text NOT NULL,
    start_event text DEFAULT 'FULFILLED_SALE'::text NOT NULL,
    coverage text NOT NULL,
    exclusions text DEFAULT ''::text NOT NULL,
    proof_required integer DEFAULT 1 NOT NULL,
    serial_required integer DEFAULT 0 NOT NULL,
    customer_required integer DEFAULT 0 NOT NULL,
    replacement_rule text NOT NULL,
    replacement_days integer,
    active integer DEFAULT 1 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT warranty_policies_duration_check CHECK (((duration >= 1) AND (duration <= 3650))),
    CONSTRAINT warranty_policies_duration_unit_check CHECK ((duration_unit = ANY (ARRAY['DAYS'::text, 'MONTHS'::text]))),
    CONSTRAINT warranty_policies_replacement_days_check CHECK (((replacement_days >= 1) AND (replacement_days <= 3650))),
    CONSTRAINT warranty_policies_replacement_rule_check CHECK ((replacement_rule = ANY (ARRAY['ORIGINAL_EXPIRY'::text, 'NEW_FULL'::text, 'SPECIFIED'::text]))),
    CONSTRAINT warranty_policies_scope_check CHECK ((scope = ANY (ARRAY['BUSINESS'::text, 'BRAND'::text, 'PRODUCT'::text, 'SKU'::text]))),
    CONSTRAINT warranty_policies_start_event_check CHECK ((start_event = 'FULFILLED_SALE'::text))
);


--
-- Name: warranty_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_policies_id_seq OWNED BY public.warranty_policies.id;


--
-- Name: warranty_repairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_repairs (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    status text DEFAULT 'IN_PROGRESS'::text NOT NULL,
    technician_id integer,
    diagnosis text NOT NULL,
    work_performed text DEFAULT ''::text NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone
);


--
-- Name: warranty_repairs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_repairs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_repairs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_repairs_id_seq OWNED BY public.warranty_repairs.id;


--
-- Name: warranty_rmas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_rmas (
    id integer NOT NULL,
    rma_number text NOT NULL,
    claim_id integer NOT NULL,
    supplier_id integer NOT NULL,
    grn_id integer,
    supplier_reference text NOT NULL,
    status text DEFAULT 'SENT'::text NOT NULL,
    expected_date date,
    outcome text,
    notes text DEFAULT ''::text NOT NULL,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone,
    ownership text DEFAULT 'CUSTOMER'::text NOT NULL,
    source_location_id integer,
    rma_location_id integer,
    replacement_serial text,
    purchase_return_id integer
);


--
-- Name: warranty_rmas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_rmas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_rmas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_rmas_id_seq OWNED BY public.warranty_rmas.id;


--
-- Name: warranty_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_snapshots (
    id integer NOT NULL,
    sale_id integer NOT NULL,
    sale_line_id integer NOT NULL,
    variant_id integer NOT NULL,
    customer_id integer,
    serial_number text DEFAULT ''::text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    policy_id integer,
    terms text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    origin_claim_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT warranty_snapshots_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: warranty_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warranty_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warranty_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warranty_snapshots_id_seq OWNED BY public.warranty_snapshots.id;


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: bank_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts ALTER COLUMN id SET DEFAULT nextval('public.bank_accounts_id_seq'::regclass);


--
-- Name: bank_reconciliations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations ALTER COLUMN id SET DEFAULT nextval('public.bank_reconciliations_id_seq'::regclass);


--
-- Name: business_day_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_audit ALTER COLUMN id SET DEFAULT nextval('public.business_day_audit_id_seq'::regclass);


--
-- Name: business_day_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions ALTER COLUMN id SET DEFAULT nextval('public.business_day_sessions_id_seq'::regclass);


--
-- Name: business_days id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days ALTER COLUMN id SET DEFAULT nextval('public.business_days_id_seq'::regclass);


--
-- Name: business_funding_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_funding_transactions ALTER COLUMN id SET DEFAULT nextval('public.business_funding_transactions_id_seq'::regclass);


--
-- Name: cash_drawers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_drawers ALTER COLUMN id SET DEFAULT nextval('public.cash_drawers_id_seq'::regclass);


--
-- Name: cash_variance_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_variance_reviews ALTER COLUMN id SET DEFAULT nextval('public.cash_variance_reviews_id_seq'::regclass);


--
-- Name: customer_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger ALTER COLUMN id SET DEFAULT nextval('public.customer_ledger_id_seq'::regclass);


--
-- Name: customer_master_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_master_audit ALTER COLUMN id SET DEFAULT nextval('public.customer_master_audit_id_seq'::regclass);


--
-- Name: customer_payment_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payment_reminders ALTER COLUMN id SET DEFAULT nextval('public.customer_payment_reminders_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: designations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations ALTER COLUMN id SET DEFAULT nextval('public.designations_id_seq'::regclass);


--
-- Name: devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices ALTER COLUMN id SET DEFAULT nextval('public.devices_id_seq'::regclass);


--
-- Name: document_counters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters ALTER COLUMN id SET DEFAULT nextval('public.document_counters_id_seq'::regclass);


--
-- Name: drawer_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions ALTER COLUMN id SET DEFAULT nextval('public.drawer_sessions_id_seq'::regclass);


--
-- Name: expense_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories ALTER COLUMN id SET DEFAULT nextval('public.expense_categories_id_seq'::regclass);


--
-- Name: expense_change_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_change_audit ALTER COLUMN id SET DEFAULT nextval('public.expense_change_audit_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: goods_receipt_line_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_batches ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_line_batches_id_seq'::regclass);


--
-- Name: goods_receipt_line_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_serials ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_line_serials_id_seq'::regclass);


--
-- Name: goods_receipt_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_lines ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_lines_id_seq'::regclass);


--
-- Name: goods_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts ALTER COLUMN id SET DEFAULT nextval('public.goods_receipts_id_seq'::regclass);


--
-- Name: holidays id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays ALTER COLUMN id SET DEFAULT nextval('public.holidays_id_seq'::regclass);


--
-- Name: inventory_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances ALTER COLUMN id SET DEFAULT nextval('public.inventory_balances_id_seq'::regclass);


--
-- Name: inventory_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches ALTER COLUMN id SET DEFAULT nextval('public.inventory_batches_id_seq'::regclass);


--
-- Name: inventory_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations ALTER COLUMN id SET DEFAULT nextval('public.inventory_locations_id_seq'::regclass);


--
-- Name: inventory_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements ALTER COLUMN id SET DEFAULT nextval('public.inventory_movements_id_seq'::regclass);


--
-- Name: inventory_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations ALTER COLUMN id SET DEFAULT nextval('public.inventory_reservations_id_seq'::regclass);


--
-- Name: inventory_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials ALTER COLUMN id SET DEFAULT nextval('public.inventory_serials_id_seq'::regclass);


--
-- Name: journal_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);


--
-- Name: journal_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_lines_id_seq'::regclass);


--
-- Name: loyalty_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions ALTER COLUMN id SET DEFAULT nextval('public.loyalty_transactions_id_seq'::regclass);


--
-- Name: operations_decisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions ALTER COLUMN id SET DEFAULT nextval('public.operations_decisions_id_seq'::regclass);


--
-- Name: operations_policy_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policy_audit ALTER COLUMN id SET DEFAULT nextval('public.operations_policy_audit_id_seq'::regclass);


--
-- Name: operations_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_snapshots ALTER COLUMN id SET DEFAULT nextval('public.operations_snapshots_id_seq'::regclass);


--
-- Name: payment_settlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements ALTER COLUMN id SET DEFAULT nextval('public.payment_settlements_id_seq'::regclass);


--
-- Name: permission_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_audit ALTER COLUMN id SET DEFAULT nextval('public.permission_audit_id_seq'::regclass);


--
-- Name: product_attribute_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attribute_values ALTER COLUMN id SET DEFAULT nextval('public.product_attribute_values_id_seq'::regclass);


--
-- Name: product_attributes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes ALTER COLUMN id SET DEFAULT nextval('public.product_attributes_id_seq'::regclass);


--
-- Name: product_barcodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_barcodes ALTER COLUMN id SET DEFAULT nextval('public.product_barcodes_id_seq'::regclass);


--
-- Name: product_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN id SET DEFAULT nextval('public.product_categories_id_seq'::regclass);


--
-- Name: product_variants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants ALTER COLUMN id SET DEFAULT nextval('public.product_variants_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: promotion_redemptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions ALTER COLUMN id SET DEFAULT nextval('public.promotion_redemptions_id_seq'::regclass);


--
-- Name: promotion_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets ALTER COLUMN id SET DEFAULT nextval('public.promotion_targets_id_seq'::regclass);


--
-- Name: promotions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions ALTER COLUMN id SET DEFAULT nextval('public.promotions_id_seq'::regclass);


--
-- Name: purchase_order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_lines_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: purchase_return_line_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_line_serials ALTER COLUMN id SET DEFAULT nextval('public.purchase_return_line_serials_id_seq'::regclass);


--
-- Name: purchase_return_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines ALTER COLUMN id SET DEFAULT nextval('public.purchase_return_lines_id_seq'::regclass);


--
-- Name: purchase_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns ALTER COLUMN id SET DEFAULT nextval('public.purchase_returns_id_seq'::regclass);


--
-- Name: rate_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits ALTER COLUMN id SET DEFAULT nextval('public.rate_limits_id_seq'::regclass);


--
-- Name: retail_brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_brands ALTER COLUMN id SET DEFAULT nextval('public.retail_brands_id_seq'::regclass);


--
-- Name: retail_catalog_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_catalog_jobs ALTER COLUMN id SET DEFAULT nextval('public.retail_catalog_jobs_id_seq'::regclass);


--
-- Name: retail_credit_collection_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collection_allocations ALTER COLUMN id SET DEFAULT nextval('public.retail_credit_collection_allocations_id_seq'::regclass);


--
-- Name: retail_credit_collections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections ALTER COLUMN id SET DEFAULT nextval('public.retail_credit_collections_id_seq'::regclass);


--
-- Name: retail_credit_overrides id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides ALTER COLUMN id SET DEFAULT nextval('public.retail_credit_overrides_id_seq'::regclass);


--
-- Name: retail_credit_writeoffs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs ALTER COLUMN id SET DEFAULT nextval('public.retail_credit_writeoffs_id_seq'::regclass);


--
-- Name: retail_customer_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_accounts ALTER COLUMN id SET DEFAULT nextval('public.retail_customer_accounts_id_seq'::regclass);


--
-- Name: retail_customer_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_groups ALTER COLUMN id SET DEFAULT nextval('public.retail_customer_groups_id_seq'::regclass);


--
-- Name: retail_customer_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_invites ALTER COLUMN id SET DEFAULT nextval('public.retail_customer_invites_id_seq'::regclass);


--
-- Name: retail_exchanges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges ALTER COLUMN id SET DEFAULT nextval('public.retail_exchanges_id_seq'::regclass);


--
-- Name: retail_inventory_adjustments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments ALTER COLUMN id SET DEFAULT nextval('public.retail_inventory_adjustments_id_seq'::regclass);


--
-- Name: retail_loyalty_settings_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_loyalty_settings_audit ALTER COLUMN id SET DEFAULT nextval('public.retail_loyalty_settings_audit_id_seq'::regclass);


--
-- Name: retail_online_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_events ALTER COLUMN id SET DEFAULT nextval('public.retail_online_events_id_seq'::regclass);


--
-- Name: retail_online_order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_order_lines ALTER COLUMN id SET DEFAULT nextval('public.retail_online_order_lines_id_seq'::regclass);


--
-- Name: retail_online_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders ALTER COLUMN id SET DEFAULT nextval('public.retail_online_orders_id_seq'::regclass);


--
-- Name: retail_price_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_audit ALTER COLUMN id SET DEFAULT nextval('public.retail_price_audit_id_seq'::regclass);


--
-- Name: retail_price_list_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_list_items ALTER COLUMN id SET DEFAULT nextval('public.retail_price_list_items_id_seq'::regclass);


--
-- Name: retail_price_lists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_lists ALTER COLUMN id SET DEFAULT nextval('public.retail_price_lists_id_seq'::regclass);


--
-- Name: retail_product_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_product_media ALTER COLUMN id SET DEFAULT nextval('public.retail_product_media_id_seq'::regclass);


--
-- Name: retail_return_line_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_line_batches ALTER COLUMN id SET DEFAULT nextval('public.retail_return_line_batches_id_seq'::regclass);


--
-- Name: retail_return_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines ALTER COLUMN id SET DEFAULT nextval('public.retail_return_lines_id_seq'::regclass);


--
-- Name: retail_return_serial_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_serial_events ALTER COLUMN id SET DEFAULT nextval('public.retail_return_serial_events_id_seq'::regclass);


--
-- Name: retail_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns ALTER COLUMN id SET DEFAULT nextval('public.retail_returns_id_seq'::regclass);


--
-- Name: retail_sale_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_audit ALTER COLUMN id SET DEFAULT nextval('public.retail_sale_audit_id_seq'::regclass);


--
-- Name: retail_sale_line_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_line_batches ALTER COLUMN id SET DEFAULT nextval('public.retail_sale_line_batches_id_seq'::regclass);


--
-- Name: retail_sale_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_lines ALTER COLUMN id SET DEFAULT nextval('public.retail_sale_lines_id_seq'::regclass);


--
-- Name: retail_sale_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_payments ALTER COLUMN id SET DEFAULT nextval('public.retail_sale_payments_id_seq'::regclass);


--
-- Name: retail_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales ALTER COLUMN id SET DEFAULT nextval('public.retail_sales_id_seq'::regclass);


--
-- Name: retail_stock_count_line_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_line_serials ALTER COLUMN id SET DEFAULT nextval('public.retail_stock_count_line_serials_id_seq'::regclass);


--
-- Name: retail_stock_count_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_lines ALTER COLUMN id SET DEFAULT nextval('public.retail_stock_count_lines_id_seq'::regclass);


--
-- Name: retail_stock_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts ALTER COLUMN id SET DEFAULT nextval('public.retail_stock_counts_id_seq'::regclass);


--
-- Name: retail_supplier_skus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_supplier_skus ALTER COLUMN id SET DEFAULT nextval('public.retail_supplier_skus_id_seq'::regclass);


--
-- Name: retail_transfer_line_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_line_serials ALTER COLUMN id SET DEFAULT nextval('public.retail_transfer_line_serials_id_seq'::regclass);


--
-- Name: retail_transfer_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_lines ALTER COLUMN id SET DEFAULT nextval('public.retail_transfer_lines_id_seq'::regclass);


--
-- Name: retail_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers ALTER COLUMN id SET DEFAULT nextval('public.retail_transfers_id_seq'::regclass);


--
-- Name: salary_advances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances ALTER COLUMN id SET DEFAULT nextval('public.salary_advances_id_seq'::regclass);


--
-- Name: salary_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments ALTER COLUMN id SET DEFAULT nextval('public.salary_payments_id_seq'::regclass);


--
-- Name: savings_deposits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits ALTER COLUMN id SET DEFAULT nextval('public.savings_deposits_id_seq'::regclass);


--
-- Name: scheduled_cash_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_cash_counts ALTER COLUMN id SET DEFAULT nextval('public.scheduled_cash_counts_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: store_credit_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credit_transactions ALTER COLUMN id SET DEFAULT nextval('public.store_credit_transactions_id_seq'::regclass);


--
-- Name: supplier_payment_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations ALTER COLUMN id SET DEFAULT nextval('public.supplier_payment_allocations_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: variant_attribute_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values ALTER COLUMN id SET DEFAULT nextval('public.variant_attribute_values_id_seq'::regclass);


--
-- Name: warranty_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims ALTER COLUMN id SET DEFAULT nextval('public.warranty_claims_id_seq'::regclass);


--
-- Name: warranty_economics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_economics ALTER COLUMN id SET DEFAULT nextval('public.warranty_economics_id_seq'::regclass);


--
-- Name: warranty_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_events ALTER COLUMN id SET DEFAULT nextval('public.warranty_events_id_seq'::regclass);


--
-- Name: warranty_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_inspections ALTER COLUMN id SET DEFAULT nextval('public.warranty_inspections_id_seq'::regclass);


--
-- Name: warranty_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies ALTER COLUMN id SET DEFAULT nextval('public.warranty_policies_id_seq'::regclass);


--
-- Name: warranty_repairs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_repairs ALTER COLUMN id SET DEFAULT nextval('public.warranty_repairs_id_seq'::regclass);


--
-- Name: warranty_rmas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas ALTER COLUMN id SET DEFAULT nextval('public.warranty_rmas_id_seq'::regclass);


--
-- Name: warranty_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots ALTER COLUMN id SET DEFAULT nextval('public.warranty_snapshots_id_seq'::regclass);


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.accounts VALUES (1, '1000', 'Assets', 'asset', NULL, NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (12, '2000', 'Liabilities', 'liability', NULL, NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (14, '3000', 'Equity', 'equity', NULL, NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (17, '4000', 'Income', 'income', NULL, NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (20, '5000', 'Expenses', 'expense', NULL, NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (2, '1010', 'Cash on Hand', 'asset', 'cash', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (3, '1020', 'Bank', 'asset', 'bank', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (4, '1030', 'Cash Reserve / Safe', 'asset', 'cash_reserve', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (11, '1300', 'Accounts Receivable', 'asset', 'receivable', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (13, '2010', 'Accounts Payable', 'liability', 'payable', 12, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (15, '3010', 'Owner''s Equity', 'equity', NULL, 14, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (16, '3020', 'Opening Balance Equity', 'equity', NULL, 14, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (18, '4010', 'Sales Revenue', 'income', 'sales', 17, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (19, '4020', 'Other Income', 'income', NULL, 17, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (22, '5020', 'Operating Expenses', 'expense', 'operating', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (23, '5030', 'Payroll', 'expense', 'payroll', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (25, '5050', 'Payment Processing Fees', 'expense', 'fees', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (26, '5060', 'Cash Over / Short', 'expense', 'variance', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (27, '2020', 'VAT / Tax Payable', 'liability', 'tax_payable', 12, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (29, '1040', 'Savings & Deposits', 'asset', 'savings', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (31, '1050', 'Business Funding', 'asset', 'business_funding', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (5, '1100', 'Card Clearing', 'asset', 'clearing', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (6, '1110', 'eSewa Clearing', 'asset', 'clearing', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (7, '1120', 'Khalti Clearing', 'asset', 'clearing', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (8, '1130', 'QR / Fonepay Clearing', 'asset', 'clearing', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (9, '1140', 'Online Clearing', 'asset', 'clearing', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (32, '1210', 'Retail Inventory', 'asset', 'retail_inventory', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (33, '5080', 'Cost of Goods Sold', 'expense', 'cogs', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (34, '5090', 'Purchase Price Variance', 'expense', 'variance', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (35, '4011', 'Sales Returns', 'income', 'contra_revenue', 17, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (36, '2030', 'Store Credit Liability', 'liability', 'store_credit', 12, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (37, '5043', 'Warranty & After-Sales Expense', 'expense', 'warranty', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.accounts VALUES (24, '5040', 'Inventory Loss / Damage', 'expense', 'inventory_loss', 20, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: bank_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.bank_accounts VALUES (1, 'Primary Bank', NULL, 3, 0.00, 1, CURRENT_TIMESTAMP);


--
-- Data for Name: bank_reconciliations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: business_day_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: business_day_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: business_days; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: business_funding_transactions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: cash_drawers; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cash_drawers VALUES (1, 'Main Drawer', 1, CURRENT_TIMESTAMP);


--
-- Data for Name: cash_variance_reviews; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customer_ledger; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customer_master_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customer_payment_reminders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: designations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: devices; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: document_counters; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: drawer_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expense_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expense_change_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goods_receipt_line_batches; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goods_receipt_line_serials; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goods_receipt_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goods_receipts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: holidays; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_balances; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_batches; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_costs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_locations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.inventory_locations VALUES (1, NULL, 'Main Store', 'MAIN', 'shop', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);
INSERT INTO public.inventory_locations VALUES (2, NULL, 'Returns Quarantine', 'QUARANTINE', 'damaged', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
INSERT INTO public.inventory_locations VALUES (3, NULL, 'In Transit', 'IN_TRANSIT', 'in_transit', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
INSERT INTO public.inventory_locations VALUES (4, NULL, 'Supplier warranty custody', 'SUPPLIER_RMA', 'damaged', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);


--
-- Data for Name: inventory_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_reservations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: inventory_serials; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: journal_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: loyalty_transactions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: operations_decisions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: operations_policies; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: operations_policy_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: operations_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_settlements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permission_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_attribute_values; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_attributes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_barcodes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: promotion_redemptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: promotion_targets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: promotions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_order_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_return_line_serials; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_return_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_returns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_brands; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_catalog_jobs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_credit_collection_allocations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_credit_collections; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_credit_overrides; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_credit_writeoffs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_customer_accounts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_customer_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_customer_invites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_customer_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_exchanges; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_inventory_adjustments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_loyalty_settings_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_margin_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.retail_margin_policy VALUES (1, 'off', 0.00);


--
-- Data for Name: retail_online_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_online_order_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_online_orders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_online_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.retail_online_settings VALUES (1, 0, '99 Shop by Shahana', 'Collect from our store after your order is ready.', 0, 0.00, NULL, 120, '', 0, 'Contact the store with your order number for a return or exchange.', '#20372e', NULL, '', 'Thoughtfully selected essentials. A little discovery in every visit.', 1);


--
-- Data for Name: retail_price_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_price_list_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_price_lists; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_product_media; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_public_limits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_return_line_batches; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_return_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_return_serial_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_returns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_sale_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_sale_line_batches; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_sale_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_sale_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_sales; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_stock_count_line_serials; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_stock_count_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_stock_counts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_supplier_skus; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_transfer_line_serials; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_transfer_lines; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: retail_transfers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: salary_advances; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: salary_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: savings_deposits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: scheduled_cash_counts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: site_content; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_credit_transactions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: supplier_payment_allocations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.system_settings VALUES (15, 'calendar_system', 'BS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: variant_attribute_values; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_claims; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_economics; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_inspections; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_policies; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_repairs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_rmas; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: warranty_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_id_seq', 37, true);


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.attendance_id_seq', 1, false);


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bank_accounts_id_seq', 1, true);


--
-- Name: bank_reconciliations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bank_reconciliations_id_seq', 1, false);


--
-- Name: business_day_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_day_audit_id_seq', 1, false);


--
-- Name: business_day_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_day_sessions_id_seq', 1, false);


--
-- Name: business_days_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_days_id_seq', 1, false);


--
-- Name: business_funding_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_funding_transactions_id_seq', 1, false);


--
-- Name: cash_drawers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cash_drawers_id_seq', 1, true);


--
-- Name: cash_variance_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cash_variance_reviews_id_seq', 1, false);


--
-- Name: customer_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_ledger_id_seq', 1, false);


--
-- Name: customer_master_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_master_audit_id_seq', 1, false);


--
-- Name: customer_payment_reminders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_payment_reminders_id_seq', 1, false);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 1, false);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 1, false);


--
-- Name: designations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.designations_id_seq', 1, false);


--
-- Name: devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.devices_id_seq', 1, false);


--
-- Name: document_counters_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.document_counters_id_seq', 1, false);


--
-- Name: drawer_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.drawer_sessions_id_seq', 1, false);


--
-- Name: expense_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_categories_id_seq', 1, false);


--
-- Name: expense_change_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_change_audit_id_seq', 1, false);


--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expenses_id_seq', 1, false);


--
-- Name: goods_receipt_line_batches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipt_line_batches_id_seq', 1, false);


--
-- Name: goods_receipt_line_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipt_line_serials_id_seq', 1, false);


--
-- Name: goods_receipt_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipt_lines_id_seq', 1, false);


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipts_id_seq', 1, false);


--
-- Name: holidays_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.holidays_id_seq', 1, false);


--
-- Name: inventory_balances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_balances_id_seq', 1, false);


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_batches_id_seq', 1, false);


--
-- Name: inventory_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_locations_id_seq', 4, true);


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_movements_id_seq', 1, false);


--
-- Name: inventory_reservations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_reservations_id_seq', 1, false);


--
-- Name: inventory_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_serials_id_seq', 1, false);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.journal_entries_id_seq', 1, false);


--
-- Name: journal_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.journal_lines_id_seq', 1, false);


--
-- Name: loyalty_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.loyalty_transactions_id_seq', 1, false);


--
-- Name: operations_decisions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.operations_decisions_id_seq', 1, false);


--
-- Name: operations_policy_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.operations_policy_audit_id_seq', 1, false);


--
-- Name: operations_snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.operations_snapshots_id_seq', 1, false);


--
-- Name: payment_settlements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payment_settlements_id_seq', 1, false);


--
-- Name: permission_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.permission_audit_id_seq', 1, false);


--
-- Name: product_attribute_values_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_attribute_values_id_seq', 1, false);


--
-- Name: product_attributes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_attributes_id_seq', 1, false);


--
-- Name: product_barcodes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_barcodes_id_seq', 1, false);


--
-- Name: product_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_categories_id_seq', 1, false);


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 1, false);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 1, false);


--
-- Name: promotion_redemptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotion_redemptions_id_seq', 1, false);


--
-- Name: promotion_targets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotion_targets_id_seq', 1, false);


--
-- Name: promotions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotions_id_seq', 1, false);


--
-- Name: purchase_order_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_order_lines_id_seq', 1, false);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_orders_id_seq', 1, false);


--
-- Name: purchase_return_line_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_return_line_serials_id_seq', 1, false);


--
-- Name: purchase_return_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_return_lines_id_seq', 1, false);


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_returns_id_seq', 1, false);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rate_limits_id_seq', 1, false);


--
-- Name: retail_brands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_brands_id_seq', 1, false);


--
-- Name: retail_catalog_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_catalog_jobs_id_seq', 1, false);


--
-- Name: retail_credit_collection_allocations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_credit_collection_allocations_id_seq', 1, false);


--
-- Name: retail_credit_collections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_credit_collections_id_seq', 1, false);


--
-- Name: retail_credit_overrides_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_credit_overrides_id_seq', 1, false);


--
-- Name: retail_credit_writeoffs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_credit_writeoffs_id_seq', 1, false);


--
-- Name: retail_customer_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_customer_accounts_id_seq', 1, false);


--
-- Name: retail_customer_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_customer_groups_id_seq', 1, false);


--
-- Name: retail_customer_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_customer_invites_id_seq', 1, false);


--
-- Name: retail_exchanges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_exchanges_id_seq', 1, false);


--
-- Name: retail_inventory_adjustments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_inventory_adjustments_id_seq', 1, false);


--
-- Name: retail_loyalty_settings_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_loyalty_settings_audit_id_seq', 1, false);


--
-- Name: retail_online_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_online_events_id_seq', 1, false);


--
-- Name: retail_online_order_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_online_order_lines_id_seq', 1, false);


--
-- Name: retail_online_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_online_orders_id_seq', 1, false);


--
-- Name: retail_price_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_price_audit_id_seq', 1, false);


--
-- Name: retail_price_list_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_price_list_items_id_seq', 1, false);


--
-- Name: retail_price_lists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_price_lists_id_seq', 1, false);


--
-- Name: retail_product_media_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_product_media_id_seq', 1, false);


--
-- Name: retail_return_line_batches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_return_line_batches_id_seq', 1, false);


--
-- Name: retail_return_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_return_lines_id_seq', 1, false);


--
-- Name: retail_return_serial_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_return_serial_events_id_seq', 1, false);


--
-- Name: retail_returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_returns_id_seq', 1, false);


--
-- Name: retail_sale_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_sale_audit_id_seq', 1, false);


--
-- Name: retail_sale_line_batches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_sale_line_batches_id_seq', 1, false);


--
-- Name: retail_sale_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_sale_lines_id_seq', 1, false);


--
-- Name: retail_sale_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_sale_payments_id_seq', 1, false);


--
-- Name: retail_sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_sales_id_seq', 1, false);


--
-- Name: retail_stock_count_line_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_stock_count_line_serials_id_seq', 1, false);


--
-- Name: retail_stock_count_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_stock_count_lines_id_seq', 1, false);


--
-- Name: retail_stock_counts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_stock_counts_id_seq', 1, false);


--
-- Name: retail_supplier_skus_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_supplier_skus_id_seq', 1, false);


--
-- Name: retail_transfer_line_serials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_transfer_line_serials_id_seq', 1, false);


--
-- Name: retail_transfer_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_transfer_lines_id_seq', 1, false);


--
-- Name: retail_transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retail_transfers_id_seq', 1, false);


--
-- Name: salary_advances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_advances_id_seq', 1, false);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_payments_id_seq', 1, false);


--
-- Name: savings_deposits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.savings_deposits_id_seq', 1, false);


--
-- Name: scheduled_cash_counts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scheduled_cash_counts_id_seq', 1, false);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sessions_id_seq', 1, false);


--
-- Name: store_credit_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_credit_transactions_id_seq', 1, false);


--
-- Name: supplier_payment_allocations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.supplier_payment_allocations_id_seq', 1, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 1, false);


--
-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_settings_id_seq', 16, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


--
-- Name: variant_attribute_values_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.variant_attribute_values_id_seq', 1, false);


--
-- Name: warranty_claims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_claims_id_seq', 1, false);


--
-- Name: warranty_economics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_economics_id_seq', 1, false);


--
-- Name: warranty_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_events_id_seq', 1, false);


--
-- Name: warranty_inspections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_inspections_id_seq', 1, false);


--
-- Name: warranty_policies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_policies_id_seq', 1, false);


--
-- Name: warranty_repairs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_repairs_id_seq', 1, false);


--
-- Name: warranty_rmas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_rmas_id_seq', 1, false);


--
-- Name: warranty_snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warranty_snapshots_id_seq', 1, false);


--
-- Name: accounts accounts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_key UNIQUE (code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_user_id_business_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_business_date_key UNIQUE (user_id, business_date);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliations bank_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: business_day_audit business_day_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_audit
    ADD CONSTRAINT business_day_audit_pkey PRIMARY KEY (id);


--
-- Name: business_day_sessions business_day_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions
    ADD CONSTRAINT business_day_sessions_pkey PRIMARY KEY (id);


--
-- Name: business_days business_days_business_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_business_date_key UNIQUE (business_date);


--
-- Name: business_days business_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_pkey PRIMARY KEY (id);


--
-- Name: business_funding_transactions business_funding_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_funding_transactions
    ADD CONSTRAINT business_funding_transactions_pkey PRIMARY KEY (id);


--
-- Name: cash_drawers cash_drawers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_drawers
    ADD CONSTRAINT cash_drawers_pkey PRIMARY KEY (id);


--
-- Name: cash_variance_reviews cash_variance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_variance_reviews
    ADD CONSTRAINT cash_variance_reviews_pkey PRIMARY KEY (id);


--
-- Name: cash_variance_reviews cash_variance_reviews_store_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_variance_reviews
    ADD CONSTRAINT cash_variance_reviews_store_session_id_key UNIQUE (store_session_id);


--
-- Name: customer_ledger customer_ledger_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger
    ADD CONSTRAINT customer_ledger_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: customer_ledger customer_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger
    ADD CONSTRAINT customer_ledger_pkey PRIMARY KEY (id);


--
-- Name: customer_master_audit customer_master_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_master_audit
    ADD CONSTRAINT customer_master_audit_pkey PRIMARY KEY (id);


--
-- Name: customer_payment_reminders customer_payment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payment_reminders
    ADD CONSTRAINT customer_payment_reminders_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: designations designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_pkey PRIMARY KEY (id);


--
-- Name: devices devices_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_device_id_key UNIQUE (device_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: document_counters document_counters_document_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_document_type_key UNIQUE (document_type);


--
-- Name: document_counters document_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_pkey PRIMARY KEY (id);


--
-- Name: drawer_sessions drawer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_pkey PRIMARY KEY (id);


--
-- Name: expense_categories expense_categories_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_normalized_name_key UNIQUE (normalized_name);


--
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);


--
-- Name: expense_change_audit expense_change_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_change_audit
    ADD CONSTRAINT expense_change_audit_pkey PRIMARY KEY (id);


--
-- Name: expense_change_audit expense_change_audit_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_change_audit
    ADD CONSTRAINT expense_change_audit_request_key_key UNIQUE (request_key);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_line_batches goods_receipt_line_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_batches
    ADD CONSTRAINT goods_receipt_line_batches_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_line_serials goods_receipt_line_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_serials
    ADD CONSTRAINT goods_receipt_line_serials_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_lines goods_receipt_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_lines
    ADD CONSTRAINT goods_receipt_lines_pkey PRIMARY KEY (id);


--
-- Name: goods_receipts goods_receipts_grn_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_grn_number_key UNIQUE (grn_number);


--
-- Name: goods_receipts goods_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (id);


--
-- Name: holidays holidays_holiday_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_holiday_date_key UNIQUE (holiday_date);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: inventory_balances inventory_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_variant_id_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_variant_id_batch_number_key UNIQUE (variant_id, batch_number);


--
-- Name: inventory_costs inventory_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_costs
    ADD CONSTRAINT inventory_costs_pkey PRIMARY KEY (variant_id);


--
-- Name: inventory_locations inventory_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_reservations inventory_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);


--
-- Name: inventory_serials inventory_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_pkey PRIMARY KEY (id);


--
-- Name: inventory_serials inventory_serials_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_serial_number_key UNIQUE (serial_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: loyalty_transactions loyalty_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);


--
-- Name: operations_decisions operations_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_pkey PRIMARY KEY (id);


--
-- Name: operations_decisions operations_decisions_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_request_key_key UNIQUE (request_key);


--
-- Name: operations_policies operations_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policies
    ADD CONSTRAINT operations_policies_pkey PRIMARY KEY (variant_id);


--
-- Name: operations_policy_audit operations_policy_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policy_audit
    ADD CONSTRAINT operations_policy_audit_pkey PRIMARY KEY (id);


--
-- Name: operations_snapshots operations_snapshots_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_snapshots
    ADD CONSTRAINT operations_snapshots_fingerprint_key UNIQUE (fingerprint);


--
-- Name: operations_snapshots operations_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_snapshots
    ADD CONSTRAINT operations_snapshots_pkey PRIMARY KEY (id);


--
-- Name: payment_settlements payment_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements
    ADD CONSTRAINT payment_settlements_pkey PRIMARY KEY (id);


--
-- Name: permission_audit permission_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_audit
    ADD CONSTRAINT permission_audit_pkey PRIMARY KEY (id);


--
-- Name: product_attribute_values product_attribute_values_attribute_id_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attribute_values
    ADD CONSTRAINT product_attribute_values_attribute_id_value_key UNIQUE (attribute_id, value);


--
-- Name: product_attribute_values product_attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attribute_values
    ADD CONSTRAINT product_attribute_values_pkey PRIMARY KEY (id);


--
-- Name: product_attributes product_attributes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_name_key UNIQUE (name);


--
-- Name: product_attributes product_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attributes
    ADD CONSTRAINT product_attributes_pkey PRIMARY KEY (id);


--
-- Name: product_barcodes product_barcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_name_key UNIQUE (name);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promotion_redemptions promotion_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_pkey PRIMARY KEY (id);


--
-- Name: promotion_targets promotion_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_pkey PRIMARY KEY (id);


--
-- Name: promotion_targets promotion_targets_promotion_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_promotion_id_target_type_target_id_key UNIQUE (promotion_id, target_type, target_id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_lines purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: purchase_return_line_serials purchase_return_line_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_line_serials
    ADD CONSTRAINT purchase_return_line_serials_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_line_serials purchase_return_line_serials_purchase_return_line_id_serial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_line_serials
    ADD CONSTRAINT purchase_return_line_serials_purchase_return_line_id_serial_key UNIQUE (purchase_return_line_id, serial_number);


--
-- Name: purchase_return_lines purchase_return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines
    ADD CONSTRAINT purchase_return_lines_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_return_number_key UNIQUE (return_number);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: retail_brands retail_brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_brands
    ADD CONSTRAINT retail_brands_name_key UNIQUE (name);


--
-- Name: retail_brands retail_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_brands
    ADD CONSTRAINT retail_brands_pkey PRIMARY KEY (id);


--
-- Name: retail_catalog_jobs retail_catalog_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_catalog_jobs
    ADD CONSTRAINT retail_catalog_jobs_pkey PRIMARY KEY (id);


--
-- Name: retail_credit_collection_allocations retail_credit_collection_alloc_collection_id_retail_sale_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collection_allocations
    ADD CONSTRAINT retail_credit_collection_alloc_collection_id_retail_sale_id_key UNIQUE (collection_id, retail_sale_id);


--
-- Name: retail_credit_collection_allocations retail_credit_collection_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collection_allocations
    ADD CONSTRAINT retail_credit_collection_allocations_pkey PRIMARY KEY (id);


--
-- Name: retail_credit_collections retail_credit_collections_collection_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_collection_number_key UNIQUE (collection_number);


--
-- Name: retail_credit_collections retail_credit_collections_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_external_ref_key UNIQUE (external_ref);


--
-- Name: retail_credit_collections retail_credit_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_pkey PRIMARY KEY (id);


--
-- Name: retail_credit_overrides retail_credit_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides
    ADD CONSTRAINT retail_credit_overrides_pkey PRIMARY KEY (id);


--
-- Name: retail_credit_overrides retail_credit_overrides_retail_sale_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides
    ADD CONSTRAINT retail_credit_overrides_retail_sale_id_key UNIQUE (retail_sale_id);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_external_ref_key UNIQUE (external_ref);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_pkey PRIMARY KEY (id);


--
-- Name: retail_customer_accounts retail_customer_accounts_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_accounts
    ADD CONSTRAINT retail_customer_accounts_customer_id_key UNIQUE (customer_id);


--
-- Name: retail_customer_accounts retail_customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_accounts
    ADD CONSTRAINT retail_customer_accounts_pkey PRIMARY KEY (id);


--
-- Name: retail_customer_accounts retail_customer_accounts_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_accounts
    ADD CONSTRAINT retail_customer_accounts_username_key UNIQUE (username);


--
-- Name: retail_customer_groups retail_customer_groups_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_groups
    ADD CONSTRAINT retail_customer_groups_code_key UNIQUE (code);


--
-- Name: retail_customer_groups retail_customer_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_groups
    ADD CONSTRAINT retail_customer_groups_name_key UNIQUE (name);


--
-- Name: retail_customer_groups retail_customer_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_groups
    ADD CONSTRAINT retail_customer_groups_pkey PRIMARY KEY (id);


--
-- Name: retail_customer_invites retail_customer_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_invites
    ADD CONSTRAINT retail_customer_invites_pkey PRIMARY KEY (id);


--
-- Name: retail_customer_invites retail_customer_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_invites
    ADD CONSTRAINT retail_customer_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: retail_customer_sessions retail_customer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_sessions
    ADD CONSTRAINT retail_customer_sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: retail_exchanges retail_exchanges_exchange_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges
    ADD CONSTRAINT retail_exchanges_exchange_number_key UNIQUE (exchange_number);


--
-- Name: retail_exchanges retail_exchanges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges
    ADD CONSTRAINT retail_exchanges_pkey PRIMARY KEY (id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_adjustment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_adjustment_number_key UNIQUE (adjustment_number);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_pkey PRIMARY KEY (id);


--
-- Name: retail_loyalty_settings_audit retail_loyalty_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_loyalty_settings_audit
    ADD CONSTRAINT retail_loyalty_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: retail_margin_policy retail_margin_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_margin_policy
    ADD CONSTRAINT retail_margin_policy_pkey PRIMARY KEY (id);


--
-- Name: retail_online_events retail_online_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_events
    ADD CONSTRAINT retail_online_events_pkey PRIMARY KEY (id);


--
-- Name: retail_online_order_lines retail_online_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_order_lines
    ADD CONSTRAINT retail_online_order_lines_pkey PRIMARY KEY (id);


--
-- Name: retail_online_orders retail_online_orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: retail_online_orders retail_online_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_order_number_key UNIQUE (order_number);


--
-- Name: retail_online_orders retail_online_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_pkey PRIMARY KEY (id);


--
-- Name: retail_online_settings retail_online_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_settings
    ADD CONSTRAINT retail_online_settings_pkey PRIMARY KEY (id);


--
-- Name: retail_price_audit retail_price_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_audit
    ADD CONSTRAINT retail_price_audit_pkey PRIMARY KEY (id);


--
-- Name: retail_price_list_items retail_price_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_list_items
    ADD CONSTRAINT retail_price_list_items_pkey PRIMARY KEY (id);


--
-- Name: retail_price_lists retail_price_lists_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_lists
    ADD CONSTRAINT retail_price_lists_code_key UNIQUE (code);


--
-- Name: retail_price_lists retail_price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_lists
    ADD CONSTRAINT retail_price_lists_pkey PRIMARY KEY (id);


--
-- Name: retail_product_media retail_product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_product_media
    ADD CONSTRAINT retail_product_media_pkey PRIMARY KEY (id);


--
-- Name: retail_public_limits retail_public_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_public_limits
    ADD CONSTRAINT retail_public_limits_pkey PRIMARY KEY (bucket);


--
-- Name: retail_return_line_batches retail_return_line_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_line_batches
    ADD CONSTRAINT retail_return_line_batches_pkey PRIMARY KEY (id);


--
-- Name: retail_return_lines retail_return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines
    ADD CONSTRAINT retail_return_lines_pkey PRIMARY KEY (id);


--
-- Name: retail_return_serial_events retail_return_serial_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_serial_events
    ADD CONSTRAINT retail_return_serial_events_pkey PRIMARY KEY (id);


--
-- Name: retail_return_serial_events retail_return_serial_events_return_line_id_serial_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_serial_events
    ADD CONSTRAINT retail_return_serial_events_return_line_id_serial_id_key UNIQUE (return_line_id, serial_id);


--
-- Name: retail_returns retail_returns_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: retail_returns retail_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_pkey PRIMARY KEY (id);


--
-- Name: retail_returns retail_returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_return_number_key UNIQUE (return_number);


--
-- Name: retail_sale_audit retail_sale_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_audit
    ADD CONSTRAINT retail_sale_audit_pkey PRIMARY KEY (id);


--
-- Name: retail_sale_line_batches retail_sale_line_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_line_batches
    ADD CONSTRAINT retail_sale_line_batches_pkey PRIMARY KEY (id);


--
-- Name: retail_sale_lines retail_sale_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_lines
    ADD CONSTRAINT retail_sale_lines_pkey PRIMARY KEY (id);


--
-- Name: retail_sale_payments retail_sale_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_payments
    ADD CONSTRAINT retail_sale_payments_pkey PRIMARY KEY (id);


--
-- Name: retail_sales retail_sales_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: retail_sales retail_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_pkey PRIMARY KEY (id);


--
-- Name: retail_sales retail_sales_sale_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_sale_number_key UNIQUE (sale_number);


--
-- Name: retail_stock_count_line_serials retail_stock_count_line_seria_retail_stock_count_line_id_se_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_line_serials
    ADD CONSTRAINT retail_stock_count_line_seria_retail_stock_count_line_id_se_key UNIQUE (retail_stock_count_line_id, serial_number);


--
-- Name: retail_stock_count_line_serials retail_stock_count_line_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_line_serials
    ADD CONSTRAINT retail_stock_count_line_serials_pkey PRIMARY KEY (id);


--
-- Name: retail_stock_count_lines retail_stock_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_lines
    ADD CONSTRAINT retail_stock_count_lines_pkey PRIMARY KEY (id);


--
-- Name: retail_stock_counts retail_stock_counts_count_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_count_number_key UNIQUE (count_number);


--
-- Name: retail_stock_counts retail_stock_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_pkey PRIMARY KEY (id);


--
-- Name: retail_supplier_skus retail_supplier_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_supplier_skus
    ADD CONSTRAINT retail_supplier_skus_pkey PRIMARY KEY (id);


--
-- Name: retail_supplier_skus retail_supplier_skus_variant_id_supplier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_supplier_skus
    ADD CONSTRAINT retail_supplier_skus_variant_id_supplier_id_key UNIQUE (variant_id, supplier_id);


--
-- Name: retail_transfer_line_serials retail_transfer_line_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_line_serials
    ADD CONSTRAINT retail_transfer_line_serials_pkey PRIMARY KEY (id);


--
-- Name: retail_transfer_line_serials retail_transfer_line_serials_retail_transfer_line_id_serial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_line_serials
    ADD CONSTRAINT retail_transfer_line_serials_retail_transfer_line_id_serial_key UNIQUE (retail_transfer_line_id, serial_number);


--
-- Name: retail_transfer_lines retail_transfer_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_lines
    ADD CONSTRAINT retail_transfer_lines_pkey PRIMARY KEY (id);


--
-- Name: retail_transfers retail_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_pkey PRIMARY KEY (id);


--
-- Name: retail_transfers retail_transfers_transfer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_transfer_number_key UNIQUE (transfer_number);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission_key);


--
-- Name: salary_advances salary_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_pkey PRIMARY KEY (id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: savings_deposits savings_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits
    ADD CONSTRAINT savings_deposits_pkey PRIMARY KEY (id);


--
-- Name: scheduled_cash_counts scheduled_cash_counts_count_date_cashier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_cash_counts
    ADD CONSTRAINT scheduled_cash_counts_count_date_cashier_id_key UNIQUE (count_date, cashier_id);


--
-- Name: scheduled_cash_counts scheduled_cash_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_cash_counts
    ADD CONSTRAINT scheduled_cash_counts_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: site_content site_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_content
    ADD CONSTRAINT site_content_pkey PRIMARY KEY (content_key);


--
-- Name: store_credit_transactions store_credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credit_transactions
    ADD CONSTRAINT store_credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_payment_journal_id_charge_jour_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_payment_journal_id_charge_jour_key UNIQUE (payment_journal_id, charge_journal_id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: variant_attribute_values variant_attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_pkey PRIMARY KEY (id);


--
-- Name: variant_attribute_values variant_attribute_values_variant_id_attribute_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_variant_id_attribute_id_key UNIQUE (variant_id, attribute_id);


--
-- Name: warranty_claims warranty_claims_claim_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_claim_number_key UNIQUE (claim_number);


--
-- Name: warranty_claims warranty_claims_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: warranty_claims warranty_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_pkey PRIMARY KEY (id);


--
-- Name: warranty_economics warranty_economics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_economics
    ADD CONSTRAINT warranty_economics_pkey PRIMARY KEY (id);


--
-- Name: warranty_events warranty_events_claim_id_request_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_events
    ADD CONSTRAINT warranty_events_claim_id_request_key_key UNIQUE (claim_id, request_key);


--
-- Name: warranty_events warranty_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_events
    ADD CONSTRAINT warranty_events_pkey PRIMARY KEY (id);


--
-- Name: warranty_inspections warranty_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_inspections
    ADD CONSTRAINT warranty_inspections_pkey PRIMARY KEY (id);


--
-- Name: warranty_policies warranty_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies
    ADD CONSTRAINT warranty_policies_pkey PRIMARY KEY (id);


--
-- Name: warranty_repairs warranty_repairs_claim_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_repairs
    ADD CONSTRAINT warranty_repairs_claim_id_key UNIQUE (claim_id);


--
-- Name: warranty_repairs warranty_repairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_repairs
    ADD CONSTRAINT warranty_repairs_pkey PRIMARY KEY (id);


--
-- Name: warranty_rmas warranty_rmas_claim_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_claim_id_key UNIQUE (claim_id);


--
-- Name: warranty_rmas warranty_rmas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_pkey PRIMARY KEY (id);


--
-- Name: warranty_rmas warranty_rmas_rma_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_rma_number_key UNIQUE (rma_number);


--
-- Name: warranty_snapshots warranty_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_pkey PRIMARY KEY (id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (business_date, user_id);


--
-- Name: idx_bank_recon_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_recon_account ON public.bank_reconciliations USING btree (bank_account_id, statement_date DESC);


--
-- Name: idx_business_day_audit_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_day_audit_day ON public.business_day_audit USING btree (business_day_id, created_at, id);


--
-- Name: idx_business_day_sessions_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_day_sessions_day ON public.business_day_sessions USING btree (business_day_id, session_number);


--
-- Name: idx_business_day_sessions_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_business_day_sessions_one_open ON public.business_day_sessions USING btree (business_day_id, status) WHERE (status = 'open'::text);


--
-- Name: idx_business_days_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_days_date ON public.business_days USING btree (business_date DESC);


--
-- Name: idx_business_days_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_business_days_one_open ON public.business_days USING btree (status) WHERE (status = 'open'::text);


--
-- Name: idx_business_funding_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_funding_transactions_date ON public.business_funding_transactions USING btree (transaction_date, id);


--
-- Name: idx_commerce_batch_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_batch_number ON public.inventory_batches USING btree (batch_number);


--
-- Name: idx_commerce_held_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_held_owner ON public.retail_sales USING btree (cashier_id, status, held_at DESC, id DESC);


--
-- Name: idx_commerce_payment_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_payment_reference ON public.retail_sale_payments USING btree (reference);


--
-- Name: idx_commerce_product_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_product_barcode ON public.products USING btree (barcode);


--
-- Name: idx_commerce_sales_completed_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_sales_completed_id ON public.retail_sales USING btree (completed_at DESC, id DESC);


--
-- Name: idx_commerce_serial_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_serial_available ON public.inventory_serials USING btree (variant_id, location_id, status, serial_number);


--
-- Name: idx_commerce_variant_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_variant_barcode ON public.product_variants USING btree (barcode);


--
-- Name: idx_commerce_variant_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_variant_sku ON public.product_variants USING btree (sku);


--
-- Name: idx_customer_ledger_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ledger_business_day ON public.customer_ledger USING btree (business_day_id, entry_type);


--
-- Name: idx_customer_ledger_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ledger_customer ON public.customer_ledger USING btree (customer_id, created_at, id);


--
-- Name: idx_customer_master_audit_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_master_audit_customer ON public.customer_master_audit USING btree (customer_id, created_at, id);


--
-- Name: idx_customer_master_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_master_audit_time ON public.customer_master_audit USING btree (created_at, id);


--
-- Name: idx_customer_payment_reminders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_payment_reminders_customer ON public.customer_payment_reminders USING btree (customer_id, created_at);


--
-- Name: idx_customer_sessions_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_sessions_expiry ON public.retail_customer_sessions USING btree (expires_at);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_customers_phone_digits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone_digits ON public.customers USING btree (phone_digits);


--
-- Name: idx_designations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_designations_department ON public.designations USING btree (department_id);


--
-- Name: idx_drawer_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_drawer_one_open ON public.drawer_sessions USING btree (drawer_id) WHERE (status = 'open'::text);


--
-- Name: idx_drawer_sessions_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drawer_sessions_business_day ON public.drawer_sessions USING btree (business_day_id, status);


--
-- Name: idx_drawer_sessions_drawer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drawer_sessions_drawer ON public.drawer_sessions USING btree (drawer_id, status);


--
-- Name: idx_expense_change_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_change_audit_time ON public.expense_change_audit USING btree (created_at, id);


--
-- Name: idx_expenses_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_business_day ON public.expenses USING btree (business_day_id);


--
-- Name: idx_expenses_category_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category_created ON public.expenses USING btree (category, created_at DESC);


--
-- Name: idx_expenses_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_created ON public.expenses USING btree (created_at DESC);


--
-- Name: idx_expenses_expense_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_expense_date ON public.expenses USING btree (expense_date);


--
-- Name: idx_expenses_purchase_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_purchase_date ON public.expenses USING btree (purchase_date);


--
-- Name: idx_expenses_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_source ON public.expenses USING btree (source_type, source_id);


--
-- Name: idx_expenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);


--
-- Name: idx_goods_receipt_line_serials_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipt_line_serials_line ON public.goods_receipt_line_serials USING btree (goods_receipt_line_id);


--
-- Name: idx_goods_receipt_lines_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipt_lines_grn ON public.goods_receipt_lines USING btree (goods_receipt_id);


--
-- Name: idx_goods_receipt_lines_po_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipt_lines_po_line ON public.goods_receipt_lines USING btree (purchase_order_line_id);


--
-- Name: idx_goods_receipt_lines_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipt_lines_variant ON public.goods_receipt_lines USING btree (variant_id);


--
-- Name: idx_goods_receipts_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipts_po ON public.goods_receipts USING btree (purchase_order_id);


--
-- Name: idx_goods_receipts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipts_status ON public.goods_receipts USING btree (status);


--
-- Name: idx_goods_receipts_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipts_supplier ON public.goods_receipts USING btree (supplier_id);


--
-- Name: idx_goods_receipts_supplier_invoice_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_goods_receipts_supplier_invoice_unique ON public.goods_receipts USING btree (supplier_id, invoice_number) WHERE ((invoice_number IS NOT NULL) AND (invoice_number <> ''::text) AND (status <> 'VOIDED'::text));


--
-- Name: idx_grn_line_batches_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_line_batches_line ON public.goods_receipt_line_batches USING btree (goods_receipt_line_id);


--
-- Name: idx_inventory_balances_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_balances_location ON public.inventory_balances USING btree (location_id);


--
-- Name: idx_inventory_balances_no_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_balances_no_batch ON public.inventory_balances USING btree (variant_id, location_id) WHERE (batch_id IS NULL);


--
-- Name: idx_inventory_balances_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_balances_variant ON public.inventory_balances USING btree (variant_id);


--
-- Name: idx_inventory_balances_with_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_balances_with_batch ON public.inventory_balances USING btree (variant_id, location_id, batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: idx_inventory_batches_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_expiry ON public.inventory_batches USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--
-- Name: idx_inventory_batches_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_variant ON public.inventory_batches USING btree (variant_id);


--
-- Name: idx_inventory_locations_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_locations_code_unique ON public.inventory_locations USING btree (code) WHERE ((code IS NOT NULL) AND (code <> ''::text));


--
-- Name: idx_inventory_locations_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_locations_one_default ON public.inventory_locations USING btree ((1)) WHERE (is_default = 1);


--
-- Name: idx_inventory_movements_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_batch ON public.inventory_movements USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: idx_inventory_movements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_created ON public.inventory_movements USING btree (created_at DESC);


--
-- Name: idx_inventory_movements_dedupe_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_movements_dedupe_batch ON public.inventory_movements USING btree (variant_id, location_id, batch_id, movement_type, reference_type, reference_id) WHERE ((batch_id IS NOT NULL) AND (reference_type IS NOT NULL) AND (reference_id IS NOT NULL));


--
-- Name: idx_inventory_movements_dedupe_nobatch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_movements_dedupe_nobatch ON public.inventory_movements USING btree (variant_id, location_id, movement_type, reference_type, reference_id) WHERE ((batch_id IS NULL) AND (reference_type IS NOT NULL) AND (reference_id IS NOT NULL));


--
-- Name: idx_inventory_movements_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_location ON public.inventory_movements USING btree (location_id);


--
-- Name: idx_inventory_movements_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_reference ON public.inventory_movements USING btree (reference_type, reference_id);


--
-- Name: idx_inventory_movements_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_type ON public.inventory_movements USING btree (movement_type);


--
-- Name: idx_inventory_movements_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_variant ON public.inventory_movements USING btree (variant_id);


--
-- Name: idx_inventory_reservations_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_reservations_source ON public.inventory_reservations USING btree (source_type, source_id);


--
-- Name: idx_inventory_reservations_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_reservations_variant ON public.inventory_reservations USING btree (variant_id, location_id, status);


--
-- Name: idx_inventory_serials_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_serials_status ON public.inventory_serials USING btree (status);


--
-- Name: idx_inventory_serials_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_serials_variant ON public.inventory_serials USING btree (variant_id);


--
-- Name: idx_journal_entries_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_business_day ON public.journal_entries USING btree (business_day_id, source_type);


--
-- Name: idx_journal_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_date ON public.journal_entries USING btree (entry_date DESC);


--
-- Name: idx_journal_external_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_journal_external_ref ON public.journal_entries USING btree (external_ref) WHERE (external_ref IS NOT NULL);


--
-- Name: idx_journal_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_account ON public.journal_lines USING btree (account_id);


--
-- Name: idx_journal_lines_bank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_bank ON public.journal_lines USING btree (bank_account_id) WHERE (bank_account_id IS NOT NULL);


--
-- Name: idx_journal_lines_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_customer ON public.journal_lines USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: idx_journal_lines_drawer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_drawer ON public.journal_lines USING btree (drawer_id) WHERE (drawer_id IS NOT NULL);


--
-- Name: idx_journal_lines_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_journal ON public.journal_lines USING btree (journal_id);


--
-- Name: idx_journal_lines_reconciliation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_reconciliation ON public.journal_lines USING btree (reconciliation_id);


--
-- Name: idx_journal_lines_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_supplier ON public.journal_lines USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_journal_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_journal_source ON public.journal_entries USING btree (source_type, source_id) WHERE ((source_type IS NOT NULL) AND (source_id IS NOT NULL));


--
-- Name: idx_loyalty_transactions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_transactions_customer ON public.loyalty_transactions USING btree (customer_id);


--
-- Name: idx_loyalty_transactions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_transactions_source ON public.loyalty_transactions USING btree (source_type, source_id);


--
-- Name: idx_online_events_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_events_order ON public.retail_online_events USING btree (order_id, id);


--
-- Name: idx_online_order_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_order_owner ON public.retail_online_orders USING btree (owner_hash, id);


--
-- Name: idx_online_order_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_online_order_queue ON public.retail_online_orders USING btree (status, id DESC);


--
-- Name: idx_online_order_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_online_order_sale ON public.retail_online_orders USING btree (retail_sale_id) WHERE (retail_sale_id IS NOT NULL);


--
-- Name: idx_permission_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permission_audit_created ON public.permission_audit USING btree (created_at DESC, id DESC);


--
-- Name: idx_price_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_items_product ON public.retail_price_list_items USING btree (product_id, price_list_id);


--
-- Name: idx_price_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_items_variant ON public.retail_price_list_items USING btree (variant_id, price_list_id);


--
-- Name: idx_product_barcodes_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_barcodes_code_unique ON public.product_barcodes USING btree (barcode);


--
-- Name: idx_product_barcodes_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_barcodes_product ON public.product_barcodes USING btree (product_id);


--
-- Name: idx_product_barcodes_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_barcodes_variant ON public.product_barcodes USING btree (variant_id);


--
-- Name: idx_product_online_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_online_slug ON public.products USING btree (online_slug) WHERE (online_slug IS NOT NULL);


--
-- Name: idx_product_variants_sku_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_variants_sku_unique ON public.product_variants USING btree (sku) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));


--
-- Name: idx_products_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_available ON public.products USING btree (is_available);


--
-- Name: idx_products_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_brand ON public.products USING btree (brand) WHERE (brand IS NOT NULL);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_sku_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_products_sku_unique ON public.products USING btree (sku) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));


--
-- Name: idx_promotion_redemptions_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_redemptions_promotion ON public.promotion_redemptions USING btree (promotion_id, created_at);


--
-- Name: idx_promotions_active_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_active_schedule ON public.promotions USING btree (is_active, starts_at, ends_at);


--
-- Name: idx_promotions_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_promotions_code_unique ON public.promotions USING btree (upper(code)) WHERE ((code IS NOT NULL) AND (code <> ''::text));


--
-- Name: idx_public_attribute_filter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_attribute_filter ON public.variant_attribute_values USING btree (attribute_value_id, variant_id);


--
-- Name: idx_public_default_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_default_variant ON public.product_variants USING btree (product_id, is_default DESC, id) WHERE (merchandising_active = 1);


--
-- Name: idx_public_online_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_online_category ON public.products USING btree (COALESCE(online_category_id, category_id), featured DESC, online_sort, id DESC) WHERE ((online_enabled = 1) AND (is_available = 1));


--
-- Name: idx_public_product_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_product_order ON public.products USING btree (featured DESC, online_sort, id DESC) WHERE ((online_enabled = 1) AND (is_available = 1));


--
-- Name: idx_public_product_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_product_search ON public.products USING gin (to_tsvector('simple'::regconfig, ((((COALESCE(online_title, name) || ' '::text) || COALESCE(brand, ''::text)) || ' '::text) || COALESCE(online_summary, ''::text)))) WHERE ((online_enabled = 1) AND (is_available = 1));


--
-- Name: idx_public_variant_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_variant_search ON public.product_variants USING gin (to_tsvector('simple'::regconfig, COALESCE(variant_name, ''::text))) WHERE (merchandising_active = 1);


--
-- Name: idx_purchase_order_lines_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_lines_po ON public.purchase_order_lines USING btree (purchase_order_id);


--
-- Name: idx_purchase_order_lines_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_lines_variant ON public.purchase_order_lines USING btree (variant_id);


--
-- Name: idx_purchase_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_purchase_orders_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_purchase_return_line_serials_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_line_serials_line ON public.purchase_return_line_serials USING btree (purchase_return_line_id);


--
-- Name: idx_purchase_return_lines_grn_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_lines_grn_line ON public.purchase_return_lines USING btree (goods_receipt_line_id);


--
-- Name: idx_purchase_return_lines_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_lines_return ON public.purchase_return_lines USING btree (purchase_return_id);


--
-- Name: idx_purchase_returns_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_returns_grn ON public.purchase_returns USING btree (goods_receipt_id);


--
-- Name: idx_purchase_returns_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_returns_supplier ON public.purchase_returns USING btree (supplier_id);


--
-- Name: idx_rate_limits_key_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_key_created ON public.rate_limits USING btree (rate_key, created_at);


--
-- Name: idx_reservation_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservation_expiry ON public.inventory_reservations USING btree (expires_at) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_retail_credit_collection_allocations_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_credit_collection_allocations_sale ON public.retail_credit_collection_allocations USING btree (retail_sale_id);


--
-- Name: idx_retail_credit_collections_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_credit_collections_customer ON public.retail_credit_collections USING btree (customer_id, id DESC);


--
-- Name: idx_retail_credit_overrides_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_credit_overrides_customer ON public.retail_credit_overrides USING btree (customer_id, approved_at DESC);


--
-- Name: idx_retail_credit_writeoffs_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_credit_writeoffs_sale ON public.retail_credit_writeoffs USING btree (retail_sale_id);


--
-- Name: idx_retail_exchanges_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_exchanges_return ON public.retail_exchanges USING btree (return_id);


--
-- Name: idx_retail_exchanges_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_exchanges_sale ON public.retail_exchanges USING btree (new_sale_id);


--
-- Name: idx_retail_inventory_adjustments_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_inventory_adjustments_type ON public.retail_inventory_adjustments USING btree (type);


--
-- Name: idx_retail_inventory_adjustments_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_inventory_adjustments_variant ON public.retail_inventory_adjustments USING btree (variant_id);


--
-- Name: idx_retail_online_order_lines_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_online_order_lines_order ON public.retail_online_order_lines USING btree (retail_online_order_id);


--
-- Name: idx_retail_online_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_online_orders_customer ON public.retail_online_orders USING btree (customer_id);


--
-- Name: idx_retail_online_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_online_orders_status ON public.retail_online_orders USING btree (status);


--
-- Name: idx_retail_public_media; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_public_media ON public.retail_product_media USING btree (product_id, is_primary DESC, display_order, id);


--
-- Name: idx_retail_return_line_batches_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_return_line_batches_line ON public.retail_return_line_batches USING btree (retail_return_line_id);


--
-- Name: idx_retail_return_lines_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_return_lines_return ON public.retail_return_lines USING btree (retail_return_id);


--
-- Name: idx_retail_return_lines_sale_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_return_lines_sale_line ON public.retail_return_lines USING btree (original_sale_line_id);


--
-- Name: idx_retail_returns_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_returns_sale ON public.retail_returns USING btree (original_sale_id);


--
-- Name: idx_retail_returns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_returns_status ON public.retail_returns USING btree (status);


--
-- Name: idx_retail_sale_audit_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sale_audit_sale ON public.retail_sale_audit USING btree (retail_sale_id, id DESC);


--
-- Name: idx_retail_sale_line_batches_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sale_line_batches_line ON public.retail_sale_line_batches USING btree (retail_sale_line_id);


--
-- Name: idx_retail_sale_lines_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sale_lines_sale ON public.retail_sale_lines USING btree (retail_sale_id);


--
-- Name: idx_retail_sale_lines_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sale_lines_variant ON public.retail_sale_lines USING btree (variant_id);


--
-- Name: idx_retail_sale_payments_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sale_payments_sale ON public.retail_sale_payments USING btree (retail_sale_id);


--
-- Name: idx_retail_sales_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_business_day ON public.retail_sales USING btree (business_day_id);


--
-- Name: idx_retail_sales_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_cashier ON public.retail_sales USING btree (cashier_id);


--
-- Name: idx_retail_sales_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_completed_at ON public.retail_sales USING btree (completed_at DESC, id DESC) WHERE (completed_at IS NOT NULL);


--
-- Name: idx_retail_sales_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_customer ON public.retail_sales USING btree (customer_id);


--
-- Name: idx_retail_sales_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_history ON public.retail_sales USING btree (completed_at DESC, id DESC) WHERE (status <> 'HELD'::text);


--
-- Name: idx_retail_sales_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_sales_status ON public.retail_sales USING btree (status);


--
-- Name: idx_retail_stock_count_lines_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_stock_count_lines_count ON public.retail_stock_count_lines USING btree (retail_stock_count_id);


--
-- Name: idx_retail_stock_counts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_stock_counts_status ON public.retail_stock_counts USING btree (status);


--
-- Name: idx_retail_transfer_lines_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_transfer_lines_transfer ON public.retail_transfer_lines USING btree (retail_transfer_id);


--
-- Name: idx_retail_transfers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retail_transfers_status ON public.retail_transfers USING btree (status);


--
-- Name: idx_salary_advances_business_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_advances_business_day ON public.salary_advances USING btree (business_day_id);


--
-- Name: idx_salary_advances_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_advances_employee_date ON public.salary_advances USING btree (employee_id, advanced_on DESC, id DESC);


--
-- Name: idx_salary_payments_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_payments_employee ON public.salary_payments USING btree (employee_id);


--
-- Name: idx_salary_payments_paid_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_payments_paid_on ON public.salary_payments USING btree (paid_on DESC);


--
-- Name: idx_savings_deposits_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_savings_deposits_date ON public.savings_deposits USING btree (deposit_date DESC);


--
-- Name: idx_savings_deposits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_savings_deposits_status ON public.savings_deposits USING btree (status);


--
-- Name: idx_scheduled_cash_counts_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_cash_counts_cashier ON public.scheduled_cash_counts USING btree (cashier_id, count_date DESC);


--
-- Name: idx_scheduled_cash_counts_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_cash_counts_date ON public.scheduled_cash_counts USING btree (count_date DESC, submitted_at DESC);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_token ON public.sessions USING btree (token);


--
-- Name: idx_sessions_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);


--
-- Name: idx_stock_count_line_serials_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_count_line_serials_line ON public.retail_stock_count_line_serials USING btree (retail_stock_count_line_id);


--
-- Name: idx_store_credit_transactions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_credit_transactions_customer ON public.store_credit_transactions USING btree (customer_id);


--
-- Name: idx_store_credit_transactions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_credit_transactions_source ON public.store_credit_transactions USING btree (source_type, source_id);


--
-- Name: idx_supplier_payment_allocations_charge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payment_allocations_charge ON public.supplier_payment_allocations USING btree (charge_journal_id);


--
-- Name: idx_supplier_payment_allocations_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payment_allocations_supplier ON public.supplier_payment_allocations USING btree (supplier_id);


--
-- Name: idx_suppliers_is_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_is_archived ON public.suppliers USING btree (is_archived);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_suppliers_normalized_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_suppliers_normalized_name ON public.suppliers USING btree (normalized_name);


--
-- Name: idx_transfer_line_serials_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_line_serials_line ON public.retail_transfer_line_serials USING btree (retail_transfer_line_id);


--
-- Name: idx_variant_attribute_values_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variant_attribute_values_variant ON public.variant_attribute_values USING btree (variant_id);


--
-- Name: idx_variant_merchandising_signature; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_variant_merchandising_signature ON public.product_variants USING btree (product_id, merchandising_signature) WHERE (merchandising_signature IS NOT NULL);


--
-- Name: operations_snapshot_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operations_snapshot_variant ON public.operations_snapshots USING btree (variant_id, generated_at);


--
-- Name: phase2d_demand_lines; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phase2d_demand_lines ON public.retail_sale_lines USING btree (variant_id, retail_sale_id);


--
-- Name: phase2d_demand_sales; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phase2d_demand_sales ON public.retail_sales USING btree (completed_at, id) WHERE (status = 'COMPLETED'::text);


--
-- Name: phase2d_stock_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phase2d_stock_history ON public.inventory_movements USING btree (variant_id, created_at);


--
-- Name: product_variants_barcode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_variants_barcode_key ON public.product_variants USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: products_barcode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_barcode_key ON public.products USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: uq_store_credit_adjustment_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_store_credit_adjustment_key ON public.store_credit_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: warranty_claim_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_customer ON public.warranty_claims USING btree (customer_id, id);


--
-- Name: warranty_claim_open_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_claim_open_serial ON public.warranty_claims USING btree (serial_number) WHERE ((serial_number <> ''::text) AND (status <> ALL (ARRAY['CLOSED'::text, 'CANCELLED'::text])));


--
-- Name: warranty_claim_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_sale ON public.warranty_claims USING btree (sale_line_id);


--
-- Name: warranty_claim_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_worklist ON public.warranty_claims USING btree (status, created_at);


--
-- Name: warranty_one_replacement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_one_replacement ON public.warranty_economics USING btree (claim_id) WHERE (kind = 'REPLACEMENT'::text);


--
-- Name: warranty_policy_active_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_policy_active_scope ON public.warranty_policies USING btree (scope, scope_key) WHERE (active = 1);


--
-- Name: warranty_snapshot_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_snapshot_customer ON public.warranty_snapshots USING btree (customer_id, id);


--
-- Name: warranty_snapshot_original; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_snapshot_original ON public.warranty_snapshots USING btree (sale_line_id, serial_number) WHERE (origin_claim_id IS NULL);


--
-- Name: warranty_snapshot_replacement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_snapshot_replacement ON public.warranty_snapshots USING btree (origin_claim_id) WHERE (origin_claim_id IS NOT NULL);


--
-- Name: warranty_snapshot_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_snapshot_serial ON public.warranty_snapshots USING btree (serial_number);


--
-- Name: accounts accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: bank_reconciliations bank_reconciliations_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_reconciliations bank_reconciliations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_day_audit business_day_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_audit
    ADD CONSTRAINT business_day_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_day_audit business_day_audit_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_audit
    ADD CONSTRAINT business_day_audit_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: business_day_sessions business_day_sessions_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions
    ADD CONSTRAINT business_day_sessions_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: business_day_sessions business_day_sessions_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions
    ADD CONSTRAINT business_day_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_day_sessions business_day_sessions_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions
    ADD CONSTRAINT business_day_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_day_sessions business_day_sessions_opening_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_day_sessions
    ADD CONSTRAINT business_day_sessions_opening_journal_id_fkey FOREIGN KEY (opening_journal_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: business_days business_days_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_days business_days_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_days business_days_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_funding_transactions business_funding_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_funding_transactions
    ADD CONSTRAINT business_funding_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: business_funding_transactions business_funding_transactions_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_funding_transactions
    ADD CONSTRAINT business_funding_transactions_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: cash_variance_reviews cash_variance_reviews_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_variance_reviews
    ADD CONSTRAINT cash_variance_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: cash_variance_reviews cash_variance_reviews_store_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_variance_reviews
    ADD CONSTRAINT cash_variance_reviews_store_session_id_fkey FOREIGN KEY (store_session_id) REFERENCES public.business_day_sessions(id);


--
-- Name: customer_ledger customer_ledger_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger
    ADD CONSTRAINT customer_ledger_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: customer_ledger customer_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger
    ADD CONSTRAINT customer_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customer_ledger customer_ledger_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ledger
    ADD CONSTRAINT customer_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: customer_master_audit customer_master_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_master_audit
    ADD CONSTRAINT customer_master_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customer_payment_reminders customer_payment_reminders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payment_reminders
    ADD CONSTRAINT customer_payment_reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: customer_payment_reminders customer_payment_reminders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payment_reminders
    ADD CONSTRAINT customer_payment_reminders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customers customers_commercial_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_commercial_group_id_fkey FOREIGN KEY (commercial_group_id) REFERENCES public.retail_customer_groups(id);


--
-- Name: designations designations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: devices devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: drawer_sessions drawer_sessions_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: drawer_sessions drawer_sessions_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: drawer_sessions drawer_sessions_drawer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_drawer_id_fkey FOREIGN KEY (drawer_id) REFERENCES public.cash_drawers(id) ON DELETE CASCADE;


--
-- Name: drawer_sessions drawer_sessions_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: expense_change_audit expense_change_audit_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_change_audit
    ADD CONSTRAINT expense_change_audit_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: expenses expenses_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: expenses expenses_logged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: goods_receipt_line_batches goods_receipt_line_batches_goods_receipt_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_batches
    ADD CONSTRAINT goods_receipt_line_batches_goods_receipt_line_id_fkey FOREIGN KEY (goods_receipt_line_id) REFERENCES public.goods_receipt_lines(id) ON DELETE CASCADE;


--
-- Name: goods_receipt_line_serials goods_receipt_line_serials_goods_receipt_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_line_serials
    ADD CONSTRAINT goods_receipt_line_serials_goods_receipt_line_id_fkey FOREIGN KEY (goods_receipt_line_id) REFERENCES public.goods_receipt_lines(id) ON DELETE CASCADE;


--
-- Name: goods_receipt_lines goods_receipt_lines_goods_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_lines
    ADD CONSTRAINT goods_receipt_lines_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE;


--
-- Name: goods_receipt_lines goods_receipt_lines_purchase_order_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_lines
    ADD CONSTRAINT goods_receipt_lines_purchase_order_line_id_fkey FOREIGN KEY (purchase_order_line_id) REFERENCES public.purchase_order_lines(id);


--
-- Name: goods_receipt_lines goods_receipt_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_lines
    ADD CONSTRAINT goods_receipt_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: goods_receipts goods_receipts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: goods_receipts goods_receipts_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: goods_receipts goods_receipts_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: goods_receipts goods_receipts_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: holidays holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_balances inventory_balances_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;


--
-- Name: inventory_balances inventory_balances_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_batches inventory_batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: inventory_batches inventory_batches_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_costs inventory_costs_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_costs
    ADD CONSTRAINT inventory_costs_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_movements inventory_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements inventory_movements_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements inventory_movements_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_reservations inventory_reservations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: inventory_reservations inventory_reservations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: inventory_reservations inventory_reservations_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: inventory_serials inventory_serials_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: inventory_serials inventory_serials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: inventory_serials inventory_serials_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: journal_entries journal_entries_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: journal_lines journal_lines_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_drawer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_drawer_id_fkey FOREIGN KEY (drawer_id) REFERENCES public.cash_drawers(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_reconciliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_reconciliation_id_fkey FOREIGN KEY (reconciliation_id) REFERENCES public.bank_reconciliations(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: loyalty_transactions loyalty_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: loyalty_transactions loyalty_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: operations_decisions operations_decisions_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: operations_decisions operations_decisions_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


--
-- Name: operations_decisions operations_decisions_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.operations_snapshots(id);


--
-- Name: operations_decisions operations_decisions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_decisions
    ADD CONSTRAINT operations_decisions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: operations_policies operations_policies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policies
    ADD CONSTRAINT operations_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: operations_policies operations_policies_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policies
    ADD CONSTRAINT operations_policies_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: operations_policy_audit operations_policy_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policy_audit
    ADD CONSTRAINT operations_policy_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: operations_policy_audit operations_policy_audit_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_policy_audit
    ADD CONSTRAINT operations_policy_audit_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: operations_snapshots operations_snapshots_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_snapshots
    ADD CONSTRAINT operations_snapshots_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: payment_settlements payment_settlements_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements
    ADD CONSTRAINT payment_settlements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: payment_settlements payment_settlements_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements
    ADD CONSTRAINT payment_settlements_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: payment_settlements payment_settlements_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements
    ADD CONSTRAINT payment_settlements_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: payment_settlements payment_settlements_settled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settlements
    ADD CONSTRAINT payment_settlements_settled_by_fkey FOREIGN KEY (settled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: permission_audit permission_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_audit
    ADD CONSTRAINT permission_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_attribute_values product_attribute_values_attribute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attribute_values
    ADD CONSTRAINT product_attribute_values_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.product_attributes(id) ON DELETE CASCADE;


--
-- Name: product_barcodes product_barcodes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_barcodes product_barcodes_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id);


--
-- Name: products products_online_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_online_category_id_fkey FOREIGN KEY (online_category_id) REFERENCES public.product_categories(id);


--
-- Name: promotion_redemptions promotion_redemptions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE RESTRICT;


--
-- Name: promotion_targets promotion_targets_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: purchase_order_lines purchase_order_lines_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_order_lines purchase_order_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: purchase_orders purchase_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: purchase_orders purchase_orders_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: purchase_return_line_serials purchase_return_line_serials_purchase_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_line_serials
    ADD CONSTRAINT purchase_return_line_serials_purchase_return_line_id_fkey FOREIGN KEY (purchase_return_line_id) REFERENCES public.purchase_return_lines(id) ON DELETE CASCADE;


--
-- Name: purchase_return_lines purchase_return_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines
    ADD CONSTRAINT purchase_return_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: purchase_return_lines purchase_return_lines_goods_receipt_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines
    ADD CONSTRAINT purchase_return_lines_goods_receipt_line_id_fkey FOREIGN KEY (goods_receipt_line_id) REFERENCES public.goods_receipt_lines(id);


--
-- Name: purchase_return_lines purchase_return_lines_purchase_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines
    ADD CONSTRAINT purchase_return_lines_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;


--
-- Name: purchase_return_lines purchase_return_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_lines
    ADD CONSTRAINT purchase_return_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: purchase_returns purchase_returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: purchase_returns purchase_returns_goods_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id);


--
-- Name: purchase_returns purchase_returns_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: purchase_returns purchase_returns_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: retail_catalog_jobs retail_catalog_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_catalog_jobs
    ADD CONSTRAINT retail_catalog_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_credit_collection_allocations retail_credit_collection_allocations_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collection_allocations
    ADD CONSTRAINT retail_credit_collection_allocations_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.retail_credit_collections(id) ON DELETE CASCADE;


--
-- Name: retail_credit_collection_allocations retail_credit_collection_allocations_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collection_allocations
    ADD CONSTRAINT retail_credit_collection_allocations_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_credit_collections retail_credit_collections_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id);


--
-- Name: retail_credit_collections retail_credit_collections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_credit_collections retail_credit_collections_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_credit_collections retail_credit_collections_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_collections
    ADD CONSTRAINT retail_credit_collections_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id);


--
-- Name: retail_credit_overrides retail_credit_overrides_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides
    ADD CONSTRAINT retail_credit_overrides_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: retail_credit_overrides retail_credit_overrides_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides
    ADD CONSTRAINT retail_credit_overrides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_credit_overrides retail_credit_overrides_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_overrides
    ADD CONSTRAINT retail_credit_overrides_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id);


--
-- Name: retail_credit_writeoffs retail_credit_writeoffs_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_credit_writeoffs
    ADD CONSTRAINT retail_credit_writeoffs_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_customer_accounts retail_customer_accounts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_accounts
    ADD CONSTRAINT retail_customer_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_customer_invites retail_customer_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_invites
    ADD CONSTRAINT retail_customer_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_customer_invites retail_customer_invites_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_invites
    ADD CONSTRAINT retail_customer_invites_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_customer_sessions retail_customer_sessions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_customer_sessions
    ADD CONSTRAINT retail_customer_sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.retail_customer_accounts(id);


--
-- Name: retail_exchanges retail_exchanges_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges
    ADD CONSTRAINT retail_exchanges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_exchanges retail_exchanges_new_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges
    ADD CONSTRAINT retail_exchanges_new_sale_id_fkey FOREIGN KEY (new_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_exchanges retail_exchanges_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_exchanges
    ADD CONSTRAINT retail_exchanges_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.retail_returns(id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_destination_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_destination_location_id_fkey FOREIGN KEY (destination_location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_inventory_adjustments retail_inventory_adjustments_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_inventory_adjustments
    ADD CONSTRAINT retail_inventory_adjustments_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_loyalty_settings_audit retail_loyalty_settings_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_loyalty_settings_audit
    ADD CONSTRAINT retail_loyalty_settings_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: retail_online_events retail_online_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_events
    ADD CONSTRAINT retail_online_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: retail_online_events retail_online_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_events
    ADD CONSTRAINT retail_online_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.retail_online_orders(id);


--
-- Name: retail_online_order_lines retail_online_order_lines_retail_online_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_order_lines
    ADD CONSTRAINT retail_online_order_lines_retail_online_order_id_fkey FOREIGN KEY (retail_online_order_id) REFERENCES public.retail_online_orders(id) ON DELETE CASCADE;


--
-- Name: retail_online_order_lines retail_online_order_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_order_lines
    ADD CONSTRAINT retail_online_order_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_online_orders retail_online_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_online_orders retail_online_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_online_orders retail_online_orders_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_online_orders
    ADD CONSTRAINT retail_online_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_price_audit retail_price_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_audit
    ADD CONSTRAINT retail_price_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: retail_price_list_items retail_price_list_items_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_list_items
    ADD CONSTRAINT retail_price_list_items_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.retail_price_lists(id);


--
-- Name: retail_price_list_items retail_price_list_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_list_items
    ADD CONSTRAINT retail_price_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: retail_price_list_items retail_price_list_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_list_items
    ADD CONSTRAINT retail_price_list_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_price_lists retail_price_lists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_lists
    ADD CONSTRAINT retail_price_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_price_lists retail_price_lists_customer_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_price_lists
    ADD CONSTRAINT retail_price_lists_customer_group_id_fkey FOREIGN KEY (customer_group_id) REFERENCES public.retail_customer_groups(id);


--
-- Name: retail_product_media retail_product_media_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_product_media
    ADD CONSTRAINT retail_product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: retail_product_media retail_product_media_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_product_media
    ADD CONSTRAINT retail_product_media_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_return_line_batches retail_return_line_batches_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_line_batches
    ADD CONSTRAINT retail_return_line_batches_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_return_line_batches retail_return_line_batches_retail_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_line_batches
    ADD CONSTRAINT retail_return_line_batches_retail_return_line_id_fkey FOREIGN KEY (retail_return_line_id) REFERENCES public.retail_return_lines(id) ON DELETE CASCADE;


--
-- Name: retail_return_lines retail_return_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines
    ADD CONSTRAINT retail_return_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_return_lines retail_return_lines_original_sale_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines
    ADD CONSTRAINT retail_return_lines_original_sale_line_id_fkey FOREIGN KEY (original_sale_line_id) REFERENCES public.retail_sale_lines(id);


--
-- Name: retail_return_lines retail_return_lines_retail_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines
    ADD CONSTRAINT retail_return_lines_retail_return_id_fkey FOREIGN KEY (retail_return_id) REFERENCES public.retail_returns(id) ON DELETE CASCADE;


--
-- Name: retail_return_lines retail_return_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_lines
    ADD CONSTRAINT retail_return_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_return_serial_events retail_return_serial_events_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_serial_events
    ADD CONSTRAINT retail_return_serial_events_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES public.retail_return_lines(id);


--
-- Name: retail_return_serial_events retail_return_serial_events_serial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_return_serial_events
    ADD CONSTRAINT retail_return_serial_events_serial_id_fkey FOREIGN KEY (serial_id) REFERENCES public.inventory_serials(id);


--
-- Name: retail_returns retail_returns_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id);


--
-- Name: retail_returns retail_returns_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.users(id);


--
-- Name: retail_returns retail_returns_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_returns retail_returns_original_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_returns
    ADD CONSTRAINT retail_returns_original_sale_id_fkey FOREIGN KEY (original_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_sale_audit retail_sale_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_audit
    ADD CONSTRAINT retail_sale_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: retail_sale_audit retail_sale_audit_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_audit
    ADD CONSTRAINT retail_sale_audit_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id);


--
-- Name: retail_sale_line_batches retail_sale_line_batches_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_line_batches
    ADD CONSTRAINT retail_sale_line_batches_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_sale_line_batches retail_sale_line_batches_retail_sale_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_line_batches
    ADD CONSTRAINT retail_sale_line_batches_retail_sale_line_id_fkey FOREIGN KEY (retail_sale_line_id) REFERENCES public.retail_sale_lines(id) ON DELETE CASCADE;


--
-- Name: retail_sale_lines retail_sale_lines_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_lines
    ADD CONSTRAINT retail_sale_lines_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id) ON DELETE CASCADE;


--
-- Name: retail_sale_lines retail_sale_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_lines
    ADD CONSTRAINT retail_sale_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_sale_payments retail_sale_payments_retail_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sale_payments
    ADD CONSTRAINT retail_sale_payments_retail_sale_id_fkey FOREIGN KEY (retail_sale_id) REFERENCES public.retail_sales(id) ON DELETE CASCADE;


--
-- Name: retail_sales retail_sales_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id);


--
-- Name: retail_sales retail_sales_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.users(id);


--
-- Name: retail_sales retail_sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retail_sales retail_sales_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_sales
    ADD CONSTRAINT retail_sales_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_stock_count_line_serials retail_stock_count_line_serials_retail_stock_count_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_line_serials
    ADD CONSTRAINT retail_stock_count_line_serials_retail_stock_count_line_id_fkey FOREIGN KEY (retail_stock_count_line_id) REFERENCES public.retail_stock_count_lines(id) ON DELETE CASCADE;


--
-- Name: retail_stock_count_lines retail_stock_count_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_lines
    ADD CONSTRAINT retail_stock_count_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_stock_count_lines retail_stock_count_lines_retail_stock_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_lines
    ADD CONSTRAINT retail_stock_count_lines_retail_stock_count_id_fkey FOREIGN KEY (retail_stock_count_id) REFERENCES public.retail_stock_counts(id) ON DELETE CASCADE;


--
-- Name: retail_stock_count_lines retail_stock_count_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_count_lines
    ADD CONSTRAINT retail_stock_count_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_stock_counts retail_stock_counts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: retail_stock_counts retail_stock_counts_counted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES public.users(id);


--
-- Name: retail_stock_counts retail_stock_counts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: retail_stock_counts retail_stock_counts_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_stock_counts
    ADD CONSTRAINT retail_stock_counts_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_supplier_skus retail_supplier_skus_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_supplier_skus
    ADD CONSTRAINT retail_supplier_skus_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: retail_supplier_skus retail_supplier_skus_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_supplier_skus
    ADD CONSTRAINT retail_supplier_skus_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_transfer_line_serials retail_transfer_line_serials_retail_transfer_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_line_serials
    ADD CONSTRAINT retail_transfer_line_serials_retail_transfer_line_id_fkey FOREIGN KEY (retail_transfer_line_id) REFERENCES public.retail_transfer_lines(id) ON DELETE CASCADE;


--
-- Name: retail_transfer_lines retail_transfer_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_lines
    ADD CONSTRAINT retail_transfer_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: retail_transfer_lines retail_transfer_lines_retail_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_lines
    ADD CONSTRAINT retail_transfer_lines_retail_transfer_id_fkey FOREIGN KEY (retail_transfer_id) REFERENCES public.retail_transfers(id) ON DELETE CASCADE;


--
-- Name: retail_transfer_lines retail_transfer_lines_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfer_lines
    ADD CONSTRAINT retail_transfer_lines_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: retail_transfers retail_transfers_destination_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_destination_location_id_fkey FOREIGN KEY (destination_location_id) REFERENCES public.inventory_locations(id);


--
-- Name: retail_transfers retail_transfers_dispatched_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_dispatched_by_fkey FOREIGN KEY (dispatched_by) REFERENCES public.users(id);


--
-- Name: retail_transfers retail_transfers_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);


--
-- Name: retail_transfers retail_transfers_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: retail_transfers retail_transfers_source_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_transfers
    ADD CONSTRAINT retail_transfers_source_location_id_fkey FOREIGN KEY (source_location_id) REFERENCES public.inventory_locations(id);


--
-- Name: role_permissions role_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: salary_advances salary_advances_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id);


--
-- Name: salary_advances salary_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);


--
-- Name: salary_advances salary_advances_given_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_given_by_fkey FOREIGN KEY (given_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: salary_payments salary_payments_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE RESTRICT;


--
-- Name: salary_payments salary_payments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: salary_payments salary_payments_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: savings_deposits savings_deposits_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits
    ADD CONSTRAINT savings_deposits_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE SET NULL;


--
-- Name: savings_deposits savings_deposits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits
    ADD CONSTRAINT savings_deposits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: savings_deposits savings_deposits_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits
    ADD CONSTRAINT savings_deposits_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: savings_deposits savings_deposits_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_deposits
    ADD CONSTRAINT savings_deposits_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: scheduled_cash_counts scheduled_cash_counts_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_cash_counts
    ADD CONSTRAINT scheduled_cash_counts_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id) ON DELETE SET NULL;


--
-- Name: scheduled_cash_counts scheduled_cash_counts_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_cash_counts
    ADD CONSTRAINT scheduled_cash_counts_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: store_credit_transactions store_credit_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credit_transactions
    ADD CONSTRAINT store_credit_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: store_credit_transactions store_credit_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credit_transactions
    ADD CONSTRAINT store_credit_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_charge_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_charge_journal_id_fkey FOREIGN KEY (charge_journal_id) REFERENCES public.journal_entries(id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_payment_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_payment_journal_id_fkey FOREIGN KEY (payment_journal_id) REFERENCES public.journal_entries(id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: users users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: users users_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designations(id) ON DELETE SET NULL;


--
-- Name: variant_attribute_values variant_attribute_values_attribute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.product_attributes(id) ON DELETE CASCADE;


--
-- Name: variant_attribute_values variant_attribute_values_attribute_value_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_attribute_value_id_fkey FOREIGN KEY (attribute_value_id) REFERENCES public.product_attribute_values(id) ON DELETE CASCADE;


--
-- Name: variant_attribute_values variant_attribute_values_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: warranty_claims warranty_claims_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: warranty_claims warranty_claims_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: warranty_claims warranty_claims_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: warranty_claims warranty_claims_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: warranty_claims warranty_claims_replacement_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_replacement_variant_id_fkey FOREIGN KEY (replacement_variant_id) REFERENCES public.product_variants(id);


--
-- Name: warranty_claims warranty_claims_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.retail_returns(id);


--
-- Name: warranty_claims warranty_claims_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.retail_sales(id);


--
-- Name: warranty_claims warranty_claims_sale_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_sale_line_id_fkey FOREIGN KEY (sale_line_id) REFERENCES public.retail_sale_lines(id);


--
-- Name: warranty_claims warranty_claims_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.warranty_snapshots(id);


--
-- Name: warranty_claims warranty_claims_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: warranty_economics warranty_economics_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_economics
    ADD CONSTRAINT warranty_economics_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.warranty_claims(id);


--
-- Name: warranty_economics warranty_economics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_economics
    ADD CONSTRAINT warranty_economics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: warranty_economics warranty_economics_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_economics
    ADD CONSTRAINT warranty_economics_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: warranty_events warranty_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_events
    ADD CONSTRAINT warranty_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: warranty_events warranty_events_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_events
    ADD CONSTRAINT warranty_events_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.warranty_claims(id);


--
-- Name: warranty_inspections warranty_inspections_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_inspections
    ADD CONSTRAINT warranty_inspections_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.warranty_claims(id);


--
-- Name: warranty_inspections warranty_inspections_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_inspections
    ADD CONSTRAINT warranty_inspections_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.users(id);


--
-- Name: warranty_policies warranty_policies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies
    ADD CONSTRAINT warranty_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: warranty_repairs warranty_repairs_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_repairs
    ADD CONSTRAINT warranty_repairs_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.warranty_claims(id);


--
-- Name: warranty_repairs warranty_repairs_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_repairs
    ADD CONSTRAINT warranty_repairs_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.users(id);


--
-- Name: warranty_rmas warranty_rmas_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.warranty_claims(id);


--
-- Name: warranty_rmas warranty_rmas_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipts(id);


--
-- Name: warranty_rmas warranty_rmas_purchase_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id);


--
-- Name: warranty_rmas warranty_rmas_rma_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_rma_location_id_fkey FOREIGN KEY (rma_location_id) REFERENCES public.inventory_locations(id);


--
-- Name: warranty_rmas warranty_rmas_source_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_source_location_id_fkey FOREIGN KEY (source_location_id) REFERENCES public.inventory_locations(id);


--
-- Name: warranty_rmas warranty_rmas_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_rmas
    ADD CONSTRAINT warranty_rmas_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: warranty_snapshots warranty_snapshots_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: warranty_snapshots warranty_snapshots_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.warranty_policies(id);


--
-- Name: warranty_snapshots warranty_snapshots_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.retail_sales(id);


--
-- Name: warranty_snapshots warranty_snapshots_sale_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_sale_line_id_fkey FOREIGN KEY (sale_line_id) REFERENCES public.retail_sale_lines(id);


--
-- Name: warranty_snapshots warranty_snapshots_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_snapshots
    ADD CONSTRAINT warranty_snapshots_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- PostgreSQL database dump complete
--
