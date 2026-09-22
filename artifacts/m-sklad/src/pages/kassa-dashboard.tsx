import { useState } from "react";
import {
  useGetKassaAnalyticsSummary, useListLocations,
  getGetKassaAnalyticsSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Wallet, CreditCard, Undo2, Unlock } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function money(v: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " сом";
}

export default function KassaDashboard() {
  const { canDo } = useCurrentUser();
  const isAdmin = canDo("admin");
  const [locationFilter, setLocationFilter] = useState("");
  const { data: allLocations } = useListLocations();
  const venues = allLocations?.filter((l) => l.isVenue);

  const params = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: summary, isLoading } = useGetKassaAnalyticsSummary(params, { query: { queryKey: getGetKassaAnalyticsSummaryQueryKey(params) } });

  function handleExport() {
    const q = new URLSearchParams();
    if (locationFilter) q.set("locationId", locationFilter);
    window.open(`/api/export/kassa?${q.toString()}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Аналитика касс</h1>
          <p className="text-muted-foreground text-sm">Продажи, возвраты и выручка по ярмарке.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-kassa-dashboard-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все площадки</SelectItem>
                {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={handleExport} data-testid="btn-export-kassa"><Download className="mr-2 h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {isLoading || !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Wallet className="h-3.5 w-3.5" />Наличные</div><div className="text-xl font-bold">{money(summary.totalSalesCash)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CreditCard className="h-3.5 w-3.5" />Безнал</div><div className="text-xl font-bold">{money(summary.totalSalesCard)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Undo2 className="h-3.5 w-3.5" />Возвраты</div><div className="text-xl font-bold text-destructive">{money(summary.totalReturns)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground mb-1">Чистая выручка</div><div className="text-xl font-bold text-emerald-700">{money(summary.netRevenue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Unlock className="h-3.5 w-3.5" />Открытых смен</div><div className="text-xl font-bold">{summary.openShiftsCount}</div></CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">По площадкам</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Площадка</TableHead><TableHead className="text-right">Продаж</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
              <TableBody>
                {!summary?.byVenue.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow>
                ) : summary.byVenue.map((v, i) => (
                  <TableRow key={i}><TableCell>{v.locationName}</TableCell><TableCell className="text-right">{v.salesCount}</TableCell><TableCell className="text-right font-medium">{money(v.totalSales)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">По домикам</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Домик</TableHead><TableHead className="text-right">Продаж</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
              <TableBody>
                {!summary?.byHouse.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow>
                ) : summary.byHouse.map((h) => (
                  <TableRow key={h.houseId}><TableCell>{h.houseName}<span className="text-muted-foreground text-xs ml-1.5">{h.locationName}</span></TableCell><TableCell className="text-right">{h.salesCount}</TableCell><TableCell className="text-right font-medium">{money(h.totalSales)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Топ позиций</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Товар</TableHead><TableHead className="text-right">Продано</TableHead><TableHead className="text-right">Выручка</TableHead></TableRow></TableHeader>
            <TableBody>
              {!summary?.topItems.length ? (
                <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Нет данных</TableCell></TableRow>
              ) : summary.topItems.map((it, i) => (
                <TableRow key={i}><TableCell>{it.name}</TableCell><TableCell className="text-right">{it.totalQuantity}</TableCell><TableCell className="text-right font-medium">{money(it.totalRevenue)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
