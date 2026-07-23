import { useState } from "react";
import {
  useListWriteOffs, useCreateWriteOff, useListItems, useListStaff,
  useUpdateWriteOff, useDeleteWriteOff,
  getListWriteOffsQueryKey, getListItemsQueryKey, getListStaffQueryKey,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUploader } from "@/components/PhotoUploader";

const REASONS = [
  "Бой/повреждение",
  "Порча",
  "Хищение",
  "Естественная убыль",
  "Списание по акту",
  "Хозяйственные нужды",
  "Иное",
];

const HOZKA_REASON = "Хозяйственные нужды";

const writeOffSchema = z.object({
  itemId: z.string().min(1, "Позиция обязательна"),
  quantity: z.string().min(1, "Количество обязательно"),
  reason: z.string().min(1, "Причина обязательна"),
  staffId: z.string().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});
type WriteOffFormData = z.infer<typeof writeOffSchema>;

const editWriteOffSchema = z.object({
  quantity: z.string().min(1, "Количество обязательно"),
  reason: z.string().min(1, "Причина обязательна"),
  staffId: z.string().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});
type EditWriteOffFormData = z.infer<typeof editWriteOffSchema>;

type WriteOffRow = {
  id: number;
  itemId: number;
  itemName?: string | null;
  quantity: number | string;
  reason: string;
  staffId?: number | null;
  staffName?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  totalValue: number | string;
  createdAt: string;
};
type ItemOption = { id: number; name: string; unit: string };
type StaffOption = { id: number; name: string };

