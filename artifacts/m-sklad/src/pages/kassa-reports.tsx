import { useState } from "react";
import { useGetKassaAnalyticsSummary, useListLocations, getGetKassaAnalyticsSummaryQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { downloadExport } from "@/lib/downloadExport";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, Calendar, Wallet, CreditCard, Undo2 } from "lucide-react";

type Period = "week" | "month" | "custom";

function money(v: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " сом";
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

export default function KassaReports() {
  const { isVenueAdmin } = useCurrentUser();
  const { toast } = useToast();
  const [preset, setPreset] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [downloading, setDownloading] = useState(false);
  const { data: allLocations } = useListLocations();
  const venues = allLocations?.filter((l) => l.isVenue);

  const { from, to } = preset === "custom" ? { from: customFrom, to: customTo } : getPresetDates(preset);
  const canFetch = !!from && !!to;

  const params = { locationId: locationFilter ? Number(locationFilter) : undefined, from: canFetch ? from : undefined, to: canFetch ? to : undefined };
  const { data: summary, isLoading } = useGetKassaAnalyticsSummary(params, { query: { queryKey: getGetKassaAnalyticsSummaryQueryKey(params), enabled: canFetch } });

  async function downloadExcel() {
    setDownloading(true);
    try {
      const q = new URLSearchParams();
      if (locationFilter) q.set("locationId", locationFilter);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      await downloadExport(`/api/export/kassa?${q.toString()}`, `kassa-report-${from}-${to}.xlsx`);
    } catch {
      toast({ title: "Не удалось скачать отчёт", variant: "destructive" });
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
          #print-kassa-report, #print-kassa-report * { visibility: visible !important; }
          #print-kassa-report { position: fixed; inset: 0; padding: 24px; font-size: 11px; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
          th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; }
        }
      `}</style>

      <div className="space-y-6 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-kassa-reports">Отчёты по кассам</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Выручка, возвраты и продажи по ярмарке за период.</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Период отчёта</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {(["week", "month", "custom"] as Period[]).map((p) => (
                <Button key={p} variant={preset === p ? "default" : "outline"} size="sm" onClick={() => setPreset(p)} data-testid={`btn-kassa-preset-${p}`}>
                  {p === "week" ? "За неделю" : p === "month" ? "За месяц" : "Выбрать период"}
                </Button>
              ))}
            </div>

            {preset === "custom" && (
              <div className="flex gap-4 flex-wrap">
                <div><Label className="text-xs mb-1 block">Дата с</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" data-testid="input-kassa-date-from" /></div>
                <div><Label className="text-xs mb-1 block">Дата по</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" data-testid="input-kassa-date-to" /></div>
              </div>
            )}

            {isVenueAdmin && (
              <div>
                <Label className="text-xs mb-1 block">Площадка</Label>
                <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-52" data-testid="select-kassa-report-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все площадки</SelectItem>
                    {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {canFetch && (
              <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                <Button onClick={downloadExcel} disabled={downloading || isLoading || !summary} data-testid="btn-kassa-download-excel" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> {downloading ? "Генерация..." : "Скачать Excel (.xlsx)"}
                </Button>
                <Button variant="outline" onClick={printPDF} disabled={isLoading || !summary} data-testid="btn-kassa-download-pdf" className="gap-2">
                  <FileText className="h-4 w-4" /> Скачать PDF (печать)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>}

        {summary && !isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-emerald-50 border-emerald-200"><CardContent className="pt-4 pb-4">
                <p className="text-xs text-emerald-700 font-medium mb-1 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Наличные</p>
                <p className="text-lg font-bold text-emerald-800">{money(summary.totalSalesCash)}</p>
              </CardContent></Card>
              <Card className="bg-blue-50 border-blue-200"><CardContent className="pt-4 pb-4">
                <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Безнал</p>
                <p className="text-lg font-bold text-blue-800">{money(summary.totalSalesCard)}</p>
              </CardContent></Card>
              <Card className="bg-red-50 border-red-200"><CardContent className="pt-4 pb-4">
                <p className="text-xs text-red-700 font-medium mb-1 flex items-center gap-1"><Undo2 className="h-3.5 w-3.5" /> Возвраты</p>
                <p className="text-lg font-bold text-red-800">{money(summary.totalReturns)}</p>
              </CardContent></Card>
              <Card className="bg-amber-50 border-amber-200"><CardContent className="pt-4 pb-4">
                <p className="text-xs text-amber-700 font-medium mb-1">Чистая выручка</p>
                <p className="text-lg font-bold text-amber-800">{money(summary.netRevenue)}</p>
                <p className="text-xs text-amber-600 mt-0.5">{summary.salesCount} продаж</p>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">По площадкам<Badge variant="secondary" className="ml-auto">{summary.byVenue.length}</Badge></CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Площадка</TableHead><TableHead className="text-right">Продаж</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {!summary.byVenue.length ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow> :
                      summary.byVenue.map((v, i) => <TableRow key={i}><TableCell>{v.locationName}</TableCell><TableCell className="text-right">{v.salesCount}</TableCell><TableCell className="text-right font-medium">{money(v.totalSales)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">По домикам<Badge variant="secondary" className="ml-auto">{summary.byHouse.length}</Badge></CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Домик</TableHead><TableHead className="text-right">Продаж</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {!summary.byHouse.length ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow> :
                      summary.byHouse.map((h) => <TableRow key={h.houseId}><TableCell>{h.houseName}<span className="text-muted-foreground text-xs ml-1.5">{h.locationName}</span></TableCell><TableCell className="text-right">{h.salesCount}</TableCell><TableCell className="text-right font-medium">{money(h.totalSales)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">Топ позиций<Badge variant="secondary" className="ml-auto">{summary.topItems.length}</Badge></CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Товар</TableHead><TableHead className="text-right">Продано</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {!summary.topItems.length ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow> :
                      summary.topItems.map((it, i) => <TableRow key={i}><TableCell>{it.name}</TableCell><TableCell className="text-right">{it.totalQuantity}</TableCell><TableCell className="text-right font-medium">{money(it.totalRevenue)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {summary && (
        <div id="print-kassa-report" style={{ display: "none" }}>
          <h1 style={{ margin: 0 }}>Северное сияние — Отчёт по кассам</h1>
          <p style={{ margin: "2px 0 12px", color: "#666", fontSize: 12 }}>Период: {presetLabel} ({from} — {to})</p>
          <table>
            <thead><tr><th>Показатель</th><th>Значение</th></tr></thead>
            <tbody>
              <tr><td>Наличные</td><td>{money(summary.totalSalesCash)}</td></tr>
              <tr><td>Безнал</td><td>{money(summary.totalSalesCard)}</td></tr>
              <tr><td>Возвраты</td><td>{money(summary.totalReturns)}</td></tr>
              <tr><td>Чистая выручка</td><td>{money(summary.netRevenue)}</td></tr>
              <tr><td>Продаж</td><td>{summary.salesCount}</td></tr>
            </tbody>
          </table>
          <h2>По площадкам</h2>
          <table>
            <thead><tr><th>Площадка</th><th>Продаж</th><th>Выручка</th></tr></thead>
            <tbody>{summary.byVenue.map((v, i) => <tr key={i}><td>{v.locationName}</td><td>{v.salesCount}</td><td>{money(v.totalSales)}</td></tr>)}</tbody>
          </table>
          <h2>Топ позиций</h2>
          <table>
            <thead><tr><th>Товар</th><th>Продано</th><th>Выручка</th></tr></thead>
            <tbody>{summary.topItems.map((it, i) => <tr key={i}><td>{it.name}</td><td>{it.totalQuantity}</td><td>{money(it.totalRevenue)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
