CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_id" integer NOT NULL,
	"cashier_name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opening_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_cash_counted" numeric(12, 2),
	"expected_cash" numeric(12, 2),
	"cash_difference" numeric(12, 2),
	"total_sales_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sales_card" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_returns" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"opened_by_clerk_id" text,
	"closed_by_clerk_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_item_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by_clerk_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"price_per_unit" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"returned_quantity" numeric(12, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"register_id" integer NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_by_clerk_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;