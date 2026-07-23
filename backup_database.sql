--
-- PostgreSQL database dump
--

\restrict FWZRD8IuI4bFaiasmuiTOn0MhVSHBoDyeEdfyXy7SkkjPPuDvOQ26Vvrybawsy9

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    org_name text DEFAULT 'M-Sklad'::text NOT NULL,
    currency text DEFAULT 'KGS'::text NOT NULL,
    timezone text DEFAULT 'Asia/Bishkek'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_settings OWNER TO postgres;

--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.app_settings_id_seq OWNER TO postgres;

--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: audit_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_items (
    id integer NOT NULL,
    audit_id integer NOT NULL,
    item_id integer NOT NULL,
    system_stock numeric(12,3) NOT NULL,
    actual_stock numeric(12,3)
);


ALTER TABLE public.audit_items OWNER TO postgres;

--
-- Name: audit_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_items_id_seq OWNER TO postgres;

--
-- Name: audit_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_items_id_seq OWNED BY public.audit_items.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    clerk_user_id text,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_id_seq OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_id_seq OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: inventory_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_audits (
    id integer NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone
);


ALTER TABLE public.inventory_audits OWNER TO postgres;

--
-- Name: inventory_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_audits_id_seq OWNER TO postgres;

--
-- Name: inventory_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_audits_id_seq OWNED BY public.inventory_audits.id;


