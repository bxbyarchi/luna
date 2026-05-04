import { useState } from "react";
import {
  useListInventoryAudits, useCreateInventoryAudit, useGetInventoryAudit,
  useUpdateInventoryAudit, useSubmitInventoryAudit,
  getListInventoryAuditsQueryKey, getGetInventoryAuditQueryKey,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ClipboardCheck, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AuditItem = { id: number; itemId: number; itemName?: string | null; systemStock: number | string; actualStock?: number | string | null; discrepancy?: number | string | null };
type Audit = { id: number; title: string; status: string; createdAt: string; submittedAt?: string | null; items?: AuditItem[] };

export default function InventoryAudits() {
  const { data: audits, isLoading } = useListInventoryAudits({ query: { queryKey: getListInventoryAuditsQueryKey() } });
  const [newTitle, setNewTitle] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo } = useCurrentUser();

  const create = useCreateInventoryAudit();
  const updateAudit = useUpdateInventoryAudit();
  const submitAudit = useSubmitInventoryAudit();

  const { data: detail, isLoading: loadingDetail } = useGetInventoryAudit(
    selectedId ?? 0,
    { query: { enabled: !!selectedId && detailOpen, queryKey: getGetInventoryAuditQueryKey(selectedId ?? 0) } }
  );

  function handleCreate() {
    if (!newTitle.trim()) return;
    create.mutate({ data: { title: newTitle.trim() } }, {
      onSuccess: () => {
        toast({ title: "Инвентаризация создана" });
        setNewTitle("");
        queryClient.invalidateQueries({ queryKey: getListInventoryAuditsQueryKey() });
      },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  function openDetail(id: number) {
    setSelectedId(id);
    setCounts({});
    setDetailOpen(true);
  }

  function handleSave() {
    if (!selectedId || !detail) return;
    const editedItems = (detail as Audit).items
      ?.filter((item) => counts[item.id] !== undefined)
      .map((item) => ({
        itemId: item.itemId,
        actualStock: Number(counts[item.id]),
      })) ?? [];
    if (!editedItems.length) {
      toast({ title: "Нет изменений для сохранения" });
      return;
    }
    updateAudit.mutate({ id: selectedId, data: { items: editedItems } }, {
      onSuccess: () => {
        toast({ title: "Данные сохранены" });
        queryClient.invalidateQueries({ queryKey: getGetInventoryAuditQueryKey(selectedId) });
      },
    });
  }

  function handleSubmit() {
    if (!selectedId) return;
    if (!confirm("Завершить инвентаризацию? Это действие нельзя отменить.")) return;
    submitAudit.mutate({ id: selectedId }, {
      onSuccess: () => {
        toast({ title: "Инвентаризация завершена" });
        setDetailOpen(false);
        queryClient.invalidateQueries({ queryKey: getListInventoryAuditsQueryKey() });
      },
    });
  }

  const auditDetail = detail as Audit | undefined;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Инвентаризации</h1>
          <p className="text-muted-foreground text-sm">Учёт фактических остатков.</p>
        </div>
      </div>

      {canDo("manager") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Новая инвентаризация</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Название, напр. «Ревизия май 2026»"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="max-w-sm"
                data-testid="input-audit-title"
              />
              <Button onClick={handleCreate} disabled={!newTitle.trim() || create.isPending} data-testid="btn-create-audit">
                <Plus className="mr-2 h-4 w-4" /> Создать
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создана</TableHead>
                <TableHead>Завершена</TableHead>
                <TableHead className="text-right">Открыть</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !audits?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет инвентаризаций</TableCell></TableRow>
              ) : (
                (audits as unknown as Audit[]).map((a) => (
                  <TableRow key={a.id} data-testid={`row-audit-${a.id}`}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={a.status === "submitted" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}>
                        {a.status === "submitted" ? "Завершена" : "Черновик"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(a.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString("ru-RU") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(a.id)} data-testid={`btn-open-audit-${a.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              {auditDetail?.title ?? "Инвентаризация"}
            </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Позиция</TableHead>
                    <TableHead className="text-right">По системе</TableHead>
                    <TableHead className="text-right w-36">Факт</TableHead>
                    <TableHead className="text-right">Отклонение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditDetail?.items?.map((item) => {
                    const actual = counts[item.id] !== undefined ? counts[item.id] : (item.actualStock ?? "");
                    const disc = actual !== "" ? (Number(actual) - Number(item.systemStock)).toFixed(2) : null;
                    return (
                      <TableRow key={item.id} data-testid={`row-audititem-${item.id}`}>
                        <TableCell className="font-medium">{item.itemName}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{Number(item.systemStock).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {auditDetail.status === "submitted" ? (
                            <span>{Number(item.actualStock ?? 0).toFixed(2)}</span>
                          ) : (
                            <Input
                              type="number"
                              step="0.001"
                              className="h-8 w-28 text-right"
                              value={actual}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              data-testid={`input-actual-${item.id}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${disc !== null && Number(disc) < 0 ? "text-destructive" : disc !== null && Number(disc) > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {disc !== null ? (Number(disc) > 0 ? `+${disc}` : disc) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {auditDetail?.status !== "submitted" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleSave} disabled={updateAudit.isPending} data-testid="btn-save-audit">
                    Сохранить
                  </Button>
                  {canDo("manager") && (
                    <Button onClick={handleSubmit} disabled={submitAudit.isPending} data-testid="btn-submit-audit">
                      Завершить инвентаризацию
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}