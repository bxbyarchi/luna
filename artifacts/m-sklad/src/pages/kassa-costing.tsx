import { useState } from "react";
import {
  useListHouses, useListLocations, useListProducts, useListItems,
  useGetProductCost, useAddRecipeItem, useUpdateRecipeItem, useDeleteRecipeItem,
  getListProductsQueryKey, getGetProductCostQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ProductRow = { id: number; houseId: number; category: string; name: string; price: string; isActive: boolean; sortOrder: number };

function money(v: number | string) {
  return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сом";
}

export default function KassaCosting() {
  const { isVenueAdmin } = useCurrentUser();
  const [locationFilter, setLocationFilter] = useState("");
  const [houseId, setHouseId] = useState<string>("");
  const [costingProduct, setCostingProduct] = useState<ProductRow | null>(null);

  const { data: allLocations } = useListLocations();
  const venues = allLocations?.filter((l) => l.isVenue);
  const housesParams = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: houses } = useListHouses(housesParams);

  const productsParams = { houseId: houseId ? Number(houseId) : 0 };
  const { data: products, isLoading } = useListProducts(productsParams, { query: { queryKey: getListProductsQueryKey(productsParams), enabled: !!houseId } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-kassa-costing">Калькуляции</h1>
        <p className="text-muted-foreground text-sm">Себестоимость блюд кассы по составу из складских позиций.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isVenueAdmin && (
          <Select value={locationFilter || "all"} onValueChange={(v) => { setLocationFilter(v === "all" ? "" : v); setHouseId(""); }}>
            <SelectTrigger className="w-[200px]" data-testid="select-costing-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              {venues?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={houseId} onValueChange={setHouseId}>
          <SelectTrigger className="w-[220px]" data-testid="select-costing-house"><SelectValue placeholder="Выберите домик" /></SelectTrigger>
          <SelectContent>
            {houses?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}{h.locationName ? ` — ${h.locationName}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!houseId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Выберите домик, чтобы посчитать себестоимость его меню.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead className="text-right">Цена продажи</TableHead>
                  <TableHead className="text-right">Себестоимость</TableHead>
                  <TableHead className="text-right">Маржа</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
                ) : !products?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">В меню этого домика пока нет товаров</TableCell></TableRow>
                ) : (
                  (products as ProductRow[]).map((p) => <CostingRow key={p.id} product={p} onOpenRecipe={() => setCostingProduct(p)} />)
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {costingProduct && <RecipeDialog product={costingProduct} onClose={() => setCostingProduct(null)} />}
    </div>
  );
}

function CostingRow({ product, onOpenRecipe }: { product: ProductRow; onOpenRecipe: () => void }) {
  const { data: cost } = useGetProductCost(product.id, { query: { queryKey: getGetProductCostQueryKey(product.id) } });
  const margin = cost?.margin ?? Number(product.price);
  const marginPercent = cost?.marginPercent ?? 100;

  return (
    <TableRow data-testid={`row-costing-${product.id}`}>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell className="text-muted-foreground">{product.category}</TableCell>
      <TableCell className="text-right">{money(product.price)}</TableCell>
      <TableCell className="text-right">{cost ? money(cost.totalCost) : "—"}</TableCell>
      <TableCell className="text-right">
        <span className={margin >= 0 ? "text-emerald-700" : "text-destructive font-medium"}>{money(margin)}</span>
        {cost && <span className="text-muted-foreground text-xs ml-1">({marginPercent.toFixed(0)}%)</span>}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onOpenRecipe} data-testid={`btn-recipe-${product.id}`}>
          <Calculator className="mr-1.5 h-3.5 w-3.5" /> Состав
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RecipeDialog({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cost, isLoading } = useGetProductCost(product.id, { query: { queryKey: getGetProductCostQueryKey(product.id) } });
  const { data: items } = useListItems();
  const addItem = useAddRecipeItem();
  const updateItem = useUpdateRecipeItem();
  const removeItem = useDeleteRecipeItem();

  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetProductCostQueryKey(product.id) });
  }

  function submitAdd() {
    if (!selectedItemId || !(Number(quantity) > 0)) { toast({ title: "Выберите позицию и укажите количество", variant: "destructive" }); return; }
    addItem.mutate({ id: product.id, data: { itemId: Number(selectedItemId), quantity: Number(quantity) } }, {
      onSuccess: () => { toast({ title: "Компонент добавлен" }); setSelectedItemId(""); setQuantity(""); invalidate(); },
      onError: (e: unknown) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
    });
  }

  function changeQty(recipeItemId: number, value: string) {
    const qty = Number(value);
    if (!(qty > 0)) return;
    updateItem.mutate({ id: recipeItemId, data: { quantity: qty } }, {
      onSuccess: () => invalidate(),
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  function handleRemove(recipeItemId: number) {
    removeItem.mutate({ id: recipeItemId }, {
      onSuccess: () => { toast({ title: "Компонент удалён" }); invalidate(); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  const usedItemIds = new Set((cost?.ingredients ?? []).map((i) => i.itemId));
  const availableItems = (items ?? []).filter((it) => !usedItemIds.has(it.id));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Состав: {product.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {!cost?.ingredients.length ? (
                  <p className="text-sm text-muted-foreground">Состав ещё не задан.</p>
                ) : cost.ingredients.map((ing) => (
                  <div key={ing.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate">{ing.itemName}</span>
                    <Input
                      type="number"
                      step="0.001"
                      defaultValue={ing.quantity}
                      onBlur={(e) => e.target.value !== ing.quantity && changeQty(ing.id, e.target.value)}
                      className="w-20 h-7 text-xs"
                      data-testid={`input-recipe-qty-${ing.id}`}
                    />
                    <span className="text-muted-foreground text-xs w-10">{ing.unit}</span>
                    <span className="w-20 text-right text-xs text-muted-foreground">{money(ing.cost)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(ing.id)} data-testid={`btn-remove-recipe-${ing.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger className="flex-1 h-8" data-testid="select-recipe-item"><SelectValue placeholder="Складская позиция" /></SelectTrigger>
                  <SelectContent>
                    {availableItems.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.name} ({it.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" step="0.001" placeholder="Кол-во" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-20 h-8" data-testid="input-recipe-quantity" />
                <Button size="sm" onClick={submitAdd} disabled={addItem.isPending} data-testid="btn-add-recipe-item"><Plus className="h-3.5 w-3.5" /></Button>
              </div>

              {cost && (
                <div className="rounded-lg bg-muted/50 border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Цена продажи</span><span>{money(cost.price)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Себестоимость</span><span>{money(cost.totalCost)}</span></div>
                  <div className="flex justify-between font-semibold">
                    <span>Маржа</span>
                    <span className={cost.margin >= 0 ? "text-emerald-700" : "text-destructive"}>
                      {money(cost.margin)} <Badge variant="outline" className="ml-1">{cost.marginPercent.toFixed(0)}%</Badge>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
