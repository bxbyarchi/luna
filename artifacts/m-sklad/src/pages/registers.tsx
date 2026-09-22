import { useState } from "react";
import { useSearch } from "wouter";
import {
  useListRegisters, useCreateRegister, useUpdateRegister, useDeleteRegister,
  useListHouses, useListLocations, getListRegistersQueryKey,
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
import { Plus, Edit, Trash2, X, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const registerSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  houseId: z.string().min(1, "Домик обязателен"),
});
type RegisterFormData = z.infer<typeof registerSchema>;

type RegisterRow = {
  id: number; name: string; isActive: boolean; houseId: number; houseName?: string | null;
  locationId?: number | null; locationName?: string | null;
};

export default function Registers() {
  const { canDo } = useCurrentUser();
  const isAdmin = canDo("admin");
  const searchString = useSearch();
  const initialHouseId = new URLSearchParams(searchString).get("houseId") ?? "";

  const [houseFilter, setHouseFilter] = useState(initialHouseId);
  const [locationFilter, setLocationFilter] = useState("");
  const listParams = {
    houseId: houseFilter ? Number(houseFilter) : undefined,
    locationId: locationFilter ? Number(locationFilter) : undefined,
  };
  const { data: registers, isLoading } = useListRegisters(listParams, { query: { queryKey: getListRegistersQueryKey(listParams) } });
  const { data: houses } = useListHouses();
  const { data: locations } = useListLocations();
  const activeHouse = houses?.find((h) => h.id === Number(houseFilter));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RegisterRow | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useCreateRegister();
  const update = useUpdateRegister();
  const remove = useDeleteRegister();

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", houseId: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", houseId: houseFilter || "" });
    setOpen(true);
  }

  function openEdit(r: RegisterRow) {
    setEditing(r);
    form.reset({ name: r.name, houseId: String(r.houseId) });
    setOpen(true);
  }

  function onSubmit(data: RegisterFormData) {
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey() }); setOpen(false); };
    if (editing) {
      update.mutate({ id: editing.id, data: { name: data.name } }, {
        onSuccess: () => { toast({ title: "Касса обновлена" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: { name: data.name, houseId: Number(data.houseId) } }, {
        onSuccess: () => { toast({ title: "Касса добавлена" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Удалить кассу?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Касса удалена" }); queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey() }); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeHouse ? `Кассы домика «${activeHouse.name}»` : "Кассы"}
          </h1>
          <p className="text-muted-foreground text-sm">Точки расчёта на ярмарке.</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} data-testid="btn-create-register">
            <Plus className="mr-2 h-4 w-4" /> Добавить
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
            {isAdmin && (
              <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[200px]" data-testid="select-filter-register-location"><SelectValue placeholder="Все площадки" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все площадки</SelectItem>
                  {locations?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={houseFilter || "all"} onValueChange={(v) => setHouseFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-register-house"><SelectValue placeholder="Все домики" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все домики</SelectItem>
                {houses?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeHouse && (
              <Button variant="ghost" size="sm" onClick={() => setHouseFilter("")} data-testid="btn-clear-house-filter">
                <X className="mr-1 h-3.5 w-3.5" /> Сбросить
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Домик</TableHead>
                <TableHead>Площадка</TableHead>
                <TableHead>Статус</TableHead>
                {isAdmin && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !registers?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет касс</TableCell></TableRow>
              ) : (
                registers.map((r) => (
                  <TableRow key={r.id} data-testid={`row-register-${r.id}`}>
                    <TableCell className="font-medium flex items-center gap-2"><Landmark className="h-3.5 w-3.5 text-muted-foreground" />{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.houseName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.locationName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.isActive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>
                        {r.isActive ? "Активна" : "Неактивна"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)} data-testid={`btn-edit-register-${r.id}`}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} data-testid={`btn-delete-register-${r.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Редактировать кассу" : "Новая касса"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Название *</FormLabel><FormControl><Input placeholder="Касса 1" {...field} data-testid="input-register-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="houseId" render={({ field }) => (
                <FormItem><FormLabel>Домик *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                    <FormControl><SelectTrigger data-testid="select-register-house"><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {houses?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}{h.locationName ? ` — ${h.locationName}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-submit-register">
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
