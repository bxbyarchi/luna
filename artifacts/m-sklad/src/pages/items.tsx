import { useState } from "react";
import {
  useListItems, useCreateItem, useUpdateItem, useDeleteItem,
  useListCategories,
  getListItemsQueryKey, getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Plus, Edit, Trash2, AlertTriangle, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PhotoUploader } from "@/components/PhotoUploader";

const itemSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  categoryId: z.string().min(1, "Категория обязательна"),
  unit: z.string().optional(),
  location: z.string().optional(),
  currentStock: z.string().optional(),
  minThreshold: z.string().optional(),
  pricePerUnit: z.string().optional(),
  notes: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
});
type ItemFormData = z.infer<typeof itemSchema>;

type ItemRow = {
  id: number; name: string; categoryId: number; categoryName?: string | null;
  unit: string; location?: string | null; currentStock: number | string; minThreshold?: number | string | null;
  pricePerUnit: number | string; isBelowThreshold: boolean; notes?: string | null; photoUrl?: string | null;
};

export default function Items() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo } = useCurrentUser();

  const { data: items, isLoading } = useListItems(
    { search: search || undefined },
    { query: { queryKey: getListItemsQueryKey({ search: search || undefined }) } }
  );
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const create = useCreateItem();
  const update = useUpdateItem();
  const remove = useDeleteItem();

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: { name: "", categoryId: "", unit: "шт", location: "", currentStock: "0", minThreshold: "", pricePerUnit: "0", notes: "", photoUrl: null },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", categoryId: "", unit: "шт", location: "", currentStock: "0", minThreshold: "", pricePerUnit: "0", notes: "", photoUrl: null });
    setOpen(true);
  }

  function openEdit(item: ItemRow) {
    setEditing(item);
    form.reset({
      name: item.name,
      categoryId: String(item.categoryId),
      unit: item.unit,
      location: item.location ?? "",
      currentStock: String(item.currentStock),
      minThreshold: item.minThreshold != null ? String(item.minThreshold) : "",
      pricePerUnit: String(item.pricePerUnit),
      notes: item.notes ?? "",
      photoUrl: item.photoUrl ?? null,
    });
    setOpen(true);
  }

  function onSubmit(data: ItemFormData) {
    const payload = {
      name: data.name,
      categoryId: Number(data.categoryId),
      unit: data.unit || "шт",
      location: data.location || null,
      currentStock: Number(data.currentStock || 0),
      minThreshold: data.minThreshold ? Number(data.minThreshold) : null,
      pricePerUnit: Number(data.pricePerUnit || 0),
      notes: data.notes || null,
      photoUrl: data.photoUrl ?? null,
    };
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
      setOpen(false);
    };
    if (editing) {
      update.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { toast({ title: "Позиция обновлена" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "Позиция добавлена" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Удалить позицию?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Позиция удалена" }); queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() }); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Позиции склада</h1>
          <p className="text-muted-foreground text-sm">Все материальные ценности.</p>
        </div>
        {canDo("manager") && (
          <Button onClick={openCreate} data-testid="btn-create-item">
            <Plus className="mr-2 h-4 w-4" /> Добавить
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Поиск позиций..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-items"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Наименование</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Расположение</TableHead>
                <TableHead className="text-right">Остаток</TableHead>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead>Статус</TableHead>
                {canDo("manager") && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !items?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Позиции не найдены</TableCell></TableRow>
              ) : (
                (items as unknown as ItemRow[]).map((item) => (
                  <TableRow key={item.id} data-testid={`row-item-${item.id}`} className={item.isBelowThreshold ? "bg-destructive/3" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.isBelowThreshold && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                        {item.name}
                        {item.photoUrl && (
                          <a href={`${BASE}/api/storage/objects/${item.photoUrl.replace(/^\/objects\//, "")}`} target="_blank" rel="noreferrer" title="Фото">
                            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.categoryName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.location ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(item.currentStock).toFixed(2)} {item.unit}</TableCell>
                    <TableCell className="text-right">{Number(item.pricePerUnit).toFixed(2)} ₽</TableCell>
                    <TableCell>
                      {item.isBelowThreshold ? (
                        <Badge variant="destructive" className="text-xs">Мало</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-50 border-emerald-200">Норма</Badge>
                      )}
                    </TableCell>
                    {canDo("manager") && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`btn-edit-item-${item.id}`}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} data-testid={`btn-delete-item-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Редактировать позицию" : "Новая позиция"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Наименование *</FormLabel><FormControl><Input placeholder="Стул барный" {...field} data-testid="input-item-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem><FormLabel>Категория *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-item-category"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {categories?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem><FormLabel>Ед. изм.</FormLabel><FormControl><Input placeholder="шт" {...field} data-testid="input-item-unit" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem><FormLabel>Расположение</FormLabel><FormControl><Input placeholder="Зал, кладовая..." {...field} data-testid="input-item-location" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="pricePerUnit" render={({ field }) => (
                  <FormItem><FormLabel>Цена за ед. (₽)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-item-price" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="currentStock" render={({ field }) => (
                  <FormItem><FormLabel>Текущий остаток</FormLabel><FormControl><Input type="number" step="0.001" placeholder="0" {...field} data-testid="input-item-stock" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="minThreshold" render={({ field }) => (
                  <FormItem><FormLabel>Мин. остаток</FormLabel><FormControl><Input type="number" step="0.001" placeholder="Не задан" {...field} data-testid="input-item-threshold" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2"><FormLabel>Примечания</FormLabel><FormControl><Input placeholder="Доп. информация" {...field} data-testid="input-item-notes" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Фото позиции</label>
                <PhotoUploader
                  value={form.watch("photoUrl")}
                  onChange={(path) => form.setValue("photoUrl", path)}
                  label="Загрузить фото"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-submit-item">
                  {editing ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
