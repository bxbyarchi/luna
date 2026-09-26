import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import {
  useListHouses, useCreateHouse, useUpdateHouse, useDeleteHouse,
  useListLocations, getListHousesQueryKey,
  useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, KeyRound, UtensilsCrossed, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const houseSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  locationId: z.string().min(1, "Площадка обязательна"),
});
type HouseFormData = z.infer<typeof houseSchema>;

type House = { id: number; name: string; isActive: boolean; locationId: number; locationName?: string | null; registerCount: number };

export default function Houses() {
  const { user, canDoVenue, isVenueAdmin } = useCurrentUser();
  const isAdmin = isVenueAdmin;
  const canManage = canDoVenue("location_admin");
  const [, setLocation] = useWouterLocation();
  const [locationFilter, setLocationFilter] = useState("");
  const listParams = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: houses, isLoading } = useListHouses(listParams, { query: { queryKey: getListHousesQueryKey(listParams) } });
  const { data: allLocations } = useListLocations();
  const venues = allLocations?.filter((l) => l.isVenue);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<House | null>(null);
  const [menuHouse, setMenuHouse] = useState<House | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useCreateHouse();
  const update = useUpdateHouse();
  const remove = useDeleteHouse();

  const form = useForm<HouseFormData>({
    resolver: zodResolver(houseSchema),
    defaultValues: { name: "", locationId: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", locationId: isAdmin ? "" : String(user?.locationId ?? "") });
    setOpen(true);
  }

  function openEdit(h: House) {
    setEditing(h);
    form.reset({ name: h.name, locationId: String(h.locationId) });
    setOpen(true);
  }

  function onSubmit(data: HouseFormData) {
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListHousesQueryKey() }); setOpen(false); };
    if (editing) {
      update.mutate({ id: editing.id, data: { name: data.name } }, {
        onSuccess: () => { toast({ title: "Домик обновлён" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: { name: data.name, locationId: Number(data.locationId) } }, {
        onSuccess: () => { toast({ title: "Домик добавлен" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Удалить домик? Это возможно только если в нём нет касс.")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Домик удалён" }); queryClient.invalidateQueries({ queryKey: getListHousesQueryKey() }); },
      onError: () => toast({ title: "Ошибка", description: "Возможно, в домике ещё есть кассы", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Домики</h1>
          <p className="text-muted-foreground text-sm">Точки продаж на площадках ярмарки.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-house-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все площадки</SelectItem>
                {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button onClick={openCreate} data-testid="btn-create-house">
              <Plus className="mr-2 h-4 w-4" /> Добавить
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Площадка</TableHead>
                <TableHead>Касс</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !houses?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет домиков</TableCell></TableRow>
              ) : (
                houses.map((h) => (
                  <TableRow
                    key={h.id}
                    data-testid={`row-house-${h.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/registers?houseId=${h.id}`)}
                    title={`Показать кассы домика «${h.name}»`}
                  >
                    <TableCell className="font-medium flex items-center gap-2"><KeyRound className="h-3.5 w-3.5 text-muted-foreground" />{h.name}</TableCell>
                    <TableCell className="text-muted-foreground">{h.locationName ?? "—"}</TableCell>
                    <TableCell>{h.registerCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={h.isActive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>
                        {h.isActive ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setMenuHouse(h)} data-testid={`btn-menu-house-${h.id}`}>
                        <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" /> Меню
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setLocation(`/registers?houseId=${h.id}`)} data-testid={`btn-registers-house-${h.id}`}>
                        <Landmark className="mr-1.5 h-3.5 w-3.5" /> Кассы
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(h)} data-testid={`btn-edit-house-${h.id}`}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)} data-testid={`btn-delete-house-${h.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Редактировать домик" : "Новый домик"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Название *</FormLabel><FormControl><Input placeholder="Домик 1" {...field} data-testid="input-house-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="locationId" render={({ field }) => (
                <FormItem><FormLabel>Площадка *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                    <FormControl><SelectTrigger data-testid="select-house-location"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-submit-house">
                  {editing ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {menuHouse && (
        <HouseMenuDialog house={menuHouse} canManage={canManage} onClose={() => setMenuHouse(null)} />
      )}
    </div>
  );
}

type Product = { id: number; houseId: number; category: string; name: string; price: string; isActive: boolean; sortOrder: number };

const productSchema = z.object({
  category: z.string().min(1, "Категория обязательна"),
  name: z.string().min(1, "Название обязательно"),
  price: z.string().min(1, "Цена обязательна"),
});
type ProductFormData = z.infer<typeof productSchema>;

function HouseMenuDialog({ house, canManage, onClose }: { house: House; canManage: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = { houseId: house.id };
  const { data: products, isLoading } = useListProducts(params, { query: { queryKey: getListProductsQueryKey(params) } });
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const productsByCategory = ((products as Product[] | undefined) ?? []).reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const form = useForm<ProductFormData>({ resolver: zodResolver(productSchema), defaultValues: { category: "", name: "", price: "" } });

  function openCreateProduct(category?: string) {
    setEditingProduct(null);
    form.reset({ category: category ?? "", name: "", price: "" });
    setFormOpen(true);
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p);
    form.reset({ category: p.category, name: p.name, price: p.price });
    setFormOpen(true);
  }

  function submitProduct(data: ProductFormData) {
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) }); setFormOpen(false); };
    if (editingProduct) {
      update.mutate({ id: editingProduct.id, data: { category: data.category, name: data.name, price: Number(data.price) } }, {
        onSuccess: () => { toast({ title: "Товар обновлён" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: { houseId: house.id, category: data.category, name: data.name, price: Number(data.price) } }, {
        onSuccess: () => { toast({ title: "Товар добавлен" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDeleteProduct(id: number) {
    if (!confirm("Удалить товар из меню?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Товар удалён" }); queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) }); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Меню домика «{house.name}»</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !Object.keys(productsByCategory).length ? (
            <p className="text-sm text-muted-foreground">В меню пока нет товаров.</p>
          ) : (
            Object.entries(productsByCategory).map(([category, items]) => (
              <div key={category} className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</div>
                <div className="space-y-1">
                  {items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                      <span>{p.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{Number(p.price).toLocaleString("ru-RU")} сом</span>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditProduct(p)} data-testid={`btn-edit-product-${p.id}`}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteProduct(p.id)} data-testid={`btn-delete-product-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {canManage && (
            !formOpen ? (
              <Button variant="outline" size="sm" onClick={() => openCreateProduct()} data-testid="btn-add-product"><Plus className="mr-1.5 h-3.5 w-3.5" /> Добавить товар</Button>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(submitProduct)} className="space-y-3 rounded-lg border border-dashed border-border p-3">
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Категория *</FormLabel><FormControl><Input placeholder="напр. Горячие напитки" {...field} data-testid="input-product-category" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Название *</FormLabel><FormControl><Input placeholder="напр. Кофе американо" {...field} data-testid="input-product-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs">Цена (сом) *</FormLabel><FormControl><Input type="number" step="0.01" {...field} data-testid="input-product-price" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>Отмена</Button>
                    <Button type="submit" size="sm" disabled={create.isPending || update.isPending} data-testid="btn-submit-product">{editingProduct ? "Сохранить" : "Добавить"}</Button>
                  </div>
                </form>
              </Form>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
