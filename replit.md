# M-Sklad — Restaurant Inventory ERP

## Overview

Full-stack Russian-language restaurant inventory & ERP web app built as a pnpm monorepo.

## Stack

- **Monorepo**: pnpm workspaces + TypeScript project references
- **Node.js**: 24
- **Frontend**: React + Vite (port from `$PORT` env), Tailwind v4, shadcn/ui, wouter, react-query, recharts, Clerk auth
- **Backend**: Express 5 (port 8080), Drizzle ORM (PostgreSQL), Clerk Express middleware
- **Auth**: Clerk (`@clerk/react`, `@clerk/express`) — CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY set
- **Codegen**: Orval generates react-query hooks in `lib/api-client-react` and Zod schemas in `lib/api-zod` from OpenAPI spec in `lib/api-spec`
- **Object Storage**: DEFAULT_OBJECT_STORAGE_BUCKET_ID, PUBLIC_OBJECT_SEARCH_PATHS, PRIVATE_OBJECT_DIR set

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Features Implemented

### Backend (`artifacts/api-server/src/routes/`)
- `auth.ts` — Clerk auth, auto-creates user in `usersTable`; first user ever promoted to admin
- `categories.ts` — CRUD for categories (update uses PATCH)
- `items.ts` — CRUD for items with low-stock flag, search (update uses PATCH)
- `receipts.ts` — Goods receiving, updates item stock
- `writeOffs.ts` — Write-off/breakage recording
- `inventoryAudits.ts` — Audit creation; PATCH update uses `itemId` (not auditItem.id); submit reconciles `items.currentStock` from actual counts
- `staff.ts` — Staff directory CRUD (update uses PATCH)
- `analytics.ts` — 6 endpoints: summary KPIs, category breakdown, spending over time (by period), top write-offs, low stock, active-rentals
- `auditLog.ts` — Paginated audit log — returns `{rows, total, limit, offset}`; restricted to admin/manager roles
- `exportRoutes.ts` — Excel export via xlsx; restricted to admin/manager/accountant roles
- `storage.ts` — Object storage for photo uploads
- `rentals.ts` — Rental tracking: creates rental (decreases stock), mark returned (restores stock), isOverdue computed flag

### RBAC (`artifacts/api-server/src/middleware/rbac.ts`)
- `requireRole(...roles)` middleware using `getAuth(req)` from `@clerk/express`
- Role hierarchy: admin(4) > manager(3) > accountant(2) > warehouse(1)
- Auto-creates user record if not in `usersTable`; first user gets admin role
- Applied to: audit-log (admin/manager), exports (admin/manager/accountant)

### Frontend (`artifacts/m-sklad/src/pages/`)
- `dashboard.tsx` — Recharts BarChart (spending over time) + PieChart (category breakdown) + 4 KPI cards + low stock alerts + top write-offs + active rentals widget (conditionally shown)
- `categories.tsx` — Full CRUD (create/edit/delete) with dialog form
- `items.tsx` — Full CRUD with search, low-stock badge, modal form with category select
- `receipts.tsx` — Goods receiving form with item select, auto-populates price
- `write-offs.tsx` — Write-off form with item/staff/reason selectors (6 predefined reasons)
- `inventory-audits.tsx` — Create audits, view items with system vs actual counts, save/submit
- `staff.tsx` — Full CRUD with active status badge
- `audit-log.tsx` — Paginated table (uses `{rows, total}` from API) of all system actions with action/entity type badges
- `rentals.tsx` — Rental tracking: create dialog (item/qty/renter/dates), status filter tabs, mark returned button, overdue badge, clickable phone links

## Database Schema (`lib/db/src/schema/`)

Tables: `categories`, `items`, `staff`, `receipts`, `writeOffs`, `inventoryAudits`, `auditItems`, `users`, `auditLog`, `rentals`

All numeric values stored as Drizzle `numeric` type (comes back as strings from DB; use `Number()` for calculations).

## Important Notes

- Zod forms use `import { z } from "zod"` (NOT `zod/v4`) for `@hookform/resolvers/zod` compatibility
- Generated API types use `number` for numeric fields; use `as unknown as LocalType[]` when local types differ
- `useListReceipts` and `useListWriteOffs` take `params` as first arg (no `query` key in params) — pass React Query options as second arg
- All update endpoints use PATCH (not PUT) — both backend routes and generated client
- Categories page auto-generates slug from Cyrillic name via transliteration (`useWatch` + `useEffect`)
- `express-augment.d.ts` in `src/types/` augments Express `Request` with `auth?: { userId?, sessionId?, orgId? }`
- OpenAPI spec: `AuditLogListResponse` schema added; `listAuditLog` returns it instead of bare array
- Spending-over-time analytics: `row.period` safely handled via `typeof .toISOString === 'function'` check
- Analytics `spending-over-time`: `DATE_TRUNC` result may be string or Date; handle both cases
- Frontend preview path: `/` (root)
- API base URL: `http://localhost:8080` (configured in `artifacts/m-sklad/src/lib/api.ts` or vite proxy)
