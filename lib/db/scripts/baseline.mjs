/**
 * Разовый baseline журнала миграций.
 *
 * Нужен только в одном случае: схема в базе уже создана старым
 * `drizzle-kit push`, но таблицы `drizzle.__drizzle_migrations` нет.
 * Тогда `drizzle-kit migrate` пытается применить 0000 заново и падает
 * с «relation already exists».
 *
 * Скрипт помечает уже существующие миграции как применённые, ничего не
 * меняя в самой схеме. Запускать вручную и только один раз:
 *
 *   DATABASE_URL=... pnpm --filter @workspace/db baseline --yes
 *
 * ВАЖНО: запускать можно, только если схема в базе действительно
 * соответствует последней миграции. Если база отстаёт, baseline «прикроет»
 * недостающие изменения, и они никогда не применятся.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.join(dir, "..", "drizzle");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const journal = JSON.parse(
  readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8"),
);

const migrations = journal.entries.map((entry) => {
  const sql = readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
  return {
    tag: entry.tag,
    hash: createHash("sha256").update(sql).digest("hex"),
    createdAt: entry.when,
  };
});

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (tables.length === 0) {
    console.error(
      "В базе нет таблиц. Baseline не нужен — просто запустите `migrate`.",
    );
    process.exit(1);
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`);

  const { rows: applied } = await client.query(
    `SELECT hash FROM drizzle.__drizzle_migrations`,
  );
  const appliedHashes = new Set(applied.map((r) => r.hash));
  const pending = migrations.filter((m) => !appliedHashes.has(m.hash));

  if (pending.length === 0) {
    console.log("Журнал уже полный, делать нечего.");
    process.exit(0);
  }

  console.log(`Таблиц в базе: ${tables.length}`);
  console.log("Будут помечены как применённые (без изменения схемы):");
  for (const m of pending) console.log(`  - ${m.tag}`);

  if (!process.argv.includes("--yes")) {
    console.log("\nПробный запуск. Для записи повторите с флагом --yes.");
    process.exit(0);
  }

  for (const m of pending) {
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [m.hash, m.createdAt],
    );
  }
  console.log(`\nГотово: отмечено ${pending.length}. Теперь запустите migrate.`);
} finally {
  await client.end();
}
