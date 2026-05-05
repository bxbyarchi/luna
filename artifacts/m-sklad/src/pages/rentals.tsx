import { useState } from "react";
import {
  useListRentals,
  useCreateRental,
  useUpdateRental,
  getListRentalsQueryKey,
  useListItems,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Plus, Phone, CheckCircle, Clock, AlertTriangle } from "lucide-react";

type StatusFilter = "all" | "active" | "returned";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  if (status === "returned") {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Возвращено</Badge>;
  }
  if (isOverdue) {
    return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Просрочено</Badge>;
  }
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100"><Clock className="h-3 w-3 mr-1" />Активна</Badge>;
}

export default function Rentals() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams = statusFilter !== "all" ? { status: statusFilter as "active" | "returned" } : {};
  const { data: rentals, isLoading } = useListRentals(queryParams, {
    query: { queryKey: getListRentalsQueryKey(queryParams) },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListRentalsQueryKey({}) });
    void queryClient.invalidateQueries({ queryKey: getListRentalsQueryKey({ status: "active" }) });
    void queryClient.invalidateQueries({ queryKey: getListRentalsQueryKey({ status: "returned" }) });
  };

  const { mutate: markReturned, isPending: returning } = useUpdateRental({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Аренда закрыта", description: "Товар возвращён на склад." }); },
      onError: (e) => toast({ title: "Ошибка", description: String(e), variant: "destructive" }),
    },
  });

  const activeCount = (rentals ?? []).filter((r) => r.status === "active").length;
  const overdueCount = (rentals ?? []).filter((r) => r.isOverdue && r.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-rentals">Аренда</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Учёт выданных в аренду позиций.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="btn-create-rental">
          <Plus className="h-4 w-4 mr-2" /> Новая аренда
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["all", "active", "returned"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              data-testid={`filter-${s}`}
            >
              {s === "all" ? "Все" : s === "active" ? "Активные" : "Возвращённые"}
            </button>
          ))}
        </div>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="self-center">
            <AlertTriangle className="h-3 w-3 mr-1" />{overdueCount} просрочено
          </Badge>
        )}
        {activeCount > 0 && statusFilter !== "returned" && (
          <span className="self-center text-sm text-muted-foreground">{activeCount} активных аренд</span>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Список аренд
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !rentals?.length ? (
            <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <KeyRound className="h-10 w-10 opacity-20" />
              <p className="text-sm">Аренд нет</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rentals.map((r) => (
                <div
                  key={r.id}
                  data-testid={`rental-${r.id}`}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${r.isOverdue && r.status === "active" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card hover:bg-muted/30"}`}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.itemName ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.quantity} {r.itemUnit ?? ""}</span>
                        <StatusBadge status={r.status} isOverdue={r.isOverdue} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm text-muted-foreground">{r.renterName}</span>
                        {r.renterPhone && (
                          <a href={`tel:${r.renterPhone}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Phone className="h-3 w-3" />{r.renterPhone}
                          </a>
                        )}
                        <span className="text-xs text-muted-foreground">Выдано: {formatDate(r.issuedAt)}</span>
                        <span className={`text-xs font-medium ${r.isOverdue && r.status === "active" ? "text-destructive" : "text-muted-foreground"}`}>
                          Возврат: {formatDate(r.plannedReturnAt)}
                        </span>
                        {r.returnedAt && (
                          <span className="text-xs text-emerald-600">Вернул: {formatDate(r.returnedAt)}</span>
                        )}
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground mt-1 italic">{r.notes}</p>}
                    </div>
                  </div>
                  {r.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 ml-4 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      disabled={returning}
                      onClick={() => markReturned({ id: r.id, data: { status: "returned" } })}
                      data-testid={`btn-return-${r.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" /> Возвращено
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateRentalDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); invalidate(); }}
        />
      )}
    </div>
  );
}

function CreateRentalDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [renterName, setRenterName] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [plannedReturnAt, setPlannedReturnAt] = useState("");
  const [notes, setNotes] = useState("");

  const { data: items } = useListItems({});

  const { mutate: createRental, isPending } = useCreateRental({
    mutation: {
      onSuccess: () => { toast({ title: "Аренда создана" }); onCreated(); },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e);
        toast({ title: "Ошибка", description: msg, variant: "destructive" });
      },
    },
  });

  const handleSubmit = () => {
    if (!itemId || !quantity || !renterName || !issuedAt || !plannedReturnAt) {
      toast({ title: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }
    createRental({
      data: {
        itemId: Number(itemId),
        quantity: Number(quantity),
        renterName,
        renterPhone: renterPhone || undefined,
        issuedAt: new Date(issuedAt).toISOString(),
        plannedReturnAt: new Date(plannedReturnAt).toISOString(),
        notes: notes || undefined,
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новая аренда</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Товар *</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger data-testid="select-rental-item">
                <SelectValue placeholder="Выберите позицию" />
              </SelectTrigger>
              <SelectContent>
                {(items ?? []).map((it) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.name} — {it.currentStock} {it.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Количество *</Label>
            <Input type="number" min="0.001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" data-testid="input-rental-quantity" />
          </div>
          <div className="space-y-1.5">
            <Label>Арендатор *</Label>
            <Input value={renterName} onChange={(e) => setRenterName(e.target.value)} placeholder="ФИО" data-testid="input-renter-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Телефон</Label>
            <Input value={renterPhone} onChange={(e) => setRenterPhone(e.target.value)} placeholder="+7 999 000 00 00" data-testid="input-renter-phone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Дата выдачи *</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} data-testid="input-issued-at" />
            </div>
            <div className="space-y-1.5">
              <Label>Планируемый возврат *</Label>
              <Input type="date" value={plannedReturnAt} onChange={(e) => setPlannedReturnAt(e.target.value)} data-testid="input-planned-return" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Примечания</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Дополнительно..." data-testid="input-rental-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="btn-submit-rental">
            {isPending ? "Сохранение..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
