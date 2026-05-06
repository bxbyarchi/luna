import { useState } from "react";
import {
  useListReceipts, useCreateReceipt, useListItems, useUpdateReceipt, useDeleteReceipt,
  getListReceiptsQueryKey, getListItemsQueryKey,
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
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUploader } from "@/components/PhotoUploader";

const receiptSchema = z.object({
  itemId: z.string().min(1, "Позиция обязательна"),
  quantity: z.string().min(1, "Количество обязательно"),
  pricePerUnit: z.string().min(1, "Цена обязательна"),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).default([]),
});
type ReceiptFormData = z.infer<typeof receiptSchema>;

const editReceiptSchema = z.object({
  quantity: z.string().min(1, "Количество обязательно"),
  pricePerUnit: z.string().min(1, "Цена обязательна"),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).default([]),
});
type EditReceiptFormData = z.infer<typeof editReceiptSchema>;

type Receipt = {
  id: number;
  itemId: number;
  itemName?: string | null;
  quantity: number | string;
  pricePerUnit: number | string;
  totalCost: number | string;
  supplier?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  notes?: string | null;
  createdAt: string;
};
type ItemOption = { id: number; name: string; unit: string; pricePerUnit: string };

function getPhotoUrls(r: Receipt): string[] {
  if (r.photoUrls && r.photoUrls.length > 0) return r.photoUrls;
  if (r.photoUrl) return [r.photoUrl];
  return [];
}

function PhotoThumbnail({ photos, onClick, receiptId }: { photos: string[]; onClick: () => void; receiptId: number }) {
  if (photos.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const thumbUrl = `/api/storage/objects/${photos[0].replace(/^\/objects\//, "")}`;
  return (
    <button
      onClick={onClick}
      className="relative inline-block rounded overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Просмотреть ${photos.length} фото`}
      data-testid={`btn-photo-${receiptId}`}
    >
      <img
        src={thumbUrl}
        alt="Фото поставки"
        className="h-10 w-10 object-cover rounded hover:opacity-80 transition-opacity"
        data-testid={`thumb-photo-${receiptId}`}
      />
      {photos.length > 1 && (
        <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] font-semibold leading-none px-1 py-0.5 rounded-tl">
          +{photos.length - 1}
        </span>
      )}
    </button>
  );
}

