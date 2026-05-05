import { useState } from "react";
import {
  useListWriteOffs, useCreateWriteOff, useListItems, useListStaff,
  getListWriteOffsQueryKey, getListItemsQueryKey, getListStaffQueryKey,
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

const REASONS = [
  "Бой/повреждение",
  "Порча",
  "Хищение",
  "Естественная убыль",
  "Списание по акту",
  "Иное",
];

const writeOffSchema = z.object({
  itemId: z.string().min(1, "Позиция обязательна"),
  quantity: z.string().min(1, "Количество обязательно"),
  reason: z.string().min(1, "Причина обязательна"),
  staffId: z.string().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});
type WriteOffFormData = z.infer<typeof writeOffSchema>;

type WriteOffRow = { id: number; itemId: number; itemName?: string | null; quantity: number | string; reason: string; staffId?: number | null; staffName?: string | null; photoUrl?: string | null; totalValue: number | string; createdAt: string };
type ItemOption = { id: number; name: string; unit: string };
type StaffOption = { id: number; name: string };

export default function WriteOffs() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo, isLoading: authLoading } = useCurrentUser();

  const { data: writeOffs, isLoading } = useListWriteOffs(undefined, { query: { queryKey: getListWriteOffsQueryKey() } });
  const { data: items } = useListItems(undefined, { query: { queryKey: getListItemsQueryKey() } });
  const { data: staff } = useListStaff({ query: { queryKey: getListStaffQueryKey() } });
  const create = useCreateWriteOff();

  const form = useForm<WriteOffFormData>({
    resolver: zodResolver(writeOffSchema),
    defaultValues: { itemId: "", quantity: "", reason: "", staffId: "", notes: "", photoUrl: null },
  });

  const selectedItemId = form.watch("itemId");
  const selectedItem = (items as ItemOption[] | undefined)?.find((i) => String(i.id) === selectedItemId);

  function onSubmit(data: WriteOffFormData) {
    create.mutate({
      data: {
        itemId: Number(data.itemId),
        quantity: Number(data.quantity),
        reason: data.reason,
        staffId: data.staffId ? Number(data.staffId) : null,
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
        <CardContent className="p-0">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !writeOffs?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Нет списаний</TableCell></TableRow>
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
                        <a href={`/api/storage/objects/${wo.photoUrl.replace(/^\/objects\//, "")}`} target="_blank" rel="noopener noreferrer">
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
              <FormField control={form.control} name="staffId" render={({ field }) => (
                <FormItem><FormLabel>Ответственный сотрудник</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-wo-staff"><SelectValue placeholder="Не указан" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Не указан</SelectItem>
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
                  value={form.watch("photoUrl")}
                  onChange={(path) => form.setValue("photoUrl", path)}
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
    </div>
  );
}
