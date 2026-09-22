import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import {
  useListHouses, useCreateHouse, useUpdateHouse, useDeleteHouse,
  useListLocations, getListHousesQueryKey,
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
import { Plus, Edit, Trash2, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const houseSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  locationId: z.string().min(1, "Площадка обязательна"),
});
type HouseFormData = z.infer<typeof houseSchema>;

type House = { id: number; name: string; isActive: boolean; locationId: number; locationName?: string | null; registerCount: number };

export default function Houses() {
  const { user, canDo } = useCurrentUser();
  const isAdmin = canDo("admin");
  const [, setLocation] = useWouterLocation();
  const [locationFilter, setLocationFilter] = useState("");
  const listParams = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: houses, isLoading } = useListHouses(listParams, { query: { queryKey: getListHousesQueryKey(listParams) } });
  const { data: locations } = useListLocations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<House | null>(null);
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
                {locations?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
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
                {isAdmin && <TableHead className="text-right">Действия</TableHead>}
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
                    {isAdmin && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)} data-testid={`btn-edit-house-${h.id}`}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)} data-testid={`btn-delete-house-${h.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                      {locations?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
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
    </div>
  );
}
