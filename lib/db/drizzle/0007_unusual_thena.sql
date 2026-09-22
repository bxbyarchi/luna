CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"house_id" integer NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_by_clerk_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "total_collected" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "total_deposited" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "subtotal_amount" numeric(12, 2);--> statement-breakpoint
UPDATE "sales" SET "subtotal_amount" = "total_amount" WHERE "subtotal_amount" IS NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "subtotal_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_house_name_uq" ON "products" USING btree ("house_id","name");--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "users" SET "role" = 'super_admin' WHERE "role" = 'admin';