export default function WriteOffs() {
  const [open, setOpen] = useState(false);
  const [editWriteOff, setEditWriteOff] = useState<WriteOffRow | null>(null);
  const [deleteWriteOff, setDeleteWriteOff] = useState<WriteOffRow | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo, isLoading: authLoading } = useCurrentUser();

  const { data: writeOffs, isLoading } = useListWriteOffs(undefined, { query: { queryKey: getListWriteOffsQueryKey() } });
  const { data: items } = useListItems(undefined, { query: { queryKey: getListItemsQueryKey() } });
  const { data: staff } = useListStaff({ query: { queryKey: getListStaffQueryKey() } });
  const create = useCreateWriteOff();
  const update = useUpdateWriteOff();
  const remove = useDeleteWriteOff();

  const form = useForm<WriteOffFormData>({
    resolver: zodResolver(writeOffSchema),
    defaultValues: { itemId: "", quantity: "", reason: "", staffId: "", notes: "", photoUrl: null },
  });

  const editForm = useForm<EditWriteOffFormData>({
    resolver: zodResolver(editWriteOffSchema),
    defaultValues: { quantity: "", reason: "", staffId: "", notes: "", photoUrl: null },
  });

  const selectedItemId = form.watch("itemId");
  const selectedItem = (items as ItemOption[] | undefined)?.find((i) => String(i.id) === selectedItemId);
  const selectedReason = form.watch("reason");
  const isHozka = selectedReason === HOZKA_REASON;

  function onSubmit(data: WriteOffFormData) {
    create.mutate({
      data: {
        itemId: Number(data.itemId),
        quantity: Number(data.quantity),
        reason: data.reason,
        staffId: data.staffId && data.staffId !== "none" ? Number(data.staffId) : null,
        notes: data.notes || null,
        photoUrl: data.photoUrl || null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Списание зарегистрировано" });
        queryClient.invalidateQueries({ queryKey: getListWriteOffsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setOpen(false);
      },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  function openEditDialog(wo: WriteOffRow) {
    editForm.reset({
      quantity: String(Number(wo.quantity)),
      reason: wo.reason,
      staffId: wo.staffId ? String(wo.staffId) : "",
      notes: wo.notes ?? "",
      photoUrl: wo.photoUrl ?? null,
    });
    setEditWriteOff(wo);
  }

  function onEditSubmit(data: EditWriteOffFormData) {
    if (!editWriteOff) return;
    update.mutate({
      id: editWriteOff.id,
      data: {
        quantity: Number(data.quantity),
        reason: data.reason,
        staffId: data.staffId && data.staffId !== "none" ? Number(data.staffId) : null,
        notes: data.notes || null,
        photoUrl: data.photoUrl ?? null,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Списание обновлено" });
        queryClient.invalidateQueries({ queryKey: getListWriteOffsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setEditWriteOff(null);
      },
      onError: () => toast({ title: "Ошибка при обновлении", variant: "destructive" }),
    });
  }

  function onDeleteConfirm() {
    if (!deleteWriteOff) return;
    remove.mutate({ id: deleteWriteOff.id }, {
      onSuccess: () => {
        toast({ title: "Списание удалено" });
        queryClient.invalidateQueries({ queryKey: getListWriteOffsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setDeleteWriteOff(null);
      },
      onError: () => toast({ title: "Ошибка при удалении", variant: "destructive" }),
    });
  }

  const canManage = canDo("manager");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Списания</h1>
          <p className="text-muted-foreground text-sm">Бой, порча и операционные расходы.</p>
        </div>
        {authLoading ? (
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        ) : canDo("admin") && (
          <Button variant="destructive" onClick={() => { form.reset(); setOpen(true); }} data-testid="btn-create-writeoff">
            <Plus className="mr-2 h-4 w-4" /> Списать
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Позиция</TableHead>
                <TableHead>Причина</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead className="text-right">Количество</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead className="text-center">Фото</TableHead>
                {!authLoading && canManage && <TableHead className="text-center">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !writeOffs?.length ? (
                <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Нет списаний</TableCell></TableRow>
              ) : (
                (writeOffs as unknown as WriteOffRow[]).map((wo) => (
                  <TableRow key={wo.id} data-testid={`row-writeoff-${wo.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(wo.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell className="font-medium">{wo.itemName ?? "—"}</TableCell>
                    <TableCell>{wo.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{wo.staffName ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(wo.quantity).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">−{Number(wo.totalValue).toFixed(2)} сом</TableCell>
                    <TableCell className="text-center">
                      {wo.photoUrl ? (
                        <a
                          href={`/api/storage/objects/${wo.photoUrl.replace(/^\/objects\//, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          <img
                            src={`/api/storage/objects/${wo.photoUrl.replace(/^\/objects\//, "")}`}
                            alt="Фото списания"
                            className="h-10 w-10 object-cover rounded hover:opacity-80 transition-opacity mx-auto"
                          />
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    {!authLoading && canManage && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(wo)}
                            data-testid={`btn-edit-writeoff-${wo.id}`}
                            aria-label="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteWriteOff(wo)}
                            data-testid={`btn-delete-writeoff-${wo.id}`}
                            aria-label="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Списание товара</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="itemId" render={({ field }) => (
                <FormItem><FormLabel>Позиция *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-wo-item"><SelectValue placeholder="Выбрать позицию" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(items as ItemOption[] | undefined)?.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>Количество{selectedItem ? ` (${selectedItem.unit})` : ""} *</FormLabel><FormControl><Input type="number" step="0.001" placeholder="0" {...field} data-testid="input-wo-qty" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem><FormLabel>Причина *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-wo-reason"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                      <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
              </div>
              {isHozka && (
                <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  🧹 Укажите сотрудника, который получил хозтовары — это обязательно для учёта.
                </div>
              )}
              <FormField control={form.control} name="staffId" render={({ field }) => (
                <FormItem>
                  <FormLabel className={isHozka ? "text-orange-700 font-semibold" : ""}>
                    Ответственный сотрудник{isHozka ? " *" : ""}
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger
                        data-testid="select-wo-staff"
                        className={isHozka ? "border-orange-400 ring-1 ring-orange-300" : ""}
                      >
                        <SelectValue placeholder={isHozka ? "Выбрать получателя" : "Не указан"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!isHozka && <SelectItem value="none">Не указан</SelectItem>}
                      {(staff as StaffOption[] | undefined)?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Дополнительная информация" {...field} data-testid="input-wo-notes" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Фото повреждения</label>
                <PhotoUploader
                  value={form.watch("photoUrl") ? [form.watch("photoUrl")!] : null}
                  onChange={(paths: string[]) => form.setValue("photoUrl", paths[0] ?? null)}
                  label="Сфотографировать ущерб"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" variant="destructive" disabled={create.isPending} data-testid="btn-submit-writeoff">Списать</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editWriteOff !== null} onOpenChange={(o) => { if (!o) setEditWriteOff(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Редактировать списание</DialogTitle></DialogHeader>
          {editWriteOff && (
            <div className="text-sm text-muted-foreground mb-2">
              Позиция: <span className="font-medium text-foreground">{editWriteOff.itemName ?? "—"}</span>
            </div>
          )}
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>Количество *</FormLabel><FormControl><Input type="number" step="0.001" placeholder="0" {...field} data-testid="input-edit-wo-qty" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="reason" render={({ field }) => (
                  <FormItem><FormLabel>Причина *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-edit-wo-reason"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                      <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="staffId" render={({ field }) => (
                <FormItem><FormLabel>Ответственный сотрудник</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-edit-wo-staff"><SelectValue placeholder="Не указан" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Не указан</SelectItem>
                      {(staff as StaffOption[] | undefined)?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Дополнительная информация" {...field} data-testid="input-edit-wo-notes" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Фото повреждения</label>
                <PhotoUploader
                  value={editForm.watch("photoUrl") ? [editForm.watch("photoUrl")!] : null}
                  onChange={(paths: string[]) => editForm.setValue("photoUrl", paths[0] ?? null)}
                  label="Сфотографировать ущерб"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditWriteOff(null)}>Отмена</Button>
                <Button type="submit" variant="destructive" disabled={update.isPending} data-testid="btn-submit-edit-writeoff">Сохранить</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteWriteOff !== null} onOpenChange={(o) => { if (!o) setDeleteWriteOff(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить списание?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Списание <span className="font-medium text-foreground">{deleteWriteOff?.itemName ?? "—"}</span> ({Number(deleteWriteOff?.quantity ?? 0).toFixed(2)} ед.) будет удалено, а запас восстановлен. Это действие нельзя отменить.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteWriteOff(null)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={onDeleteConfirm}
              disabled={remove.isPending}
              data-testid="btn-confirm-delete-writeoff"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
