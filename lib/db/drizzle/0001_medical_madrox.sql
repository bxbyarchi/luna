CREATE TABLE "rentals" (
        "id" serial PRIMARY KEY NOT NULL,
        "item_id" integer NOT NULL,
        "quantity" numeric(12, 3) NOT NULL,
        "renter_name" text NOT NULL,
        "renter_phone" text,
        "issued_at" timestamp with time zone NOT NULL,
        "planned_return_at" timestamp with time zone NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "returned_at" timestamp with time zone,
        "notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "org_name" text DEFAULT 'M-Sklad' NOT NULL,
        "currency" text DEFAULT 'KGS' NOT NULL,
        "timezone" text DEFAULT 'Asia/Bishkek' NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "photo_urls" json DEFAULT '[]'::json;--> statement-breakpoint
UPDATE "receipts" SET "photo_urls" = json_build_array("photo_url") WHERE "photo_url" IS NOT NULL AND ("photo_urls" IS NULL OR "photo_urls"::text = '[]');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;