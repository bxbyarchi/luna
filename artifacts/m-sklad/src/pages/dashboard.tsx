import { useState } from "react";
import {
  useGetAnalyticsSummary,
  useGetAnalyticsCategoryBreakdown,
  useGetAnalyticsSpendingOverTime,
  useGetAnalyticsTopWriteOffs,
  useGetAnalyticsLowStock,
  getGetAnalyticsSummaryQueryKey,
  getGetAnalyticsCategoryBreakdownQueryKey,
  getGetAnalyticsSpendingOverTimeQueryKey,
  getGetAnalyticsTopWriteOffsQueryKey,
  getGetAnalyticsLowStockQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const CHART_COLORS = ["hsl(152,69%,31%)", "hsl(20,14%,40%)", "hsl(40,70%,50%)", "hsl(210,70%,50%)", "hsl(0,70%,60%)"];

type Period = "day" | "week" | "month" | "year";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(v);
}

function TrendBadge({ value }: { value: number }) {
  const isUp = value >= 0;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${isUp ? "text-emerald-600 border-emerald-200 bg-emerald-50" : "text-destructive border-destructive/20 bg-destructive/5"}`}>
      {isUp ? <TrendingUp className="h-3 w-3 mr-1 inline" /> : <TrendingDown className="h-3 w-3 mr-1 inline" />}
      {Math.abs(value).toFixed(1)}%
    </Badge>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");

  const { data: summary, isLoading: loadingSummary } = useGetAnalyticsSummary({
    query: { queryKey: getGetAnalyticsSummaryQueryKey() },
  });
  const { data: breakdown, isLoading: loadingBreakdown } = useGetAnalyticsCategoryBreakdown({
    query: { queryKey: getGetAnalyticsCategoryBreakdownQueryKey() },
  });
  const { data: spending, isLoading: loadingSpending } = useGetAnalyticsSpendingOverTime(
    { period },
    { query: { queryKey: getGetAnalyticsSpendingOverTimeQueryKey({ period }) } }
  );
  const { data: topWriteOffs, isLoading: loadingTopWriteOffs } = useGetAnalyticsTopWriteOffs(
    { limit: 8 },
    { query: { queryKey: getGetAnalyticsTopWriteOffsQueryKey({ limit: 8 }) } }
  );
  const { data: lowStock, isLoading: loadingLowStock } = useGetAnalyticsLowStock({
    query: { queryKey: getGetAnalyticsLowStockQueryKey() },
  });

  const handleExportStock = () => { window.open("/api/export/stock", "_blank"); };
  const handleExportWriteOffs = () => { window.open("/api/export/write-offs", "_blank"); };

  const spendingData = (spending ?? []).map((d) => ({
    label: new Date(d.period).toLocaleDateString("ru-RU", { month: "short", day: "numeric" }),
    receipts: d.receipts,
    writeOffs: d.writeOffs,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-dashboard">Командный центр</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Обзор операций и ключевые показатели.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportStock} data-testid="btn-export-stock">
            <Download className="mr-2 h-4 w-4" /> Остатки
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportWriteOffs} data-testid="btn-export-writeoffs">
            <Download className="mr-2 h-4 w-4" /> Списания
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Позиций на складе" value={summary?.totalItems} icon={Package} loading={loadingSummary} data-testid="kpi-total-items" />
        <KpiCard title="Стоимость остатков" value={summary ? formatCurrency(summary.totalStockValue) : undefined} icon={Package} loading={loadingSummary} data-testid="kpi-stock-value" />
        <KpiCard title="Поступления за месяц" value={summary ? formatCurrency(summary.totalReceiptsThisMonth) : undefined} icon={ArrowDownToLine} trend={summary?.receiptsTrend} loading={loadingSummary} data-testid="kpi-receipts-month" />
        <KpiCard title="Списания за месяц" value={summary ? formatCurrency(summary.totalWriteOffsThisMonth) : undefined} icon={ArrowUpFromLine} trend={summary?.writeOffsTrend} loading={loadingSummary} alert={summary ? summary.lowStockCount > 0 : false} data-testid="kpi-writeoffs-month" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Движение товаров</CardTitle>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">По дням</SelectItem>
                  <SelectItem value="week">По неделям</SelectItem>
                  <SelectItem value="month">По месяцам</SelectItem>
                  <SelectItem value="year">По годам</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSpending ? (
              <Skeleton className="h-[240px] w-full" />
            ) : spendingData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">Нет данных за период</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={spendingData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v)]} />
                  <Bar dataKey="receipts" name="Поступления" fill="hsl(152,69%,31%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="writeOffs" name="Списания" fill="hsl(0,70%,60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">По категориям</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBreakdown ? (
              <Skeleton className="h-[240px] w-full" />
            ) : !breakdown?.length ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={breakdown} dataKey="totalValue" nameKey="categoryName" cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {breakdown.map((_: unknown, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), "Стоимость"]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Топ списаний</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTopWriteOffs ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !topWriteOffs?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет данных о списаниях</p>
            ) : (
              <div className="space-y-3">
                {topWriteOffs.map((item) => {
                  const maxVal = topWriteOffs[0]?.totalValue ?? 1;
                  const pct = (item.totalValue / maxVal) * 100;
                  return (
                    <div key={item.itemId} data-testid={`writeoff-top-${item.itemId}`} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium truncate max-w-[180px]">{item.itemName}</span>
                        <span className="text-destructive font-semibold ml-2 shrink-0">{formatCurrency(item.totalValue)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-destructive/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Низкий остаток</CardTitle>
              {summary && summary.lowStockCount > 0 && (
                <Badge variant="destructive" className="text-xs">{summary.lowStockCount}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingLowStock ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !lowStock?.length ? (
              <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground text-sm">
                <Package className="h-8 w-8 opacity-30" />
                Все позиции в норме
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {lowStock.map((item) => (
                  <div key={item.id} data-testid={`lowstock-${item.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/5 border border-destructive/15">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold text-destructive">{item.currentStock} {item.unit}</p>
                      <p className="text-xs text-muted-foreground">мин: {item.minThreshold}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, trend, loading, alert: alertProp, "data-testid": testId }: {
  title: string; value?: string | number; icon: React.ElementType; trend?: number; loading: boolean; alert?: boolean; "data-testid"?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${alertProp ? "text-destructive" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="text-2xl font-bold tracking-tight">{value ?? "—"}</div>
            {trend !== undefined && <TrendBadge value={trend} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
