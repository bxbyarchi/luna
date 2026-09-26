import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import {
  useListShifts, useOpenShift, useCloseShift, useCreateSale, useCreateReturn,
  useListSales, useListRegisters, useListLocations, useGetSale,
  useListProducts, useListCashMovements, useCreateCashMovement,
  getListShiftsQueryKey, getListSalesQueryKey, getGetSaleQueryKey, getListCashMovementsQueryKey, getListProductsQueryKey,
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
import { Plus, Lock, Unlock, Trash2, Landmark, Minus, Wallet, ArrowDownToLine, ArrowUpFromLine, Percent, ChevronLeft, Receipt, Printer } from "lucide-react";
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

const movementSchema = z.object({
  type: z.enum(["collection", "deposit"]),
  amount: z.string().min(1, "Укажите сумму"),
  note: z.string().optional(),
});
type MovementFormData = z.infer<typeof movementSchema>;

type ShiftRow = {
  id: number; registerId: number; houseId?: number; registerName: string; houseName: string; locationName?: string | null;
  cashierName: string; status: "open" | "closed"; openingCash: string;
  closingCashCounted?: string | null; expectedCash?: string | null; cashDifference?: string | null;
  totalSalesCash: string; totalSalesCard: string; totalReturns: string;
  totalCollected: string; totalDeposited: string;
  openedAt: string; closedAt?: string | null;
};

type ProductRow = { id: number; houseId: number; category: string; name: string; price: string; isActive: boolean; sortOrder: number };
type CartItem = { productId?: number; name: string; quantity: string; pricePerUnit: string };

type ReceiptData = {
  saleId: number;
  createdAt: string;
  cashierName: string;
  registerName: string;
  houseName: string;
  paymentMethod: "cash" | "card";
  items: Array<{ name: string; quantity: number; pricePerUnit: number }>;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
};

function money(v: string | number) {
  return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " сом";
}

export default function Shifts() {
  const { isVenueAdmin } = useCurrentUser();
  const isAdmin = isVenueAdmin;
  const searchString = useSearch();
  const presetRegisterId = new URLSearchParams(searchString).get("registerId") ?? "";
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
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);

  const openShift = useOpenShift();
  const closeShift = useCloseShift();

  const openForm = useForm<OpenFormData>({ resolver: zodResolver(openSchema), defaultValues: { registerId: "", cashierName: "", openingCash: "0" } });

  useEffect(() => {
    if (!presetRegisterId || !shifts || autoOpenedFor === presetRegisterId) return;
    setAutoOpenedFor(presetRegisterId);
    const openShiftForRegister = (shifts as ShiftRow[]).find((s) => s.registerId === Number(presetRegisterId) && s.status === "open");
    if (openShiftForRegister) {
      setWorkingShift(openShiftForRegister);
    } else {
      openForm.reset({ registerId: presetRegisterId, cashierName: "", openingCash: "0" });
      setOpenDialogOpen(true);
    }
  }, [presetRegisterId, shifts, autoOpenedFor, openForm]);

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
  const productsParams = { houseId: shift.houseId ?? 0 };
  const { data: products } = useListProducts(productsParams, { query: { queryKey: getListProductsQueryKey(productsParams), enabled: !!shift.houseId } });
  const { data: movements } = useListCashMovements(shift.id, { query: { queryKey: getListCashMovementsQueryKey(shift.id) } });
  const createSale = useCreateSale();
  const closeShift = useCloseShift();
  const createMovement = useCreateCashMovement();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRow, setManualRow] = useState<CartItem>({ name: "", quantity: "1", pricePerUnit: "" });
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [zReport, setZReport] = useState<ShiftRow | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const closeForm = useForm<CloseFormData>({ resolver: zodResolver(closeSchema), defaultValues: { closingCashCounted: "", notes: "" } });
  const movementForm = useForm<MovementFormData>({ resolver: zodResolver(movementSchema), defaultValues: { type: "collection", amount: "", note: "" } });

  const productsByCategory = (products as ProductRow[] | undefined)?.reduce<Record<string, ProductRow[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {}) ?? {};

  function addProductToCart(p: ProductRow) {
    setCart((prev) => {
      const existing = prev.find((r) => r.productId === p.id);
      if (existing) return prev.map((r) => (r.productId === p.id ? { ...r, quantity: String(Number(r.quantity) + 1) } : r));
      return [...prev, { productId: p.id, name: p.name, quantity: "1", pricePerUnit: p.price }];
    });
  }
  function changeCartQty(idx: number, delta: number) {
    setCart((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = Math.max(0, Number(r.quantity) + delta);
      return { ...r, quantity: String(next) };
    }).filter((r) => Number(r.quantity) > 0));
  }
  function removeCartRow(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)); }
  function addManualRow() {
    if (!manualRow.name.trim() || !(Number(manualRow.quantity) > 0) || !(Number(manualRow.pricePerUnit) >= 0)) {
      toast({ title: "Заполните название, количество и цену", variant: "destructive" });
      return;
    }
    setCart((prev) => [...prev, { name: manualRow.name.trim(), quantity: manualRow.quantity, pricePerUnit: manualRow.pricePerUnit }]);
    setManualRow({ name: "", quantity: "1", pricePerUnit: "" });
    setManualOpen(false);
  }

  const cartSubtotal = cart.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.pricePerUnit) || 0), 0);
  const discPct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = cartSubtotal * (discPct / 100);
  const cartTotal = cartSubtotal - discountAmount;

  function submitSale() {
    if (discPct > 0 && !discountReason.trim()) { toast({ title: "Укажите причину скидки", variant: "destructive" }); return; }
    const items = cart.filter((r) => r.name.trim() && Number(r.quantity) > 0 && Number(r.pricePerUnit) >= 0)
      .map((r) => ({ productId: r.productId, name: r.name.trim(), quantity: Number(r.quantity), pricePerUnit: Number(r.pricePerUnit) }));
    if (!items.length) { toast({ title: "Добавьте хотя бы одну позицию", variant: "destructive" }); return; }
    createSale.mutate({ data: { shiftId: shift.id, paymentMethod, items, discountPercent: discPct || undefined, discountReason: discPct > 0 ? discountReason.trim() : undefined } }, {
      onSuccess: (created) => {
        toast({ title: "Продажа оформлена" });
        setReceipt({
          saleId: (created as { id: number }).id,
          createdAt: (created as { createdAt?: string }).createdAt ?? new Date().toISOString(),
          cashierName: shift.cashierName,
          registerName: shift.registerName,
          houseName: shift.houseName,
          paymentMethod,
          items,
          subtotal: cartSubtotal,
          discountPercent: discPct,
          discountAmount,
          total: cartTotal,
        });
        setCart([]);
        setDiscountPercent("");
        setDiscountReason("");
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

  function submitMovement(data: MovementFormData) {
    createMovement.mutate({ id: shift.id, data: { type: data.type, amount: Number(data.amount), note: data.note } }, {
      onSuccess: () => {
        toast({ title: data.type === "collection" ? "Инкассация оформлена" : "Пополнение оформлено" });
        movementForm.reset({ type: "collection", amount: "", note: "" });
        setMovementDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getListCashMovementsQueryKey(shift.id) });
        queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      },
      onError: (e: unknown) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
    });
  }

  const expectedCashNow = Number(shift.openingCash) + Number(shift.totalSalesCash) - Number(shift.totalReturns) - Number(shift.totalCollected) + Number(shift.totalDeposited);

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">Новая продажа</div>
                <Button variant="ghost" size="sm" onClick={() => setMovementDialogOpen(true)} data-testid="btn-cash-movement"><Wallet className="mr-1.5 h-3.5 w-3.5" /> Инкассация</Button>
              </div>

              {!shift.houseId || !Object.keys(productsByCategory).length ? (
                <p className="text-xs text-muted-foreground">Для этого домика ещё не настроены товары. Добавьте позицию вручную ниже.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button type="button" onClick={() => setSelectedCategory(null)} className={selectedCategory ? "hover:text-foreground hover:underline" : "font-semibold text-foreground"} data-testid="btn-breadcrumb-all-categories">
                      Все товары
                    </button>
                    {selectedCategory && (<><span>›</span><span className="font-semibold text-foreground">{selectedCategory}</span></>)}
                  </div>

                  {!selectedCategory ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                      {Object.entries(productsByCategory).map(([category, items]) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setSelectedCategory(category)}
                          data-testid={`btn-category-${category}`}
                          className="rounded-lg border border-border bg-card hover:bg-accent/60 active:scale-[0.98] transition-all p-4 text-center flex flex-col items-center justify-center gap-1 aspect-square"
                        >
                          <div className="text-sm font-semibold leading-tight">{category}</div>
                          <div className="text-[11px] text-muted-foreground">{items.length} {items.length === 1 ? "товар" : "товаров"}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className="rounded-lg border border-dashed border-border hover:bg-accent/60 transition-all p-3 flex flex-col items-center justify-center gap-1 text-muted-foreground"
                        data-testid="btn-back-to-categories"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <div className="text-xs">Назад</div>
                      </button>
                      {productsByCategory[selectedCategory]?.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductToCart(p)}
                          data-testid={`btn-product-${p.id}`}
                          className="rounded-lg border border-border bg-card hover:bg-accent/60 active:scale-[0.98] transition-all p-3 text-left"
                        >
                          <div className="text-sm font-medium leading-tight">{p.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">{money(p.price)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!manualOpen ? (
                <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Другой товар</Button>
              ) : (
                <div className="flex gap-2 items-start rounded-lg border border-dashed border-border p-2">
                  <Input placeholder="Название" value={manualRow.name} onChange={(e) => setManualRow((r) => ({ ...r, name: e.target.value }))} className="flex-1" data-testid="input-manual-name" />
                  <Input placeholder="Кол-во" type="number" step="0.001" value={manualRow.quantity} onChange={(e) => setManualRow((r) => ({ ...r, quantity: e.target.value }))} className="w-16" data-testid="input-manual-qty" />
                  <Input placeholder="Цена" type="number" step="0.01" value={manualRow.pricePerUnit} onChange={(e) => setManualRow((r) => ({ ...r, pricePerUnit: e.target.value }))} className="w-20" data-testid="input-manual-price" />
                  <Button size="sm" onClick={addManualRow} data-testid="btn-add-manual">OK</Button>
                </div>
              )}

              {cart.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-border p-2">
                  {cart.map((row, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm gap-2">
                      <span className="flex-1 truncate">{row.name}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeCartQty(idx, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center text-xs">{row.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changeCartQty(idx, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <span className="w-16 text-right text-xs text-muted-foreground">{money(Number(row.quantity) * Number(row.pricePerUnit))}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCartRow(idx)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input placeholder="Скидка %" type="number" min="0" max="100" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className="w-24" data-testid="input-discount-percent" />
                {discPct > 0 && (
                  <Input placeholder="Причина скидки (напр. сотрудник)" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className="flex-1" data-testid="input-discount-reason" />
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "card")}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cash">Наличные</SelectItem><SelectItem value="card">Безнал</SelectItem></SelectContent>
                </Select>
                <div className="text-right">
                  {discPct > 0 && <div className="text-xs text-muted-foreground line-through">{money(cartSubtotal)}</div>}
                  <div className="font-semibold">Итого: {money(cartTotal)}</div>
                </div>
              </div>
              <Button className="w-full" onClick={submitSale} disabled={createSale.isPending || !cart.length} data-testid="btn-submit-sale">Оформить продажу</Button>
            </div>
          )}

          {(Number(shift.totalCollected) > 0 || Number(shift.totalDeposited) > 0 || !!movements?.length) && (
            <div className="space-y-2">
              <div className="font-semibold text-sm">Инкассация</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3" />Изъято</div><div className="font-medium">{money(shift.totalCollected)}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-muted-foreground text-xs flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" />Внесено</div><div className="font-medium">{money(shift.totalDeposited)}</div></div>
              </div>
              {!!movements?.length && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{m.type === "collection" ? "Изъятие" : "Внесение"}{m.note ? ` — ${m.note}` : ""}</span>
                      <span className={m.type === "collection" ? "text-destructive" : "text-emerald-700"}>{m.type === "collection" ? "−" : "+"}{money(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="font-semibold text-sm">Продажи смены</div>
            {loadingSales ? <p className="text-sm text-muted-foreground">Загрузка...</p> : !sales?.length ? (
              <p className="text-sm text-muted-foreground">Пока нет продаж</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {sales.map((s) => (
                  <SaleRow
                    key={s.id}
                    sale={s}
                    shiftId={shift.id}
                    canReturn={shift.status === "open"}
                    houseName={shift.houseName}
                    registerName={shift.registerName}
                    cashierName={shift.cashierName}
                    onShowReceipt={setReceipt}
                  />
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
              <p className="text-sm text-muted-foreground">Ожидается в кассе: {money(expectedCashNow)}</p>
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

      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Инкассация</DialogTitle></DialogHeader>
          <Form {...movementForm}>
            <form onSubmit={movementForm.handleSubmit(submitMovement)} className="space-y-4">
              <FormField control={movementForm.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Тип операции *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-movement-type"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="collection">Изъятие (инкассация)</SelectItem>
                      <SelectItem value="deposit">Внесение</SelectItem>
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <FormField control={movementForm.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Сумма (сом) *</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-movement-amount" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={movementForm.control} name="note" render={({ field }) => (
                <FormItem><FormLabel>Комментарий</FormLabel><FormControl><Input placeholder="Необязательно" {...field} data-testid="input-movement-note" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={createMovement.isPending} data-testid="btn-submit-movement">Сохранить</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </Sheet>
  );
}

function ReceiptDialog({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-receipt, #print-receipt * { visibility: visible !important; }
          #print-receipt { position: fixed; inset: 0; padding: 16px; font-size: 12px; max-width: 320px; margin: 0 auto; }
        }
      `}</style>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Чек №{receipt.saleId}</DialogTitle></DialogHeader>
          <div id="print-receipt" className="text-sm space-y-2">
            <div className="text-center text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">{receipt.houseName} — {receipt.registerName}</div>
              <div>{new Date(receipt.createdAt).toLocaleString("ru-RU")}</div>
              <div>Кассир: {receipt.cashierName}</div>
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              {receipt.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="flex-1">{it.name} × {it.quantity}</span>
                  <span>{money(it.quantity * it.pricePerUnit)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1">
              {receipt.discountPercent > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Подытог</span><span>{money(receipt.subtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Скидка {receipt.discountPercent}%</span><span>−{money(receipt.discountAmount)}</span></div>
                </>
              )}
              <div className="flex justify-between font-semibold text-base"><span>Итого</span><span>{money(receipt.total)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Оплата</span><span>{receipt.paymentMethod === "cash" ? "Наличные" : "Безнал"}</span></div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} data-testid="btn-close-receipt">Готово</Button>
            <Button onClick={() => window.print()} data-testid="btn-print-receipt"><Printer className="mr-2 h-4 w-4" /> Печать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SaleRow({ sale, shiftId, canReturn, houseName, registerName, cashierName, onShowReceipt }: {
  sale: { id: number; totalAmount: string; paymentMethod: string; status: string; createdAt: string };
  shiftId: number; canReturn: boolean; houseName: string; registerName: string; cashierName: string;
  onShowReceipt: (receipt: ReceiptData) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useGetSale(sale.id, { query: { queryKey: getGetSaleQueryKey(sale.id), enabled: expanded } });
  const createReturn = useCreateReturn();

  function showReceipt() {
    if (!detail || !("items" in detail)) return;
    const items = (detail.items as Array<{ name: string; quantity: string; pricePerUnit: string }>).map((it) => ({ name: it.name, quantity: Number(it.quantity), pricePerUnit: Number(it.pricePerUnit) }));
    const d = detail as unknown as { subtotalAmount?: string; discountPercent?: string; discountAmount?: string };
    onShowReceipt({
      saleId: sale.id,
      createdAt: sale.createdAt,
      cashierName,
      registerName,
      houseName,
      paymentMethod: sale.paymentMethod as "cash" | "card",
      items,
      subtotal: Number(d.subtotalAmount ?? sale.totalAmount),
      discountPercent: Number(d.discountPercent ?? 0),
      discountAmount: Number(d.discountAmount ?? 0),
      total: Number(sale.totalAmount),
    });
  }

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
          <div className="pt-1">
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={showReceipt} data-testid={`btn-receipt-${sale.id}`}>
              <Receipt className="mr-1.5 h-3 w-3" /> Чек
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