export default function Receipts() {
  const [open, setOpen] = useState(false);
  const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);
  const [deleteReceipt, setDeleteReceipt] = useState<Receipt | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo, isLoading: authLoading } = useCurrentUser();

  const { data: receipts, isLoading } = useListReceipts(undefined, { query: { queryKey: getListReceiptsQueryKey() } });
  const { data: items } = useListItems(undefined, { query: { queryKey: getListItemsQueryKey() } });
  const create = useCreateReceipt();
  const update = useUpdateReceipt();
  const remove = useDeleteReceipt();

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: { itemId: "", quantity: "", pricePerUnit: "", supplier: "", notes: "", photoUrls: [] },
  });

  const editForm = useForm<EditReceiptFormData>({
    resolver: zodResolver(editReceiptSchema),
    defaultValues: { quantity: "", pricePerUnit: "", supplier: "", notes: "", photoUrls: [] },
  });

  const selectedItemId = form.watch("itemId");
  const selectedItem = (items as ItemOption[] | undefined)?.find((i) => String(i.id) === selectedItemId);

  function onSubmit(data: ReceiptFormData) {
    create.mutate({
      data: {
        itemId: Number(data.itemId),
        quantity: Number(data.quantity),
        pricePerUnit: Number(data.pricePerUnit),
        supplier: data.supplier || null,
        notes: data.notes || null,
        photoUrl: data.photoUrls[0] ?? null,
        photoUrls: data.photoUrls,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Поступление зарегистрировано" });
        queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setOpen(false);
      },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  function openEditDialog(r: Receipt) {
    const photos = getPhotoUrls(r);
    editForm.reset({
      quantity: String(Number(r.quantity)),
      pricePerUnit: String(Number(r.pricePerUnit)),
      supplier: r.supplier ?? "",
      notes: r.notes ?? "",
      photoUrls: photos,
    });
    setEditReceipt(r);
  }

  function onEditSubmit(data: EditReceiptFormData) {
    if (!editReceipt) return;
    update.mutate({
      id: editReceipt.id,
      data: {
        quantity: Number(data.quantity),
        pricePerUnit: Number(data.pricePerUnit),
        supplier: data.supplier || null,
        notes: data.notes || null,
        photoUrl: data.photoUrls[0] ?? null,
        photoUrls: data.photoUrls,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Поступление обновлено" });
        queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setEditReceipt(null);
      },
      onError: () => toast({ title: "Ошибка при обновлении", variant: "destructive" }),
    });
  }

  function onDeleteConfirm() {
    if (!deleteReceipt) return;
    remove.mutate({ id: deleteReceipt.id }, {
      onSuccess: () => {
        toast({ title: "Поступление удалено" });
        queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setDeleteReceipt(null);
      },
      onError: () => toast({ title: "Ошибка при удалении", variant: "destructive" }),
    });
  }

  function openLightbox(photos: string[], index = 0) {
    setLightboxPhotos(photos.map((p) => `/api/storage/objects/${p.replace(/^\/objects\//, "")}`));
    setLightboxIndex(index);
  }

  const lightboxUrl = lightboxPhotos[lightboxIndex] ?? null;
  const canManage = canDo("manager");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Поступления</h1>
          <p className="text-muted-foreground text-sm">Входящие поставки и оприходование.</p>
        </div>
        {authLoading ? (
          <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
        ) : canDo("admin") && (
          <Button
            onClick={() => { form.reset({ itemId: "", quantity: "", pricePerUnit: "", supplier: "", notes: "", photoUrls: [] }); setOpen(true); }}
            data-testid="btn-create-receipt"
          >
            <Plus className="mr-2 h-4 w-4" /> Оприходовать
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
                <TableHead>Поставщик</TableHead>
                <TableHead className="text-right">Количество</TableHead>
                <TableHead className="text-right">Цена за ед.</TableHead>
                <TableHead className="text-right">Итого</TableHead>
                <TableHead className="text-center">Фото</TableHead>
                {!authLoading && canManage && <TableHead className="text-center">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !receipts?.length ? (
                <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Нет поступлений</TableCell></TableRow>
              ) : (
                (receipts as unknown as Receipt[]).map((r) => {
                  const photos = getPhotoUrls(r);
                  return (
                    <TableRow key={r.id} data-testid={`row-receipt-${r.id}`}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                      <TableCell className="font-medium">{r.itemName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.supplier ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.quantity).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(r.pricePerUnit).toFixed(2)} сом</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">{Number(r.totalCost).toFixed(2)} сом</TableCell>
                      <TableCell className="text-center">
                        <PhotoThumbnail photos={photos} onClick={() => openLightbox(photos, 0)} receiptId={r.id} />
                      </TableCell>
                      {!authLoading && canManage && (
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(r)}
                              data-testid={`btn-edit-receipt-${r.id}`}
                              aria-label="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteReceipt(r)}
                              data-testid={`btn-delete-receipt-${r.id}`}
                              aria-label="Удалить"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Dialog open={lightboxPhotos.length > 0} onOpenChange={(o) => { if (!o) setLightboxPhotos([]); }}>
        <DialogContent className="max-w-3xl p-2 sm:p-4 flex flex-col items-center gap-3">
          <DialogHeader className="w-full flex flex-row items-center justify-between">
            <DialogTitle className="text-sm text-muted-foreground">
              Фото поставки {lightboxPhotos.length > 1 ? `(${lightboxIndex + 1} / ${lightboxPhotos.length})` : ""}
            </DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Фото поставки"
              className="max-h-[75vh] w-full object-contain rounded-md"
              data-testid="lightbox-image"
            />
          )}
          {lightboxPhotos.length > 1 && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLightboxIndex((i) => Math.max(0, i - 1))}
                disabled={lightboxIndex === 0}
                aria-label="Предыдущее фото"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{lightboxIndex + 1} / {lightboxPhotos.length}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLightboxIndex((i) => Math.min(lightboxPhotos.length - 1, i + 1))}
                disabled={lightboxIndex === lightboxPhotos.length - 1}
                aria-label="Следующее фото"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Оприходование товара</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="itemId" render={({ field }) => (
                <FormItem><FormLabel>Позиция *</FormLabel>
                  <Select value={field.value} onValueChange={(v) => {
                    field.onChange(v);
                    const item = (items as ItemOption[] | undefined)?.find((i) => String(i.id) === v);
                    if (item) form.setValue("pricePerUnit", String(item.pricePerUnit));
                  }}>
                    <FormControl><SelectTrigger data-testid="select-receipt-item"><SelectValue placeholder="Выбрать позицию" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(items as ItemOption[] | undefined)?.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>Количество{selectedItem ? ` (${selectedItem.unit})` : ""} *</FormLabel><FormControl><Input type="number" step="0.001" placeholder="0" {...field} data-testid="input-receipt-qty" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="pricePerUnit" render={({ field }) => (
                  <FormItem><FormLabel>Цена за ед. (сом) *</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-receipt-price" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="supplier" render={({ field }) => (
                <FormItem><FormLabel>Поставщик</FormLabel><FormControl><Input placeholder="ООО Ромашка" {...field} data-testid="input-receipt-supplier" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Дополнительная информация" {...field} data-testid="input-receipt-notes" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Фото поставки</label>
                <PhotoUploader
                  value={form.watch("photoUrls")}
                  onChange={(paths) => form.setValue("photoUrls", paths)}
                  label="Сфотографировать накладную"
                />
              </div>
              {form.watch("quantity") && form.watch("pricePerUnit") && (
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Итого: </span>
                  <span className="font-semibold">{(Number(form.watch("quantity")) * Number(form.watch("pricePerUnit"))).toFixed(2)} сом</span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending} data-testid="btn-submit-receipt">Оприходовать</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editReceipt !== null} onOpenChange={(o) => { if (!o) setEditReceipt(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Редактировать поступление</DialogTitle></DialogHeader>
          {editReceipt && (
            <div className="text-sm text-muted-foreground mb-2">
              Позиция: <span className="font-medium text-foreground">{editReceipt.itemName ?? "—"}</span>
            </div>
          )}
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>Количество *</FormLabel><FormControl><Input type="number" step="0.001" placeholder="0" {...field} data-testid="input-edit-receipt-qty" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="pricePerUnit" render={({ field }) => (
                  <FormItem><FormLabel>Цена за ед. (сом) *</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-edit-receipt-price" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="supplier" render={({ field }) => (
                <FormItem><FormLabel>Поставщик</FormLabel><FormControl><Input placeholder="ООО Ромашка" {...field} data-testid="input-edit-receipt-supplier" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Дополнительная информация" {...field} data-testid="input-edit-receipt-notes" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Фото поставки</label>
                <PhotoUploader
                  value={editForm.watch("photoUrls")}
                  onChange={(paths) => editForm.setValue("photoUrls", paths)}
                  label="Сфотографировать накладную"
                />
              </div>
              {editForm.watch("quantity") && editForm.watch("pricePerUnit") && (
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Итого: </span>
                  <span className="font-semibold">{(Number(editForm.watch("quantity")) * Number(editForm.watch("pricePerUnit"))).toFixed(2)} сом</span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditReceipt(null)}>Отмена</Button>
                <Button type="submit" disabled={update.isPending} data-testid="btn-submit-edit-receipt">Сохранить</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteReceipt !== null} onOpenChange={(o) => { if (!o) setDeleteReceipt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить поступление?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Поступление <span className="font-medium text-foreground">{deleteReceipt?.itemName ?? "—"}</span> ({Number(deleteReceipt?.quantity ?? 0).toFixed(2)} ед.) будет удалено, а запас скорректирован. Это действие нельзя отменить.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteReceipt(null)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={onDeleteConfirm}
              disabled={remove.isPending}
              data-testid="btn-confirm-delete-receipt"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