--
-- Name: items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.items (
    id integer NOT NULL,
    name text NOT NULL,
    category_id integer NOT NULL,
    unit text DEFAULT 'шт'::text NOT NULL,
    location text,
    current_stock numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    min_threshold numeric(12,3),
    price_per_unit numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.items OWNER TO postgres;

--
-- Name: items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.items_id_seq OWNER TO postgres;

--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.items_id_seq OWNED BY public.items.id;


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipts (
    id integer NOT NULL,
    item_id integer NOT NULL,
    quantity numeric(12,3) NOT NULL,
    price_per_unit numeric(12,2) NOT NULL,
    total_cost numeric(14,2) NOT NULL,
    supplier text,
    photo_url text,
    notes text,
    recorded_by_clerk_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_urls json DEFAULT '[]'::json
);


ALTER TABLE public.receipts OWNER TO postgres;

--
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.receipts_id_seq OWNER TO postgres;

--
-- Name: receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.receipts_id_seq OWNED BY public.receipts.id;


--
-- Name: rentals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rentals (
    id integer NOT NULL,
    item_id integer NOT NULL,
    quantity numeric(12,3) NOT NULL,
    renter_name text NOT NULL,
    renter_phone text,
    issued_at timestamp with time zone NOT NULL,
    planned_return_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    returned_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rentals OWNER TO postgres;

--
-- Name: rentals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.rentals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rentals_id_seq OWNER TO postgres;

--
-- Name: rentals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.rentals_id_seq OWNED BY public.rentals.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    name text NOT NULL,
    "position" text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff OWNER TO postgres;

--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq OWNER TO postgres;

--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    clerk_user_id text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'warehouse'::text NOT NULL,
    first_name text,
    last_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    telegram_chat_id text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: write_offs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.write_offs (
    id integer NOT NULL,
    item_id integer NOT NULL,
    quantity numeric(12,3) NOT NULL,
    reason text NOT NULL,
    staff_id integer,
    photo_url text,
    notes text,
    total_value numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    recorded_by_clerk_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.write_offs OWNER TO postgres;

--
-- Name: write_offs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.write_offs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.write_offs_id_seq OWNER TO postgres;

--
-- Name: write_offs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.write_offs_id_seq OWNED BY public.write_offs.id;


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: audit_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_items ALTER COLUMN id SET DEFAULT nextval('public.audit_items_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: inventory_audits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_audits ALTER COLUMN id SET DEFAULT nextval('public.inventory_audits_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);


--
-- Name: receipts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts ALTER COLUMN id SET DEFAULT nextval('public.receipts_id_seq'::regclass);


--
-- Name: rentals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rentals ALTER COLUMN id SET DEFAULT nextval('public.rentals_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: write_offs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.write_offs ALTER COLUMN id SET DEFAULT nextval('public.write_offs_id_seq'::regclass);


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_settings (id, org_name, currency, timezone, updated_at) FROM stdin;
1	M-Sklad	KGS	Asia/Bishkek	2026-05-05 07:38:49.27832+00
\.


--
-- Data for Name: audit_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_items (id, audit_id, item_id, system_stock, actual_stock) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (id, action, entity_type, entity_id, clerk_user_id, details, created_at) FROM stdin;
1	create	category	1	\N	\N	2026-05-04 10:18:09.55198+00
2	create	item	1	\N	\N	2026-05-04 10:18:54.345564+00
3	create	receipt	1	\N	\N	2026-05-04 10:19:41.145913+00
4	create	staff	1	\N	\N	2026-05-04 10:20:11.272208+00
5	create	write_off	1	\N	\N	2026-05-04 10:21:14.79493+00
6	create	inventory_audit	1	\N	\N	2026-05-04 10:21:38.575896+00
7	create	category	2	\N	\N	2026-05-04 10:38:14.020258+00
8	update	category	2	\N	\N	2026-05-04 10:38:42.398466+00
9	create	item	2	\N	\N	2026-05-04 10:39:31.60154+00
10	update	item	2	\N	\N	2026-05-04 10:39:55.708934+00
11	create	staff	2	\N	\N	2026-05-04 10:40:28.581487+00
12	update	staff	2	\N	\N	2026-05-04 10:40:55.183647+00
13	create	inventory_audit	2	\N	\N	2026-05-04 10:41:32.321311+00
14	submit	inventory_audit	2	\N	Applied 2 item counts	2026-05-04 10:42:34.4757+00
15	update	item	1	\N	\N	2026-05-04 10:46:11.468856+00
16	update	item	1	\N	\N	2026-05-04 10:46:35.61723+00
17	update	item	1	\N	\N	2026-05-04 10:48:58.942951+00
18	create	write_off	2	\N	\N	2026-05-04 10:50:00.478384+00
19	create	category	4	\N	\N	2026-05-04 11:00:20.538621+00
20	update	category	4	\N	\N	2026-05-04 11:00:45.09081+00
21	create	staff	3	\N	\N	2026-05-04 11:01:32.623192+00
22	update	staff	3	\N	\N	2026-05-04 11:01:58.858725+00
23	create	item	3	\N	\N	2026-05-04 11:02:54.06479+00
24	update	item	3	\N	\N	2026-05-04 11:03:26.518507+00
25	create	inventory_audit	3	\N	\N	2026-05-04 11:03:59.9511+00
26	submit	inventory_audit	3	\N	Applied 3 item counts	2026-05-04 11:04:44.952482+00
27	create	category	5	\N	\N	2026-05-04 11:13:04.908118+00
28	update	category	5	\N	\N	2026-05-04 11:13:33.677921+00
29	create	item	4	\N	\N	2026-05-04 11:14:54.532975+00
30	update	item	4	\N	\N	2026-05-04 11:15:12.458278+00
31	create	staff	4	\N	\N	2026-05-04 11:15:40.654206+00
32	update	staff	4	\N	\N	2026-05-04 11:15:57.242345+00
33	create	receipt	2	\N	\N	2026-05-04 11:16:47.134225+00
34	create	write_off	3	\N	\N	2026-05-04 11:17:58.041439+00
35	create	inventory_audit	4	\N	\N	2026-05-04 11:18:33.772187+00
36	create	category	6	\N	\N	2026-05-04 11:23:04.374041+00
37	create	item	5	\N	\N	2026-05-04 11:23:59.132968+00
38	create	staff	5	\N	\N	2026-05-04 11:24:29.130363+00
39	update	staff	5	\N	\N	2026-05-04 11:24:53.860913+00
40	create	receipt	3	\N	\N	2026-05-04 11:25:47.528548+00
41	create	write_off	4	\N	\N	2026-05-04 11:27:03.330535+00
42	create	inventory_audit	5	\N	\N	2026-05-04 11:27:42.869589+00
43	submit	inventory_audit	5	\N	Applied 5 item counts	2026-05-04 11:29:03.214225+00
44	create	category	7	\N	\N	2026-05-04 11:39:05.844735+00
45	create	item	6	\N	\N	2026-05-04 11:40:16.268668+00
46	create	rental	1	\N	Тов-8mfxqr × 2 → Иванов Пётр Сергеевич	2026-05-05 05:01:47.320317+00
47	update	rental	1	\N	Статус: returned	2026-05-05 05:01:56.072416+00
48	create	write-off	11	\N	Telegram: Стул барный × 1 (Бой/повреждение)	2026-05-05 11:17:04.933324+00
49	delete	category	9	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-06 06:28:42.92692+00
50	delete	category	11	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-06 06:28:46.000735+00
51	delete	category	10	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-06 06:28:48.913137+00
52	create	category	12	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:10:06.512208+00
53	create	item	15	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:11:20.158905+00
54	update	item	15	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:12:34.61195+00
55	create	item	16	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:13:17.390306+00
56	create	item	17	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:13:55.051369+00
57	create	item	18	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-05-31 21:14:27.401023+00
58	create	receipt	\N	\N	Telegram restock: Liby L × 1	2026-06-04 14:12:24.853211+00
59	create	write-off	12	\N	Telegram: Liby L × 1 (Хозяйственные нужды)	2026-06-04 14:12:44.668188+00
60	create	write-off	13	\N	Telegram: Liby S × 1 (Хозяйственные нужды)	2026-06-05 15:14:36.915936+00
61	create	receipt	\N	\N	Telegram restock: Liby S × 2	2026-06-05 15:15:10.627947+00
62	create	category	13	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:35:16.310645+00
63	create	category	14	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:35:38.490047+00
64	create	category	15	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:36:00.7571+00
65	create	item	19	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:37:19.569442+00
66	create	item	20	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:37:48.810512+00
67	create	item	21	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:38:09.097347+00
68	create	item	22	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:38:25.773891+00
69	create	item	23	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:42:46.828176+00
70	create	item	24	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:43:41.36822+00
71	create	item	25	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 12:44:22.347121+00
72	update	item	20	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:11:47.856163+00
73	update	item	19	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:12:23.493351+00
74	update	item	21	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:12:57.128619+00
75	update	item	22	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:13:13.672099+00
76	update	item	23	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:13:50.506334+00
77	update	item	24	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:14:07.251845+00
78	create	item	26	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:21:14.477656+00
79	create	category	16	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:22:03.786031+00
80	create	item	27	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:22:46.575677+00
81	create	item	28	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:24:20.384532+00
82	create	item	29	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:24:53.386414+00
114	create	item	61	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:30:04.914139+00
115	create	item	62	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:30:55.379627+00
116	create	item	63	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:32:00.133142+00
117	create	item	64	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:33:36.844906+00
118	create	category	17	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:33:46.814963+00
119	update	item	24	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:33:55.129164+00
120	update	item	23	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:34:02.410198+00
121	update	item	25	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:34:42.272223+00
122	create	item	65	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:35:30.405669+00
123	create	item	66	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:36:09.826455+00
124	create	item	67	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:36:44.632745+00
125	create	item	68	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:38:07.4083+00
126	create	item	69	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-14 13:39:12.940612+00
127	update	item	25	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:33:38.128579+00
128	create	item	70	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:34:04.883713+00
129	create	item	71	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:34:25.234759+00
130	create	item	72	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:34:49.3438+00
131	create	item	73	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:35:07.061813+00
132	create	item	74	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:35:28.460549+00
133	create	item	75	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:35:49.180684+00
134	create	item	76	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:36:13.708619+00
135	create	item	77	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:36:40.732922+00
136	create	item	78	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:37:10.725757+00
137	create	item	79	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:38:19.346937+00
138	create	item	80	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:39:04.432331+00
139	create	item	81	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:39:44.788958+00
140	create	item	82	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:40:40.585468+00
141	create	item	83	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:45:38.519013+00
142	update	item	83	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 05:46:50.194825+00
143	create	item	84	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:15:00.939947+00
144	create	item	85	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:15:46.248803+00
145	create	item	86	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:16:25.986785+00
146	create	item	87	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:16:58.024416+00
147	create	item	88	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:20:03.171901+00
148	create	item	89	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:20:26.455419+00
149	create	item	90	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:20:45.549791+00
150	create	item	91	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:21:10.249867+00
151	create	item	92	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:21:32.84119+00
152	create	item	93	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:22:18.842806+00
153	create	item	94	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:22:53.548672+00
154	create	item	95	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:23:18.162903+00
155	create	item	96	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:23:51.76943+00
156	create	item	97	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:24:19.170508+00
157	create	item	98	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:24:45.236293+00
158	create	item	99	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:27:50.723166+00
159	create	item	100	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:28:13.65142+00
160	create	item	101	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:28:40.345022+00
161	create	item	102	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 07:29:07.920563+00
162	create	item	103	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:45:25.954564+00
163	create	item	104	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:45:52.48418+00
164	create	item	105	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:46:20.475033+00
165	create	item	106	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:55:33.949887+00
166	create	item	107	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:55:59.876889+00
167	create	item	108	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:56:30.319431+00
168	create	item	109	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:57:33.17617+00
169	create	item	110	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:57:57.080793+00
170	create	item	111	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:58:33.473589+00
171	create	item	112	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:59:00.640741+00
172	create	item	113	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 08:59:51.099014+00
173	create	item	114	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 09:11:46.614447+00
174	update	item	73	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 09:12:40.859042+00
175	update	item	70	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 09:15:30.583385+00
176	update	item	109	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 09:15:55.512405+00
177	update	item	25	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 09:16:58.104098+00
178	update	item	107	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:37:41.668993+00
179	create	item	115	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:38:46.134825+00
180	update	item	15	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:39:00.292489+00
181	update	item	16	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:39:15.677138+00
182	create	item	116	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:39:41.073657+00
183	create	item	117	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:40:14.969419+00
184	create	item	118	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:40:36.29999+00
185	create	item	119	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:41:02.817623+00
186	create	item	120	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:42:41.936011+00
187	update	item	18	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:43:06.69845+00
188	update	item	17	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:43:27.307697+00
189	create	item	121	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:43:54.345987+00
190	create	item	122	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:44:10.220961+00
191	create	item	123	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:45:02.685551+00
192	create	item	124	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:45:22.17922+00
193	create	item	125	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:45:41.263189+00
194	create	item	126	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:46:31.886481+00
195	create	item	127	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:47:05.234587+00
196	create	item	128	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:48:16.718564+00
197	create	item	129	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:49:06.204346+00
198	create	item	130	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:49:35.972801+00
199	create	item	131	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:50:39.250415+00
200	create	item	132	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:50:58.207687+00
201	create	item	133	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:51:17.88187+00
202	create	item	134	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:52:15.724302+00
203	create	item	135	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:52:35.406685+00
204	create	item	136	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:52:57.259435+00
205	create	item	137	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:53:56.63991+00
206	create	item	138	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:54:15.438417+00
207	create	item	139	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:54:32.277974+00
208	create	item	140	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:54:52.820799+00
209	create	item	141	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:55:25.381529+00
210	create	item	142	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:56:03.41636+00
211	create	item	143	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:56:22.349854+00
212	create	item	144	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:56:44.926137+00
213	create	item	145	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:57:01.762534+00
214	create	item	146	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:57:22.652627+00
215	create	item	147	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:57:45.25291+00
216	create	item	148	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:58:03.164461+00
217	create	item	149	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:58:29.376038+00
218	create	item	150	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:58:47.485524+00
219	create	item	151	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 13:59:52.44418+00
220	create	item	152	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:00:46.087463+00
221	create	item	153	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:05:22.607088+00
222	create	item	154	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:06:14.743732+00
223	create	item	155	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:06:37.948856+00
224	create	item	156	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:07:21.268825+00
225	create	item	157	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:07:41.557658+00
226	create	item	158	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:08:15.996901+00
227	create	item	159	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:08:49.801731+00
228	create	item	160	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:09:20.01766+00
229	create	item	161	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-17 14:09:45.33297+00
230	create	write-off	14	\N	Telegram: азелит × 1 (Хозяйственные нужды)	2026-06-17 14:11:30.25855+00
231	create	write-off	15	\N	Telegram: губки XL × 6 (Хозяйственные нужды)	2026-06-18 06:39:57.986602+00
232	create	write-off	16	\N	Telegram: перчатки M × 1 (Хозяйственные нужды)	2026-06-18 06:40:33.517859+00
233	create	write-off	17	\N	Telegram: перчатки L × 1 (Хозяйственные нужды)	2026-06-18 06:40:46.761502+00
234	create	write-off	18	\N	Telegram: цветные тряпки × 3 (Хозяйственные нужды)	2026-06-18 06:41:14.028615+00
235	create	receipt	\N	\N	Telegram restock: салфетки для гостей × 120	2026-06-18 06:59:00.371716+00
236	create	write-off	19	\N	Telegram: салфетки для гостей × 40 (Хозяйственные нужды)	2026-06-18 06:59:19.080602+00
237	create	write-off	20	\N	Telegram: салфетки для гостей × 60 (Иное)	2026-06-18 07:00:06.92539+00
238	create	receipt	\N	\N	Telegram restock: жидкое мыло 5л × 2	2026-06-18 07:00:37.983689+00
239	create	receipt	\N	\N	Telegram restock: бумажные полотенца для гостей × 36	2026-06-18 07:01:30.022206+00
240	create	receipt	\N	\N	Telegram restock: ароматизатор × 5	2026-06-18 07:02:04.371148+00
241	create	receipt	\N	\N	Telegram restock: освежитель воздуха × 5	2026-06-18 07:02:51.869715+00
242	create	receipt	\N	\N	Telegram restock: туалетная бумага для гостей × 60	2026-06-18 07:04:56.720035+00
243	create	receipt	\N	\N	Telegram restock: мусорные пакеты 200л × 3	2026-06-18 07:06:38.79629+00
244	create	receipt	\N	\N	Telegram restock: мусорные пакеты 200л × 1	2026-06-18 07:06:55.393683+00
245	create	receipt	\N	\N	Telegram restock: средство для унитаза × 4	2026-06-18 07:07:11.296301+00
246	create	receipt	\N	\N	Telegram restock: скотч XL × 3	2026-06-18 07:07:27.947635+00
247	create	receipt	\N	\N	Telegram restock: перчатки котломойщика × 3	2026-06-18 07:07:51.828841+00
248	create	receipt	\N	\N	Telegram restock: круглые тряпки × 2	2026-06-18 07:08:10.368515+00
249	create	receipt	\N	\N	Telegram restock: влажная салфетка × 4	2026-06-18 07:08:22.534772+00
250	create	receipt	\N	\N	Telegram restock: ушные палочки × 3	2026-06-18 07:08:37.414494+00
251	create	write-off	21	\N	Telegram: салфетки для гостей × 20 (Иное)	2026-06-18 07:12:15.042576+00
252	create	receipt	\N	\N	Telegram restock: половая тряпка × 4	2026-06-18 07:32:14.676792+00
253	create	write-off	22	\N	Telegram: половая тряпка × 1 (Хозяйственные нужды)	2026-06-18 07:32:36.576834+00
254	create	receipt	\N	\N	Telegram restock: средство котломойщика × 2	2026-06-18 07:33:12.727056+00
255	create	item	162	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-18 07:34:22.196605+00
256	create	write-off	23	\N	Telegram: перчатки L × 1 (Хозяйственные нужды)	2026-06-18 07:35:03.105659+00
257	create	write-off	24	\N	Telegram: бумажные полотенца для гостей × 3 (Хозяйственные нужды)	2026-06-18 07:35:31.210355+00
258	create	item	163	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-18 07:36:31.366515+00
259	create	write-off	25	\N	Telegram: цветные тряпки × 1 (Хозяйственные нужды)	2026-06-18 07:37:11.110252+00
260	create	write-off	26	\N	Telegram: мусорные пакеты 200л × 1 (Хозяйственные нужды)	2026-06-18 07:37:24.626219+00
261	create	write-off	27	\N	Telegram: железные губки × 1 (Хозяйственные нужды)	2026-06-18 07:48:27.24804+00
294	create	write-off	60	\N	Telegram: белизна × 2 (Хозяйственные нужды)	2026-06-18 11:26:21.278977+00
295	create	write-off	61	\N	Telegram: цветные тряпки × 1 (Хозяйственные нужды)	2026-06-18 13:46:14.004681+00
328	create	write-off	94	\N	Telegram: салфетки для гостей × 40 (Хозяйственные нужды)	2026-06-19 13:38:06.709943+00
329	create	write-off	95	\N	Telegram: бумажные полотенца для гостей × 2 (Хозяйственные нужды)	2026-06-19 14:22:51.427004+00
330	create	write-off	96	\N	Telegram: азелит × 1 (Хозяйственные нужды)	2026-06-19 14:23:13.340285+00
331	create	write-off	97	\N	Telegram: половая тряпка × 1 (Хозяйственные нужды)	2026-06-19 14:23:30.898493+00
332	create	write-off	98	\N	Telegram: туалетная бумага для гостей × 12 (Хозяйственные нужды)	2026-06-19 14:23:47.726807+00
333	create	write-off	99	\N	Telegram: цветные тряпки × 1 (Хозяйственные нужды)	2026-06-19 14:24:04.711284+00
334	create	write-off	100	\N	Telegram: микрофибра × 5 (Хозяйственные нужды)	2026-06-19 14:24:22.593792+00
335	create	write-off	101	\N	Telegram: мусорные пакеты 200л × 2 (Хозяйственные нужды)	2026-06-19 14:24:37.980532+00
336	create	receipt	\N	\N	Telegram restock: белизна × 5	2026-06-20 07:36:20.442531+00
337	create	receipt	\N	\N	Telegram restock: азелит × 5	2026-06-20 07:36:36.319371+00
338	create	receipt	\N	\N	Telegram restock: цветные тряпки × 10	2026-06-20 07:38:08.334201+00
339	create	receipt	\N	\N	Telegram restock: половая тряпка × 10	2026-06-20 07:38:43.469983+00
340	create	receipt	\N	\N	Telegram restock: мусорные пакеты 200л × 10	2026-06-20 07:40:13.612014+00
341	create	write-off	102	\N	Telegram: мусорные пакеты 200л × 5 (Хозяйственные нужды)	2026-06-20 07:42:31.194446+00
342	create	write-off	103	\N	Telegram: перчатки M × 2 (Хозяйственные нужды)	2026-06-20 07:43:04.36123+00
343	create	write-off	104	\N	Telegram: перчатки L × 2 (Хозяйственные нужды)	2026-06-20 07:45:04.059136+00
344	create	write-off	105	\N	Telegram: белизна × 1 (Хозяйственные нужды)	2026-06-20 07:45:31.371418+00
345	create	write-off	106	\N	Telegram: белизна × 1 (Хозяйственные нужды)	2026-06-20 07:45:41.809088+00
346	create	write-off	107	\N	Telegram: Liby L × 1 (Хозяйственные нужды)	2026-06-20 07:46:03.533525+00
347	create	write-off	108	\N	Telegram: азелит × 1 (Хозяйственные нужды)	2026-06-20 07:46:15.827758+00
348	create	write-off	109	\N	Telegram: цветные тряпки × 1 (Хозяйственные нужды)	2026-06-20 07:47:04.673798+00
349	create	write-off	110	\N	Telegram: половая тряпка × 2 (Хозяйственные нужды)	2026-06-20 07:47:21.537304+00
350	create	write-off	111	\N	Telegram: желтые перчатки × 1 (Хозяйственные нужды)	2026-06-20 07:47:37.222715+00
351	create	write-off	112	\N	Telegram: азелит × 1 (Хозяйственные нужды)	2026-06-20 07:47:50.909825+00
352	create	write-off	113	\N	Telegram: средство котломойщика × 1 (Хозяйственные нужды)	2026-06-20 09:26:31.631019+00
353	create	write-off	114	\N	Telegram: желтые перчатки × 1 (Хозяйственные нужды)	2026-06-20 09:26:56.833597+00
354	create	write-off	115	\N	Telegram: белизна × 1 (Хозяйственные нужды)	2026-06-20 09:27:13.683019+00
355	create	write-off	116	\N	Telegram: порошок 3кг × 1 (Хозяйственные нужды)	2026-06-20 09:27:31.312823+00
356	create	write-off	117	\N	Telegram: туалетная бумага для гостей × 12 (Хозяйственные нужды)	2026-06-20 09:27:56.932604+00
357	create	write-off	118	\N	Telegram: освежитель воздуха × 1 (Хозяйственные нужды)	2026-06-20 09:28:18.037735+00
358	create	write-off	119	\N	Telegram: бумажные полотенца для гостей × 3 (Хозяйственные нужды)	2026-06-20 09:28:32.505819+00
359	create	write-off	120	\N	Telegram: мусорные пакеты 200л × 2 (Хозяйственные нужды)	2026-06-20 09:29:04.770604+00
360	update	item	25	user_3DIpXOYRA6s6onAATtYXHen6Jc8	\N	2026-06-23 09:34:37.018259+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, slug, description, created_at) FROM stdin;
12	хоз часть	khoz-chast	мыло мойка 	2026-05-31 21:10:06.477636+00
13	ЗАЛ	zal	стулья,столы,диваны	2026-06-14 12:35:16.274428+00
14	посуда кухня	posuda-kukhnya	кухонная посуда	2026-06-14 12:35:38.486088+00
15	бар	bar	напитки,алкаголь	2026-06-14 12:36:00.753353+00
16	улица	ulitsa	фонари,провода,метла	2026-06-14 13:22:03.782372+00
17	посуда зал	posuda-zal		2026-06-14 13:33:46.809402+00
\.


--
-- Data for Name: inventory_audits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_audits (id, title, status, created_at, submitted_at) FROM stdin;
\.


--
-- Data for Name: items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.items (id, name, category_id, unit, location, current_stock, min_threshold, price_per_unit, photo_url, notes, created_at, updated_at) FROM stdin;
81	Закусочная Тарелка	17	шт	\N	284.000	250.000	0.00	\N	\N	2026-06-17 05:39:44.756869+00	2026-06-17 05:39:44.756869+00
82	Чайники (стекл) 	17	шт	\N	60.000	50.000	0.00	\N	\N	2026-06-17 05:40:40.580135+00	2026-06-17 05:40:40.580135+00
16	Liby L	12	шт	Склад A	0.000	\N	0.00	\N	средство для посуды	2026-05-31 21:13:17.386854+00	2026-06-20 07:46:03.536+00
83	супница для крем супа М	17	шт	\N	85.000	75.000	0.00	\N	\N	2026-06-17 05:45:38.376382+00	2026-06-17 05:46:50.151+00
18	освежитель воздуха	12	шт	Склад A	8.000	2.000	0.00	\N	освежитель туалета	2026-05-31 21:14:27.397572+00	2026-06-20 09:28:18.041+00
20	коктейльные столы	13	шт	зал	25.000	15.000	3250.00	\N	\N	2026-06-14 12:37:48.779888+00	2026-06-14 13:11:47.521+00
19	стулья гостевые	13	шт	зал	492.000	300.000	4420.00	\N	\N	2026-06-14 12:37:19.560155+00	2026-06-14 13:12:23.486+00
21	зонты большие	13	шт	зал	6.000	3.000	21970.00	\N	\N	2026-06-14 12:38:09.090513+00	2026-06-14 13:12:57.088+00
22	зонты маленькие	13	шт	зал	5.000	2.000	2600.00	\N	\N	2026-06-14 12:38:25.758691+00	2026-06-14 13:13:13.665+00
84	чашка эспрессо S	17	шт	\N	20.000	15.000	0.00	\N	\N	2026-06-17 07:15:00.728862+00	2026-06-17 07:15:00.728862+00
85	чашки эспрессо L 	17	шт	\N	67.000	55.000	0.00	\N	\N	2026-06-17 07:15:46.244336+00	2026-06-17 07:15:46.244336+00
26	чехол для коктейльного столика	13	шт	\N	25.000	15.000	260.00	\N	\N	2026-06-14 13:21:14.40332+00	2026-06-14 13:21:14.40332+00
27	фонари высокие 	16	шт	улица	4.000	1.000	1378.00	\N	\N	2026-06-14 13:22:46.543407+00	2026-06-14 13:22:46.543407+00
28	фонари средние	16	шт	улица	22.000	15.000	1235.00	\N	\N	2026-06-14 13:24:20.378342+00	2026-06-14 13:24:20.378342+00
29	фонари короткие	16	шт	улица	22.000	15.000	1105.00	\N	\N	2026-06-14 13:24:53.380425+00	2026-06-14 13:24:53.380425+00
61	свечи с батарейкой	13	шт	зал	100.000	90.000	57.20	\N	\N	2026-06-14 13:30:04.872439+00	2026-06-14 13:30:04.872439+00
62	треугольник с подсветкой	13	шт	зал	2.000	\N	7670.00	\N	\N	2026-06-14 13:30:55.372428+00	2026-06-14 13:30:55.372428+00
63	чафиндишы	14	шт	кухня	6.000	\N	4082.00	\N	\N	2026-06-14 13:32:00.116023+00	2026-06-14 13:32:00.116023+00
64	формочка для тирамису	14	шт	кухня	2.000	\N	390.00	\N	\N	2026-06-14 13:33:36.811327+00	2026-06-14 13:33:36.811327+00
24	новые хайблы с китая	17	шт	кухня	504.000	400.000	221.00	\N	\N	2026-06-14 12:43:41.3638+00	2026-06-14 13:33:55.12+00
23	креманки	17	шт	кухня	351.000	300.000	260.00	\N	\N	2026-06-14 12:42:46.792222+00	2026-06-14 13:34:02.406+00
86	чашки эспрессо M 	17	шт	\N	127.000	100.000	0.00	\N	\N	2026-06-17 07:16:25.9489+00	2026-06-17 07:16:25.9489+00
65	сетка для посудомойки	14	шт	кухня	20.000	\N	1001.00	\N	\N	2026-06-14 13:35:30.397995+00	2026-06-14 13:35:30.397995+00
66	мухобойки электрические	14	шт	кухня	2.000	\N	455.00	\N	\N	2026-06-14 13:36:09.821086+00	2026-06-14 13:36:09.821086+00
67	мухобойки маленькие	14	шт	\N	4.000	\N	286.00	\N	\N	2026-06-14 13:36:44.62708+00	2026-06-14 13:36:44.62708+00
68	волны для хлеба	17	шт	\N	80.000	60.000	845.00	\N	\N	2026-06-14 13:38:07.393875+00	2026-06-14 13:38:07.393875+00
69	прямоугольные складные столики	13	шт	\N	4.000	\N	2730.00	\N	\N	2026-06-14 13:39:12.907426+00	2026-06-14 13:39:12.907426+00
107	тарелки для нарезки	17	шт	\N	104.000	75.000	0.00	\N	\N	2026-06-17 08:55:59.872398+00	2026-06-17 13:37:41.626+00
71	чайные ложки	17	шт	кухня	374.000	\N	0.00	\N	\N	2026-06-17 05:34:25.230045+00	2026-06-17 05:34:25.230045+00
72	креманки стеклянные	17	шт	\N	22.000	15.000	0.00	\N	\N	2026-06-17 05:34:49.308837+00	2026-06-17 05:34:49.308837+00
74	винник для белого	17	шт	\N	99.000	80.000	0.00	\N	\N	2026-06-17 05:35:28.454149+00	2026-06-17 05:35:28.454149+00
75	винник для красного	17	шт	\N	237.000	200.000	0.00	\N	\N	2026-06-17 05:35:49.175491+00	2026-06-17 05:35:49.175491+00
76	графин (стекло)	17	шт	\N	20.000	15.000	0.00	\N	\N	2026-06-17 05:36:13.675201+00	2026-06-17 05:36:13.675201+00
77	графин (железо)	17	шт	\N	64.000	55.000	0.00	\N	\N	2026-06-17 05:36:40.728309+00	2026-06-17 05:36:40.728309+00
78	тарелка для второго блюда	17	шт	\N	270.000	250.000	0.00	\N	\N	2026-06-17 05:37:10.66981+00	2026-06-17 05:37:10.66981+00
79	подставочная тарелка	17	шт	\N	296.000	250.000	0.00	\N	\N	2026-06-17 05:38:19.230872+00	2026-06-17 05:38:19.230872+00
80	Тарелка для Беша	17	шт	\N	50.000	40.000	0.00	\N	\N	2026-06-17 05:39:04.427796+00	2026-06-17 05:39:04.427796+00
87	ведерко для льда 	17	шт	\N	19.000	13.000	0.00	\N	\N	2026-06-17 07:16:58.01961+00	2026-06-17 07:16:58.01961+00
88	супница для крем супа S	17	шт	\N	192.000	180.000	0.00	\N	\N	2026-06-17 07:20:03.136134+00	2026-06-17 07:20:03.136134+00
89	конфетницы	17	шт	\N	44.000	35.000	0.00	\N	\N	2026-06-17 07:20:26.451327+00	2026-06-17 07:20:26.451327+00
90	фруктовницы	17	шт	\N	22.000	15.000	0.00	\N	\N	2026-06-17 07:20:45.545172+00	2026-06-17 07:20:45.545172+00
91	ножки круглые (желез)	17	шт	\N	50.000	40.000	0.00	\N	\N	2026-06-17 07:21:10.21138+00	2026-06-17 07:21:10.21138+00
92	ножки овальные (желез)	17	шт	\N	80.000	70.000	0.00	\N	\N	2026-06-17 07:21:32.836173+00	2026-06-17 07:21:32.836173+00
93	десертницы овальные с ушками	17	шт	\N	40.000	30.000	0.00	\N	\N	2026-06-17 07:22:18.797772+00	2026-06-17 07:22:18.797772+00
94	десертницы круглые с ушками	17	шт	\N	65.000	55.000	0.00	\N	\N	2026-06-17 07:22:53.544542+00	2026-06-17 07:22:53.544542+00
95	тарелки круглые XL	17	шт	\N	43.000	30.000	0.00	\N	\N	2026-06-17 07:23:18.155722+00	2026-06-17 07:23:18.155722+00
96	тарелки круглые M	17	шт	\N	146.000	130.000	0.00	\N	\N	2026-06-17 07:23:51.735015+00	2026-06-17 07:23:51.735015+00
97	тарелки круглые L	17	шт	\N	114.000	100.000	0.00	\N	\N	2026-06-17 07:24:19.165431+00	2026-06-17 07:24:19.165431+00
98	тарелки круглые S	17	шт	\N	115.000	100.000	0.00	\N	\N	2026-06-17 07:24:45.223591+00	2026-06-17 07:24:45.223591+00
99	овальные тарелки L	17	шт	\N	132.000	100.000	0.00	\N	\N	2026-06-17 07:27:50.690466+00	2026-06-17 07:27:50.690466+00
100	овальные тарелки M	17	шт	\N	153.000	130.000	0.00	\N	\N	2026-06-17 07:28:13.64642+00	2026-06-17 07:28:13.64642+00
101	супницы 	17	шт	\N	280.000	250.000	0.00	\N	\N	2026-06-17 07:28:40.341237+00	2026-06-17 07:28:40.341237+00
102	рюмка	17	шт	\N	158.000	140.000	0.00	\N	\N	2026-06-17 07:29:07.914774+00	2026-06-17 07:29:07.914774+00
103	шоты 	17	шт	\N	29.000	20.000	0.00	\N	\N	2026-06-17 08:45:25.733081+00	2026-06-17 08:45:25.733081+00
104	салфетницы	17	шт	\N	46.000	40.000	0.00	\N	\N	2026-06-17 08:45:52.4772+00	2026-06-17 08:45:52.4772+00
105	рюмки гладкие	17	шт	\N	72.000	65.000	0.00	\N	\N	2026-06-17 08:46:20.470331+00	2026-06-17 08:46:20.470331+00
106	сахарницы	17	шт	\N	55.000	45.000	0.00	\N	\N	2026-06-17 08:55:33.911732+00	2026-06-17 08:55:33.911732+00
108	тарелки для мяса (учаа)	17	шт	\N	25.000	15.000	0.00	\N	\N	2026-06-17 08:56:30.314584+00	2026-06-17 08:56:30.314584+00
110	хайблы старые	17	шт	\N	87.000	75.000	0.00	\N	\N	2026-06-17 08:57:57.075581+00	2026-06-17 08:57:57.075581+00
111	роксы M	17	шт	\N	55.000	45.000	0.00	\N	\N	2026-06-17 08:58:33.464041+00	2026-06-17 08:58:33.464041+00
112	хайблы обычные	17	шт	\N	48.000	35.000	0.00	\N	\N	2026-06-17 08:59:00.603258+00	2026-06-17 08:59:00.603258+00
70	столовые ложки	17	шт	кухня	395.000	300.000	0.00	\N	\N	2026-06-17 05:34:04.877471+00	2026-06-17 09:15:30.542+00
109	соусницы 	17	шт	\N	255.000	140.000	0.00	\N	\N	2026-06-17 08:57:33.136278+00	2026-06-17 09:15:55.507+00
25	вилки 	17	шт	кухня	453.000	350.000	0.00	\N	\N	2026-06-14 12:44:22.332408+00	2026-06-23 09:34:37.005+00
17	ароматизатор	12	шт	Склад A	9.000	2.000	0.00	\N	ароматизатор для туалета	2026-05-31 21:13:55.020921+00	2026-06-18 07:02:04.366+00
113	роксы гладкие S	17	шт	\N	18.000	10.000	0.00	\N	\N	2026-06-17 08:59:51.092596+00	2026-06-17 08:59:51.092596+00
114	роксы old fashion 	17	шт	\N	2.000	\N	0.00	\N	\N	2026-06-17 09:11:46.518335+00	2026-06-17 09:11:46.518335+00
73	флюте	17	шт	\N	85.000	75.000	0.00	\N	\N	2026-06-17 05:35:07.057399+00	2026-06-17 09:12:40.847+00
15	Liby S	12	шт	Склад A	8.000	3.000	0.00	\N	средство для посуды	2026-05-31 21:11:20.125389+00	2026-06-17 13:39:00.284+00
116	commet 	12	шт	\N	7.000	3.000	0.00	\N	\N	2026-06-17 13:39:41.038749+00	2026-06-17 13:39:41.038749+00
117	доместос	12	шт	\N	5.000	2.000	0.00	\N	\N	2026-06-17 13:40:14.92752+00	2026-06-17 13:40:14.92752+00
118	антисептик	12	шт	\N	3.000	1.000	0.00	\N	\N	2026-06-17 13:40:36.283407+00	2026-06-17 13:40:36.283407+00
119	мила S	12	шт	\N	7.000	3.000	0.00	\N	\N	2026-06-17 13:41:02.81119+00	2026-06-17 13:41:02.81119+00
124	стрейч пленка	12	шт	\N	4.000	2.000	0.00	\N	\N	2026-06-17 13:45:22.172496+00	2026-06-17 13:45:22.172496+00
125	стеклоочиститель	12	шт	\N	17.000	5.000	0.00	\N	\N	2026-06-17 13:45:41.255988+00	2026-06-17 13:45:41.255988+00
128	корейские губки	12	шт	\N	10.000	5.000	0.00	\N	\N	2026-06-17 13:48:16.679603+00	2026-06-17 13:48:16.679603+00
131	губки M	12	шт	\N	20.000	10.000	0.00	\N	\N	2026-06-17 13:50:39.211498+00	2026-06-17 13:50:39.211498+00
134	двухсторонний скотч	12	шт	\N	5.000	3.000	0.00	\N	\N	2026-06-17 13:52:15.691898+00	2026-06-17 13:52:15.691898+00
135	скотч M	12	шт	\N	3.000	3.000	0.00	\N	\N	2026-06-17 13:52:35.397425+00	2026-06-17 13:52:35.397425+00
138	полироль для мебели S	12	шт	\N	1.000	\N	0.00	\N	\N	2026-06-17 13:54:15.431654+00	2026-06-17 13:54:15.431654+00
139	каустическая сода	12	шт	\N	3.000	1.000	0.00	\N	\N	2026-06-17 13:54:32.27211+00	2026-06-17 13:54:32.27211+00
142	мусорные пакеты 30л	12	шт	\N	25.000	10.000	0.00	\N	\N	2026-06-17 13:56:03.410887+00	2026-06-17 13:56:03.410887+00
143	мила 5л	12	шт	\N	2.000	\N	0.00	\N	\N	2026-06-17 13:56:22.343665+00	2026-06-17 13:56:22.343665+00
144	полироль для мебели 3л	12	шт	\N	1.000	\N	0.00	\N	\N	2026-06-17 13:56:44.918646+00	2026-06-17 13:56:44.918646+00
146	прямоугольные тряпки	12	шт	\N	3.000	2.000	0.00	\N	\N	2026-06-17 13:57:22.646526+00	2026-06-17 13:57:22.646526+00
147	треугольная тряпка	12	шт	\N	1.000	\N	0.00	\N	\N	2026-06-17 13:57:45.216838+00	2026-06-17 13:57:45.216838+00
151	вафельные тряпки	12	шт	\N	17.000	10.000	0.00	\N	\N	2026-06-17 13:59:52.408476+00	2026-06-17 13:59:52.408476+00
155	ополаскиватель F305	12	шт	\N	3.000	1.000	0.00	\N	\N	2026-06-17 14:06:37.911819+00	2026-06-17 14:06:37.911819+00
156	средство для мытья посуды для посудомойки F304	12	шт	\N	4.000	1.000	0.00	\N	\N	2026-06-17 14:07:21.254339+00	2026-06-17 14:07:21.254339+00
158	средство для мытья полов 	12	литр	\N	3.000	2.000	0.00	\N	\N	2026-06-17 14:08:15.991618+00	2026-06-17 14:08:15.991618+00
159	стреклоочиститель 5л	12	литр	\N	2.000	\N	0.00	\N	\N	2026-06-17 14:08:49.768362+00	2026-06-17 14:08:49.768362+00
160	средство послестроительной уборки 5л	12	шт	\N	2.000	\N	0.00	\N	\N	2026-06-17 14:09:20.011889+00	2026-06-17 14:09:20.011889+00
161	средство для мытья полов 5л	12	шт	\N	1.000	\N	0.00	\N	\N	2026-06-17 14:09:45.324894+00	2026-06-17 14:09:45.324894+00
152	микрофибра	12	шт	\N	25.000	15.000	0.00	\N	\N	2026-06-17 14:00:46.080572+00	2026-06-19 14:24:22.604+00
130	губки XL	12	шт	\N	24.000	15.000	0.00	\N	\N	2026-06-17 13:49:35.937973+00	2026-06-18 06:39:58.003+00
141	мусорные пакеты 200л	12	шт	\N	9.000	7.000	0.00	\N	\N	2026-06-17 13:55:25.346573+00	2026-06-20 09:29:04.773+00
150	цветные тряпки	12	шт	\N	12.000	5.000	0.00	\N	\N	2026-06-17 13:58:47.446824+00	2026-06-20 07:47:04.682+00
145	половая тряпка	12	шт	\N	13.000	3.000	0.00	\N	\N	2026-06-17 13:57:01.747186+00	2026-06-20 07:47:21.552+00
136	скотч XL	12	шт	\N	5.000	2.000	0.00	\N	\N	2026-06-17 13:52:57.252328+00	2026-06-18 07:07:27.943+00
126	перчатки котломойщика	12	шт	\N	4.000	2.000	0.00	\N	\N	2026-06-17 13:46:31.880668+00	2026-06-18 07:07:51.824+00
157	жидкое мыло 5л	12	шт	\N	3.000	1.000	0.00	\N	\N	2026-06-17 14:07:41.521073+00	2026-06-18 07:00:37.979+00
127	железные губки	12	шт	\N	6.000	4.000	0.00	\N	\N	2026-06-17 13:47:05.22715+00	2026-06-18 07:48:27.254+00
148	круглые тряпки	12	шт	\N	4.000	2.000	0.00	\N	\N	2026-06-17 13:58:03.157992+00	2026-06-18 07:08:10.364+00
137	средство для унитаза	12	шт	\N	5.000	1.000	0.00	\N	\N	2026-06-17 13:53:56.604328+00	2026-06-18 07:07:11.291+00
132	влажная салфетка	12	шт	\N	5.000	2.000	0.00	\N	\N	2026-06-17 13:50:58.200395+00	2026-06-18 07:08:22.53+00
133	ушные палочки	12	шт	\N	6.000	3.000	0.00	\N	\N	2026-06-17 13:51:17.87567+00	2026-06-18 07:08:37.41+00
120	азелит	12	шт	\N	10.000	4.000	0.00	\N	\N	2026-06-17 13:42:41.904082+00	2026-06-20 07:47:50.913+00
149	средство котломойщика	12	шт	\N	2.000	3.000	0.00	\N	\N	2026-06-17 13:58:29.369484+00	2026-06-20 09:26:31.645+00
162	бумага для стафа	12	шт	\N	40.000	10.000	0.00	\N	\N	2026-06-18 07:34:22.143112+00	2026-06-18 07:34:22.143112+00
129	желтые перчатки	12	шт	\N	6.000	4.000	0.00	\N	\N	2026-06-17 13:49:06.190842+00	2026-06-20 09:26:56.836+00
163	пальчиковые батарейки	12	шт	\N	80.000	\N	0.00	\N	\N	2026-06-18 07:36:31.358767+00	2026-06-18 07:36:31.358767+00
121	перчатки M	12	шт	\N	8.000	5.000	0.00	\N	\N	2026-06-17 13:43:54.312473+00	2026-06-20 07:43:04.367+00
154	салфетки для гостей	12	шт	\N	80.000	60.000	0.00	\N	\N	2026-06-17 14:06:14.732742+00	2026-06-19 13:38:06.715+00
115	белизна	12	шт	\N	13.000	5.000	0.00	\N	\N	2026-06-17 13:38:46.091671+00	2026-06-20 09:27:13.685+00
140	порошок 3кг	12	шт	\N	5.000	2.000	0.00	\N	\N	2026-06-17 13:54:52.806737+00	2026-06-20 09:27:31.317+00
123	туалетная бумага для гостей	12	шт	\N	108.000	36.000	0.00	\N	\N	2026-06-17 13:45:02.646844+00	2026-06-20 09:27:56.935+00
122	перчатки L	12	шт	\N	10.000	5.000	0.00	\N	\N	2026-06-17 13:44:10.214526+00	2026-06-20 07:45:04.063+00
153	бумажные полотенца для гостей	12	шт	\N	86.000	30.000	0.00	\N	\N	2026-06-17 14:05:22.566386+00	2026-06-20 09:28:32.511+00
\.


--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.receipts (id, item_id, quantity, price_per_unit, total_cost, supplier, photo_url, notes, recorded_by_clerk_id, created_at, photo_urls) FROM stdin;
12	16	1.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-04 14:12:24.383019+00	[]
13	15	2.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-05 15:15:10.622013+00	[]
14	154	120.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 06:59:00.033115+00	[]
15	157	2.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:00:37.971335+00	[]
16	153	36.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:01:29.9854+00	[]
17	17	5.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:02:04.353194+00	[]
18	18	5.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:02:51.830005+00	[]
19	123	60.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:04:56.713443+00	[]
20	141	3.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:06:38.760496+00	[]
21	141	1.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:06:55.386921+00	[]
22	137	4.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:07:11.288656+00	[]
23	136	3.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:07:27.939101+00	[]
24	126	3.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:07:51.790335+00	[]
25	148	2.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:08:10.36017+00	[]
26	132	4.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:08:22.518182+00	[]
27	133	3.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:08:37.406147+00	[]
28	145	4.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:32:14.395379+00	[]
29	149	2.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-18 07:33:12.719419+00	[]
30	115	5.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-20 07:36:20.375088+00	[]
31	120	5.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-20 07:36:36.308151+00	[]
32	150	10.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-20 07:38:08.293309+00	[]
33	145	10.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-20 07:38:43.45895+00	[]
34	141	10.000	0.00	0.00	Оприходование через Telegram	\N	\N	\N	2026-06-20 07:40:13.598104+00	[]
\.


--
-- Data for Name: rentals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rentals (id, item_id, quantity, renter_name, renter_phone, issued_at, planned_return_at, status, returned_at, notes, created_at) FROM stdin;
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.staff (id, name, "position", phone, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, clerk_user_id, email, role, first_name, last_name, created_at, updated_at, telegram_chat_id) FROM stdin;
7	user_3DIpXOYRA6s6onAATtYXHen6Jc8	archi4791011@gmail.com	admin	Арсен	Ишенбаев	2026-05-05 11:11:17.109577+00	2026-05-05 11:16:08.92+00	5281614984
11	user_3FG0rz9uUnpYFTUE1UQX4O0cV10	rustamova.projects@gmail.com	manager	Айгул	Рустамова	2026-06-17 08:51:40.452098+00	2026-06-17 08:55:52.6+00	706462246
12	user_3FIaXty59N8wyKNfelu6usAQU2h	victormoydunov@icloud.com	manager	Виктор 	Мойдунов	2026-06-18 06:44:39.879784+00	2026-06-18 06:48:15.698+00	756091447
13	user_3FMRjR4qVahi2lAgjQvNxIS9tjG	tn7557414@gmail.com	accountant	Наргиза		2026-06-19 15:31:27.035583+00	2026-06-19 15:33:12.73+00	1463718141
\.


--
-- Data for Name: write_offs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.write_offs (id, item_id, quantity, reason, staff_id, photo_url, notes, total_value, recorded_by_clerk_id, created_at) FROM stdin;
12	16	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-04 14:12:44.664055+00
13	15	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-05 15:14:36.879654+00
14	120	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-17 14:11:30.219343+00
15	130	6.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 06:39:57.936728+00
16	121	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 06:40:33.511445+00
17	122	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 06:40:46.750964+00
18	150	3.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 06:41:13.881279+00
19	154	40.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 06:59:19.076432+00
20	154	60.000	Иное	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:00:06.887394+00
21	154	20.000	Иное	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:12:14.939542+00
22	145	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:32:36.570435+00
23	122	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:35:03.067302+00
24	153	3.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:35:31.205316+00
25	150	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:37:11.075397+00
26	141	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:37:24.621615+00
27	127	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 07:48:27.219337+00
60	115	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 11:26:21.228286+00
61	150	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-18 13:46:13.735146+00
94	154	40.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 13:38:06.517543+00
95	153	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:22:51.354059+00
96	120	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:23:13.332171+00
97	145	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:23:30.89171+00
98	123	12.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:23:47.721151+00
99	150	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:24:04.679871+00
100	152	5.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:24:22.588975+00
101	141	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-19 14:24:37.975072+00
102	141	5.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:42:31.157439+00
103	121	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:43:04.356222+00
104	122	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:45:04.025574+00
105	115	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:45:31.364481+00
106	115	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:45:41.80388+00
107	16	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:46:03.528684+00
108	120	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:46:15.788861+00
109	150	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:47:04.667065+00
110	145	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:47:21.502659+00
111	129	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:47:37.217392+00
112	120	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 07:47:50.904494+00
113	149	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:26:31.583794+00
114	129	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:26:56.82884+00
115	115	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:27:13.678494+00
116	140	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:27:31.309116+00
117	123	12.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:27:56.899426+00
118	18	1.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:28:18.021393+00
119	153	3.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:28:32.500647+00
120	141	2.000	Хозяйственные нужды	\N	\N	Списание через Telegram-бот	0.00	\N	2026-06-20 09:29:04.731617+00
\.


--
-- Name: app_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_settings_id_seq', 2, true);


--
-- Name: audit_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_items_id_seq', 15, true);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 360, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 17, true);


--
-- Name: inventory_audits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_audits_id_seq', 5, true);


--
-- Name: items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.items_id_seq', 163, true);


--
-- Name: receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.receipts_id_seq', 34, true);


--
-- Name: rentals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rentals_id_seq', 6, true);


--
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.staff_id_seq', 7, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 13, true);


--
-- Name: write_offs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.write_offs_id_seq', 120, true);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: audit_items audit_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_items
    ADD CONSTRAINT audit_items_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_unique UNIQUE (slug);


--
-- Name: inventory_audits inventory_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_audits
    ADD CONSTRAINT inventory_audits_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: rentals rentals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT rentals_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: users users_clerk_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_user_id_unique UNIQUE (clerk_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: write_offs write_offs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_pkey PRIMARY KEY (id);


--
-- Name: audit_items audit_items_audit_id_inventory_audits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_items
    ADD CONSTRAINT audit_items_audit_id_inventory_audits_id_fk FOREIGN KEY (audit_id) REFERENCES public.inventory_audits(id);


--
-- Name: audit_items audit_items_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_items
    ADD CONSTRAINT audit_items_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: items items_category_id_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: receipts receipts_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: rentals rentals_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT rentals_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: write_offs write_offs_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: write_offs write_offs_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- PostgreSQL database dump complete
--

\unrestrict FWZRD8IuI4bFaiasmuiTOn0MhVSHBoDyeEdfyXy7SkkjPPuDvOQ26Vvrybawsy9

