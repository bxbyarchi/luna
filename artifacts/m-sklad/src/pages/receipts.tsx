import { useState } from "react";
import {
  useListReceipts, useCreateReceipt, useListItems,
  getListReceiptsQueryKey, getListItemsQueryKey,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUploader } from "@/components/PhotoUploader";

const receiptSchema = z.object({
  itemId: z.string().min(1, "Позиция обязательна"),
  quantity: z.string().min(1, "Количество обязательно"),
  pricePerUnit: z.string().min(1, "Цена обязательна"),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});
type ReceiptFormData = z.infer<typeof receiptSchema>;

type Receipt = { id: number; itemId: number; itemName?: string | null; quantity: number | string; pricePerUnit: number | string; totalCost: number | string; supplier?: string | null; photoUrl?: string | null; createdAt: string };
type ItemOption = { id: number; name: string; unit: string; pricePerUnit: string };

export default function Receipts() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo } = useCurrentUser();

  const { data: receipts, isLoading } = useListReceipts(undefined, { query: { queryKey: getListReceiptsQueryKey() } });
  const { data: items } = useListItems(undefined, { query: { queryKey: getListItemsQueryKey() } });
  const create = useCreateReceipt();

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: { itemId: "", quantity: "", pricePerUnit: "", supplier: "", notes: "", photoUrl: null },
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
        photoUrl: data.photoUrl || null,
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Поступления</h1>
          <p className="text-muted-foreground text-sm">Входящие поставки и оприходование.</p>
        </div>
        {canDo("warehouse") && (
          <Button onClick={() => { form.reset(); setOpen(true); }} data-testid="btn-create-receipt">
            <Plus className="mr-2 h-4 w-4" /> Оприходовать
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !receipts?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Нет поступлений</TableCell></TableRow>
              ) : (
                (receipts as unknown as Receipt[]).map((r) => (
                  <TableRow key={r.id} data-testid={`row-receipt-${r.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell className="font-medium">{r.itemName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.supplier ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(r.quantity).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(r.pricePerUnit).toFixed(2)} ₽</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{Number(r.totalCost).toFixed(2)} ₽</TableCell>
                    <TableCell className="text-center">
                      {r.photoUrl ? (
                        <a href={`/api/storage/objects/${r.photoUrl.replace(/^\/objects\//, "")}`} target="_blank" rel="noopener noreferrer">
                          <ImageIcon className="h-4 w-4 text-primary mx-auto" />
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                  <FormItem><FormLabel>Цена за ед. (₽) *</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-receipt-price" /></FormControl><FormMessage /></FormItem>
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
                  value={form.watch("photoUrl")}
                  onChange={(path) => form.setValue("photoUrl", path)}
                  label="Сфотографировать накладную"
                />
              </div>
              {form.watch("quantity") && form.watch("pricePerUnit") && (
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Итого: </span>
                  <span className="font-semibold">{(Number(form.watch("quantity")) * Number(form.watch("pricePerUnit"))).toFixed(2)} ₽</span>
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
    </div>
  );
}
