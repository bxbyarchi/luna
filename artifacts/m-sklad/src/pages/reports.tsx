import { useState, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import AccessDenied from "@/components/AccessDenied";
import { useListCategories } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  KeyRound,
  Filter,
} from "lucide-react";

const API = "/api";

type Period = "week" | "month" | "custom";

interface ReportData {
  period: { from: string | null; to: string | null };
  stock: {
    name: string; category: string; unit: string;
    currentStock: number; pricePerUnit: number; totalValue: number;
  }[];
  receipts: {
    date: string; itemName: string; unit: string;
    quantity: number; pricePerUnit: number; totalCost: number; supplier: string;
  }[];
  writeOffs: {
    date: string; itemName: string; unit: string;
    quantity: number; totalValue: number; reason: string; staffName: string;
  }[];
  rentals: {
    itemName: string; unit: string; quantity: number;
    renterName: string; renterPhone: string;
    issuedAt: string; plannedReturnAt: string; returnedAt: string; status: string;
  }[];
  summary: {
    totalStockValue: number;
    totalReceipts: number;
    totalWriteOffs: number;
    activeRentals: number;
  };
}

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " сом";
}

function getPresetDates(preset: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (preset === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString().slice(0, 10), to };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { from, to };
}

export default function Reports() {
  const { getToken } = useAuth();
  const { canDo, isLoading: roleLoading } = useCurrentUser();
  const [preset, setPreset] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [downloading, setDownloading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: categories } = useListCategories();

  if (!roleLoading && !canDo("admin")) {
    return <AccessDenied />;
  }

  const { from, to } = preset === "custom"
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const canFetch = !!from && !!to;
  const catParam = categoryId !== "all" ? `&categoryId=${categoryId}` : "";
  const selectedCat = categories?.find((c) => String(c.id) === categoryId);
  const categoryLabel = selectedCat ? selectedCat.name : "Общий отчёт";

  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ["report-full", from, to, categoryId],
    enabled: canFetch,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${API}/reports/full?from=${from}&to=${to}&format=json${catParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Ошибка загрузки отчёта");
      return res.json();
    },
  });

  async function downloadExcel() {
    setDownloading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API}/reports/full?from=${from}&to=${to}&format=xlsx${catParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Ошибка генерации Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `msklad-report-${categoryId !== "all" ? categoryId + "-" : ""}${from}-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function printPDF() {
    window.print();
  }

  const presetLabel =
    preset === "week" ? "за последние 7 дней"
    : preset === "month" ? `за ${new Date().toLocaleString("ru-RU", { month: "long", year: "numeric" })}`
    : from && to ? `${from} — ${to}` : "";

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-report, #print-report * { visibility: visible !important; }
          #print-report { position: fixed; inset: 0; padding: 24px; font-size: 11px; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
          th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          h2 { font-size: 13px; margin: 12px 0 4px; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
          .summary-card { border: 1px solid #ccc; padding: 8px 12px; border-radius: 4px; }
        }
      `}</style>

      <div className="space-y-6 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-reports">Отчёты</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Сводный отчёт по складу, движению товаров и аренде.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Период отчёта
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {(["week", "month", "custom"] as Period[]).map((p) => (
                <Button
                  key={p}
                  variant={preset === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreset(p)}
                  data-testid={`btn-preset-${p}`}
                >
                  {p === "week" ? "За неделю" : p === "month" ? "За месяц" : "Выбрать период"}
                </Button>
              ))}
            </div>

            {preset === "custom" && (
              <div className="flex gap-4 flex-wrap">
                <div>
                  <Label className="text-xs mb-1 block">Дата с</Label>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                    data-testid="input-date-from"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Дата по</Label>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                    data-testid="input-date-to"
                  />
                </div>
              </div>
            )}

            <div className="flex items-end gap-3 flex-wrap pt-1">
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Категория
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId} data-testid="select-category">
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Общий отчёт" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Общий отчёт</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {canFetch && (
              <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                <Button
                  onClick={downloadExcel}
                  disabled={downloading || isLoading || !data}
                  data-testid="btn-download-excel"
                  className="gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {downloading ? "Генерация..." : "Скачать Excel (.xlsx)"}
                </Button>
                <Button
                  variant="outline"
                  onClick={printPDF}
                  disabled={isLoading || !data}
                  data-testid="btn-download-pdf"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Скачать PDF (печать)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        )}

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-destructive text-sm">
              Ошибка загрузки отчёта. Попробуйте ещё раз.
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-emerald-700 font-medium mb-1 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Стоимость склада
                  </p>
                  <p className="text-lg font-bold text-emerald-800">{fmt(data.summary.totalStockValue)}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">{data.stock.length} позиций</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Поступления
                  </p>
                  <p className="text-lg font-bold text-blue-800">{fmt(data.summary.totalReceipts)}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{data.receipts.length} операций</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50 border-red-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-red-700 font-medium mb-1 flex items-center gap-1">
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Списания
                  </p>
                  <p className="text-lg font-bold text-red-800">{fmt(data.summary.totalWriteOffs)}</p>
                  <p className="text-xs text-red-600 mt-0.5">{data.writeOffs.length} операций</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-amber-700 font-medium mb-1 flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" /> Активных аренд
                  </p>
                  <p className="text-lg font-bold text-amber-800">{data.summary.activeRentals}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{data.rentals.length} всего за период</p>
                </CardContent>
              </Card>
            </div>

            <ReportSection
              title="Остатки на складе"
              icon={<Package className="h-4 w-4" />}
              count={data.stock.length}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium">Наименование</th>
                    <th className="text-left py-2 px-3 font-medium">Категория</th>
                    <th className="text-right py-2 px-3 font-medium">Остаток</th>
                    <th className="text-right py-2 px-3 font-medium">Цена</th>
                    <th className="text-right py-2 px-3 font-medium">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">{r.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.category}</td>
                      <td className="py-2 px-3 text-right">{r.currentStock} {r.unit}</td>
                      <td className="py-2 px-3 text-right">{r.pricePerUnit.toFixed(2)} сом</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-700">{r.totalValue.toFixed(2)} сом</td>
                    </tr>
                  ))}
                  {data.stock.length === 0 && <EmptyRow cols={5} />}
                </tbody>
              </table>
            </ReportSection>

            <ReportSection
              title="Поступления"
              icon={<ArrowDownToLine className="h-4 w-4 text-blue-600" />}
              count={data.receipts.length}
              period={presetLabel}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium">Дата</th>
                    <th className="text-left py-2 px-3 font-medium">Позиция</th>
                    <th className="text-right py-2 px-3 font-medium">Кол-во</th>
                    <th className="text-right py-2 px-3 font-medium">Цена за ед.</th>
                    <th className="text-right py-2 px-3 font-medium">Сумма</th>
                    <th className="text-left py-2 px-3 font-medium">Поставщик</th>
                  </tr>
                </thead>
                <tbody>
                  {data.receipts.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground">{r.date}</td>
                      <td className="py-2 px-3 font-medium">{r.itemName}</td>
                      <td className="py-2 px-3 text-right">{r.quantity} {r.unit}</td>
                      <td className="py-2 px-3 text-right">{r.pricePerUnit.toFixed(2)} сом</td>
                      <td className="py-2 px-3 text-right font-semibold text-blue-700">{r.totalCost.toFixed(2)} сом</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.supplier}</td>
                    </tr>
                  ))}
                  {data.receipts.length === 0 && <EmptyRow cols={6} text="Нет поступлений за период" />}
                </tbody>
              </table>
            </ReportSection>

            <ReportSection
              title="Списания"
              icon={<ArrowUpFromLine className="h-4 w-4 text-red-600" />}
              count={data.writeOffs.length}
              period={presetLabel}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium">Дата</th>
                    <th className="text-left py-2 px-3 font-medium">Позиция</th>
                    <th className="text-right py-2 px-3 font-medium">Кол-во</th>
                    <th className="text-right py-2 px-3 font-medium">Сумма</th>
                    <th className="text-left py-2 px-3 font-medium">Причина</th>
                    <th className="text-left py-2 px-3 font-medium">Сотрудник</th>
                  </tr>
                </thead>
                <tbody>
                  {data.writeOffs.map((r, i) => (
                    <tr key={i} className={`border-b border-border last:border-0 hover:bg-muted/20${r.reason === "Хозяйственные нужды" ? " bg-orange-50/50" : ""}`}>
                      <td className="py-2 px-3 text-muted-foreground">{r.date}</td>
                      <td className="py-2 px-3 font-medium">{r.itemName}</td>
                      <td className="py-2 px-3 text-right">{r.quantity} {r.unit}</td>
                      <td className="py-2 px-3 text-right font-semibold text-red-700">{r.totalValue.toFixed(2)} сом</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.reason}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.staffName}</td>
                    </tr>
                  ))}
                  {data.writeOffs.length === 0 && <EmptyRow cols={6} text="Нет списаний за период" />}
                </tbody>
              </table>
              {(() => {
                const hozkaTotal = data.writeOffs
                  .filter((r) => r.reason === "Хозяйственные нужды")
                  .reduce((sum, r) => sum + r.totalValue, 0);
                if (hozkaTotal <= 0) return null;
                return (
                  <div className="mt-3 flex items-center justify-between rounded-md border border-orange-200 bg-orange-50 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
                      🧹 Хозяйственные нужды за период
                    </div>
                    <div className="text-sm font-bold text-orange-900">
                      −{fmt(hozkaTotal)}
                    </div>
                  </div>
                );
              })()}
            </ReportSection>

            <ReportSection
              title="Аренда"
              icon={<KeyRound className="h-4 w-4 text-amber-600" />}
              count={data.rentals.length}
              period={presetLabel}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium">Позиция</th>
                    <th className="text-left py-2 px-3 font-medium">Арендатор</th>
                    <th className="text-left py-2 px-3 font-medium">Телефон</th>
                    <th className="text-right py-2 px-3 font-medium">Кол-во</th>
                    <th className="text-left py-2 px-3 font-medium">Выдано</th>
                    <th className="text-left py-2 px-3 font-medium">Возврат (план)</th>
                    <th className="text-left py-2 px-3 font-medium">Возвращено</th>
                    <th className="text-left py-2 px-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rentals.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">{r.itemName}</td>
                      <td className="py-2 px-3">{r.renterName}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.renterPhone}</td>
                      <td className="py-2 px-3 text-right">{r.quantity} {r.unit}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.issuedAt}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.plannedReturnAt}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.returnedAt || "—"}</td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={r.status === "Активна"
                            ? "text-blue-700 border-blue-300 bg-blue-50"
                            : "text-emerald-700 border-emerald-300 bg-emerald-50"}
                        >
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {data.rentals.length === 0 && <EmptyRow cols={8} text="Нет аренд за период" />}
                </tbody>
              </table>
            </ReportSection>
          </div>
        )}
      </div>

      {data && (
        <div id="print-report" ref={printRef} style={{ display: "none" }}>
          <style>{`
            @media print { #print-report { display: block !important; } }
          `}</style>
          <h1 style={{ margin: 0 }}>M-Sklad — Сводный отчёт{categoryId !== "all" ? `: ${categoryLabel}` : ""}</h1>
          <p style={{ margin: "2px 0 12px", color: "#666", fontSize: 12 }}>
            Период: {from} — {to} &nbsp;|&nbsp; Сформирован: {new Date().toLocaleDateString("ru-RU")}
          </p>

          <div className="summary-grid" style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <SummaryItem label="Стоимость склада" value={fmt(data.summary.totalStockValue)} />
            <SummaryItem label="Итого поступления" value={fmt(data.summary.totalReceipts)} />
            <SummaryItem label="Итого списания" value={fmt(data.summary.totalWriteOffs)} />
            <SummaryItem label="Активных аренд" value={String(data.summary.activeRentals)} />
          </div>

          <PrintTable
            title="Остатки на складе"
            headers={["Наименование", "Категория", "Ед.", "Остаток", "Цена (сом)", "Сумма (сом)"]}
            rows={data.stock.map((r) => [
              r.name, r.category, r.unit,
              String(r.currentStock), r.pricePerUnit.toFixed(2), r.totalValue.toFixed(2),
            ])}
          />

          <PrintTable
            title={`Поступления (${presetLabel})`}
            headers={["Дата", "Позиция", "Кол-во", "Цена (сом)", "Сумма (сом)", "Поставщик"]}
            rows={data.receipts.map((r) => [
              r.date, r.itemName, `${r.quantity} ${r.unit}`,
              r.pricePerUnit.toFixed(2), r.totalCost.toFixed(2), r.supplier,
            ])}
            empty="Нет поступлений за период"
          />

          <PrintTable
            title={`Списания (${presetLabel})`}
            headers={["Дата", "Позиция", "Кол-во", "Сумма (сом)", "Причина", "Сотрудник"]}
            rows={data.writeOffs.map((r) => [
              r.date, r.itemName, `${r.quantity} ${r.unit}`,
              r.totalValue.toFixed(2), r.reason, r.staffName,
            ])}
            empty="Нет списаний за период"
          />

          <PrintTable
            title={`Аренда (${presetLabel})`}
            headers={["Позиция", "Арендатор", "Телефон", "Кол-во", "Выдано", "Возврат (план)", "Возвращено", "Статус"]}
            rows={data.rentals.map((r) => [
              r.itemName, r.renterName, r.renterPhone,
              `${r.quantity} ${r.unit}`, r.issuedAt, r.plannedReturnAt,
              r.returnedAt || "—", r.status,
            ])}
            empty="Нет аренд за период"
          />

          <p style={{ marginTop: 24, fontSize: 10, color: "#aaa", borderTop: "1px solid #eee", paddingTop: 8 }}>
            M-Sklad • Автоматически сформированный отчёт
          </p>
        </div>
      )}
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "6px 12px", minWidth: 160 }}>
      <div style={{ fontSize: 10, color: "#666" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function PrintTable({
  title, headers, rows, empty,
}: {
  title: string; headers: string[]; rows: string[][]; empty?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: "12px 0 4px", fontSize: 13, fontWeight: 700 }}>{title}</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 10 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "3px 6px", background: "#f0f0f0", textAlign: "left" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ border: "1px solid #ccc", padding: "3px 6px", color: "#aaa", textAlign: "center" }}>
                {empty ?? "Нет данных"}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportSection({
  title, icon, count, period, children,
}: {
  title: string; icon: React.ReactNode; count: number; period?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="ml-auto">{count}</Badge>
          {period && <span className="text-xs text-muted-foreground font-normal">{period}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyRow({ cols, text = "Нет данных" }: { cols: number; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-muted-foreground text-sm">{text}</td>
    </tr>
  );
}
