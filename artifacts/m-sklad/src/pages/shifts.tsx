import { useState } from "react";
import {
  useListShifts, useOpenShift, useCloseShift, useCreateSale, useCreateReturn,
  useListSales, useListRegisters, useListLocations, useGetSale,
  getListShiftsQueryKey, getListSalesQueryKey, getGetSaleQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Lock, Unlock, Trash2, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const openSchema = z.object({
  registerId: z.string().min(1, "Касса обязательна"),
  cashierName: z.string().min(1, "Имя кассира обязательно"),
  openingCash: z.string().optional(),
});
type OpenFormData = z.infer<typeof openSchema>;

const closeSchema = z.object({
  closingCashCounted: z.string().min(1, "Укажите сумму по факту"),
  notes: z.string().optional(),
});
type CloseFormData = z.infer<typeof closeSchema>;

type ShiftRow = {
  id: number; registerId: number; registerName: string; houseName: string; locationName?: string | null;
  cashierName: string; status: "open" | "closed"; openingCash: string;
  closingCashCounted?: string | null; expectedCash?: string | null; cashDifference?: string | null;
  totalSalesCash: string; totalSalesCard: string; totalReturns: string;
  openedAt: string; closedAt?: string | null;
};

type CartItem = { name: string; quantity: string; pricePerUnit: string };

function money(v: string | number) {
  return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " сом";
}

export default function Shifts() {
  const { canDo } = useCurrentUser();
  const isAdmin = canDo("admin");
  const [locationFilter, setLocationFilter] = useState("");
  const listParams = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: shifts, isLoading } = useListShifts(listParams, { query: { queryKey: getListShiftsQueryKey(listParams) } });
  const { data: registers } = useListRegisters();
  const { data: allLocations } = useListLocations();
  const venues = allLocations?.filter((l) => l.isVenue);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [workingShift, setWorkingShift] = useState<ShiftRow | null>(null);

  const openShift = useOpenShift();
  const closeShift = useCloseShift();

  const openForm = useForm<OpenFormData>({ resolver: zodResolver(openSchema), defaultValues: { registerId: "", cashierName: "", openingCash: "0" } });

  function submitOpen(data: OpenFormData) {
    openShift.mutate({ data: { registerId: Number(data.registerId), cashierName: data.cashierName, openingCash: Number(data.openingCash || 0) } }, {
      onSuccess: () => {
        toast({ title: "Смена открыта" });
        queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() });
        setOpenDialogOpen(false);
        openForm.reset({ registerId: "", cashierName: "", openingCash: "0" });
      },
      onError: (e: unknown) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Смены</h1>
          <p className="text-muted-foreground text-sm">Открытие, работа и закрытие кассовых смен.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-shift-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все площадки</SelectItem>
                {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setOpenDialogOpen(true)} data-testid="btn-open-shift">
            <Plus className="mr-2 h-4 w-4" /> Открыть смену
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Касса</TableHead>
                <TableHead>Кассир</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Наличные</TableHead>
                <TableHead className="text-right">Безнал</TableHead>
                <TableHead className="text-right">Возвраты</TableHead>
                <TableHead className="text-right">Расхождение</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !shifts?.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Нет смен</TableCell></TableRow>
              ) : (
                (shifts as ShiftRow[]).map((s) => (
                  <TableRow key={s.id} data-testid={`row-shift-${s.id}`}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.registerName}
                      <span className="text-xs text-muted-foreground">{s.houseName}{s.locationName ? ` · ${s.locationName}` : ""}</span>
                    </TableCell>
                    <TableCell>{s.cashierName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.status === "open" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>
                        {s.status === "open" ? "Открыта" : "Закрыта"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{money(s.totalSalesCash)}</TableCell>
                    <TableCell className="text-right">{money(s.totalSalesCard)}</TableCell>
                    <TableCell className="text-right">{money(s.totalReturns)}</TableCell>
                    <TableCell className="text-right">
                      {s.cashDifference != null ? (
                        <span className={Number(s.cashDifference) === 0 ? "text-emerald-700" : "text-destructive font-medium"}>{money(s.cashDifference)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setWorkingShift(s)} data-testid={`btn-work-shift-${s.id}`}>
                        {s.status === "open" ? <Unlock className="mr-1.5 h-3.5 w-3.5" /> : <Lock className="mr-1.5 h-3.5 w-3.5" />}
                        {s.status === "open" ? "Работать" : "Просмотр"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Открыть смену</DialogTitle></DialogHeader>
          <Form {...openForm}>
            <form onSubmit={openForm.handleSubmit(submitOpen)} className="space-y-4">
              <FormField control={openForm.control} name="registerId" render={({ field }) => (
                <FormItem><FormLabel>Касса *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-open-register"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {registers?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name} — {r.houseName}{r.locationName ? ` (${r.locationName})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <FormField control={openForm.control} name="cashierName" render={({ field }) => (
                <FormItem><FormLabel>Кассир *</FormLabel><FormControl><Input placeholder="Имя кассира" {...field} data-testid="input-cashier-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={openForm.control} name="openingCash" render={({ field }) => (
                <FormItem><FormLabel>Наличные в кассе на старте (сом)</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-opening-cash" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpenDialogOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={openShift.isPending} data-testid="btn-submit-open-shift">Открыть</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {workingShift && (
        <ShiftWorkSheet
          shift={workingShift}
          onClose={() => setWorkingShift(null)}
          onClosedShift={() => { setWorkingShift(null); queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() }); }}
        />
      )}
    </div>
  );
}

function ShiftWorkSheet({ shift, onClose, onClosedShift }: { shift: ShiftRow; onClose: () => void; onClosedShift: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const salesParams = { shiftId: shift.id };
  const { data: sales, isLoading: loadingSales } = useListSales(salesParams, { query: { queryKey: getListSalesQueryKey(salesParams) } });
  const createSale = useCreateSale();
  const closeShift = useCloseShift();

  const [cart, setCart] = useState<CartItem[]>([{ name: "", quantity: "1", pricePerUnit: "" }]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [zReport, setZReport] = useState<ShiftRow | null>(null);

  const closeForm = useForm<CloseFormData>({ resolver: zodResolver(closeSchema), defaultValues: { closingCashCounted: "", notes: "" } });

  function updateCartRow(idx: number, field: keyof CartItem, value: string) {
    setCart((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }
  function addCartRow() { setCart((prev) => [...prev, { name: "", quantity: "1", pricePerUnit: "" }]); }
  function removeCartRow(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)); }
  const cartTotal = cart.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.pricePerUnit) || 0), 0);

  function submitSale() {
    const items = cart.filter((r) => r.name.trim() && Number(r.quantity) > 0 && Number(r.pricePerUnit) >= 0)
      .map((r) => ({ name: r.name.trim(), quantity: Number(r.quantity), pricePerUnit: Number(r.pricePerUnit) }));
    if (!items.length) { toast({ title: "Добавьте хотя бы одну позицию", variant: "destructive" }); return; }
    createSale.mutate({ data: { shiftId: shift.id, paymentMethod, items } }, {
      onSuccess: () => {
        toast({ title: "Продажа оформлена" });
        setCart([{ name: "", quantity: "1", pricePerUnit: "" }]);
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey(salesParams) });
        queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  function submitClose(data: CloseFormData) {
    closeShift.mutate({ id: shift.id, data: { closingCashCounted: Number(data.closingCashCounted), notes: data.notes } }, {
      onSuccess: (updated) => {
        toast({ title: "Смена закрыта" });
        setZReport(updated as unknown as ShiftRow);
        setCloseDialogOpen(false);
      },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{shift.registerName} — {shift.houseName}{shift.locationName ? ` · ${shift.locationName}` : ""}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs">Кассир</div><div className="font-medium">{shift.cashierName}</div></div>
            <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs">На старте</div><div className="font-medium">{money(shift.openingCash)}</div></div>
            <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs">Наличные продажи</div><div className="font-medium">{money(shift.totalSalesCash)}</div></div>
            <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs">Безнал продажи</div><div className="font-medium">{money(shift.totalSalesCard)}</div></div>
          </div>

          {zReport && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1 text-sm">
              <div className="font-semibold mb-2">Z-отчёт</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ожидалось в кассе</span><span>{money(zReport.expectedCash ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">По факту</span><span>{money(zReport.closingCashCounted ?? 0)}</span></div>
              <div className="flex justify-between font-medium"><span>Расхождение</span><span className={Number(zReport.cashDifference) === 0 ? "text-emerald-700" : "text-destructive"}>{money(zReport.cashDifference ?? 0)}</span></div>
            </div>
          )}

          {shift.status === "open" && !zReport && (
            <div className="space-y-3">
              <div className="font-semibold text-sm">Новая продажа</div>
              {cart.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input placeholder="Товар (напр. Трдельник)" value={row.name} onChange={(e) => updateCartRow(idx, "name", e.target.value)} className="flex-1" data-testid={`input-cart-name-${idx}`} />
                  <Input placeholder="Кол-во" type="number" step="0.001" value={row.quantity} onChange={(e) => updateCartRow(idx, "quantity", e.target.value)} className="w-20" data-testid={`input-cart-qty-${idx}`} />
                  <Input placeholder="Цена" type="number" step="0.01" value={row.pricePerUnit} onChange={(e) => updateCartRow(idx, "pricePerUnit", e.target.value)} className="w-24" data-testid={`input-cart-price-${idx}`} />
                  <Button variant="ghost" size="icon" onClick={() => removeCartRow(idx)} disabled={cart.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCartRow}><Plus className="mr-1.5 h-3.5 w-3.5" /> Ещё позиция</Button>
              <div className="flex items-center justify-between pt-2">
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "card")}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cash">Наличные</SelectItem><SelectItem value="card">Безнал</SelectItem></SelectContent>
                </Select>
                <div className="font-semibold">Итого: {money(cartTotal)}</div>
              </div>
              <Button className="w-full" onClick={submitSale} disabled={createSale.isPending} data-testid="btn-submit-sale">Оформить продажу</Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="font-semibold text-sm">Продажи смены</div>
            {loadingSales ? <p className="text-sm text-muted-foreground">Загрузка...</p> : !sales?.length ? (
              <p className="text-sm text-muted-foreground">Пока нет продаж</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {sales.map((s) => (
                  <SaleRow key={s.id} sale={s} shiftId={shift.id} canReturn={shift.status === "open"} />
                ))}
              </div>
            )}
          </div>

          {shift.status === "open" && !zReport && (
            <Button variant="destructive" className="w-full" onClick={() => setCloseDialogOpen(true)} data-testid="btn-close-shift">
              <Lock className="mr-2 h-4 w-4" /> Закрыть смену
            </Button>
          )}
          {zReport && <Button className="w-full" onClick={onClosedShift}>Готово</Button>}
        </div>
      </SheetContent>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Закрыть смену</DialogTitle></DialogHeader>
          <Form {...closeForm}>
            <form onSubmit={closeForm.handleSubmit(submitClose)} className="space-y-4">
              <p className="text-sm text-muted-foreground">Ожидается в кассе: {money(Number(shift.openingCash) + Number(shift.totalSalesCash) - Number(shift.totalReturns))}</p>
              <FormField control={closeForm.control} name="closingCashCounted" render={({ field }) => (
                <FormItem><FormLabel>Наличные по факту (сом) *</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-closing-cash" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={closeForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Необязательно" {...field} data-testid="input-close-notes" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCloseDialogOpen(false)}>Отмена</Button>
                <Button type="submit" variant="destructive" disabled={closeShift.isPending} data-testid="btn-submit-close">Закрыть смену</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function SaleRow({ sale, shiftId, canReturn }: { sale: { id: number; totalAmount: string; paymentMethod: string; status: string; createdAt: string }; shiftId: number; canReturn: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useGetSale(sale.id, { query: { queryKey: getGetSaleQueryKey(sale.id), enabled: expanded } });
  const createReturn = useCreateReturn();

  function returnItem(saleItemId: number, quantity: number, name: string) {
    if (!confirm(`Вернуть «${name}» (${quantity} шт)?`)) return;
    createReturn.mutate({ id: sale.id, data: { items: [{ saleItemId, quantity }], reason: "Возврат" } }, {
      onSuccess: () => {
        toast({ title: "Возврат оформлен" });
        queryClient.invalidateQueries({ queryKey: getListSalesQueryKey({ shiftId }) });
        queryClient.invalidateQueries({ queryKey: getGetSaleQueryKey(sale.id) });
        queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      },
      onError: (e: unknown) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
    });
  }

  const statusLabel = sale.status === "completed" ? "Оплачена" : sale.status === "returned" ? "Возвращена" : "Частичный возврат";

  return (
    <div className="rounded-md border border-border p-2 text-sm">
      <button type="button" className="w-full flex items-center justify-between" onClick={() => setExpanded((v) => !v)} data-testid={`btn-expand-sale-${sale.id}`}>
        <span>{new Date(sale.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {sale.paymentMethod === "cash" ? "Наличные" : "Безнал"}</span>
        <span className="flex items-center gap-2">
          <Badge variant="outline" className={sale.status === "completed" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>{statusLabel}</Badge>
          <span className="font-medium">{money(sale.totalAmount)}</span>
        </span>
      </button>
      {expanded && detail && "items" in detail && (
        <div className="mt-2 space-y-1 pl-2 border-l-2 border-border">
          {(detail.items as Array<{ id: number; name: string; quantity: string; pricePerUnit: string; returnedQuantity: string }>).map((it) => {
            const available = Number(it.quantity) - Number(it.returnedQuantity);
            return (
              <div key={it.id} className="flex items-center justify-between text-xs">
                <span>{it.name} × {it.quantity} {Number(it.returnedQuantity) > 0 ? `(возвр. ${it.returnedQuantity})` : ""}</span>
                <span className="flex items-center gap-2">
                  <span>{money(Number(it.quantity) * Number(it.pricePerUnit))}</span>
                  {canReturn && available > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => returnItem(it.id, available, it.name)} data-testid={`btn-return-${it.id}`}>Вернуть</Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
