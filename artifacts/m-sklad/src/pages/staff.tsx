import { useState } from "react";
import {
  useListStaff, useCreateStaffMember, useUpdateStaffMember, useDeleteStaffMember,
  useListLocations, getListStaffQueryKey,
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
import { Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const staffSchema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  position: z.string().optional(),
  phone: z.string().optional(),
  locationId: z.string().optional(),
});
type StaffFormData = z.infer<typeof staffSchema>;

type StaffMember = {
  id: number; name: string; position?: string | null; phone?: string | null; isActive: boolean;
  locationId?: number | null; locationName?: string | null;
};

export default function Staff() {
  const { user, canDo } = useCurrentUser();
  const isAdmin = canDo("admin");
  const [locationFilter, setLocationFilter] = useState("");
  const listParams = { locationId: locationFilter ? Number(locationFilter) : undefined };
  const { data: staff, isLoading } = useListStaff(listParams, { query: { queryKey: getListStaffQueryKey(listParams) } });
  const { data: locations } = useListLocations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = useCreateStaffMember();
  const update = useUpdateStaffMember();
  const remove = useDeleteStaffMember();

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: "", position: "", phone: "", locationId: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", position: "", phone: "", locationId: isAdmin ? "" : String(user?.locationId ?? "") });
    setOpen(true);
  }

  function openEdit(m: StaffMember) {
    setEditing(m);
    form.reset({ name: m.name, position: m.position ?? "", phone: m.phone ?? "", locationId: m.locationId ? String(m.locationId) : "" });
    setOpen(true);
  }

  function onSubmit(data: StaffFormData) {
    const payload = { name: data.name, position: data.position, phone: data.phone, locationId: data.locationId ? Number(data.locationId) : null };
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() }); setOpen(false); };
    if (editing) {
      update.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { toast({ title: "Сотрудник обновлён" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "Сотрудник добавлен" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Удалить сотрудника?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Сотрудник удалён" }); queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() }); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-muted-foreground text-sm">Справочник персонала.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-staff-location"><SelectValue placeholder="Все склады" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {locations?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Button onClick={openCreate} data-testid="btn-create-staff">
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
                <TableHead>Имя</TableHead>
                <TableHead>Должность</TableHead>
                <TableHead>Склад</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Статус</TableHead>
                {isAdmin && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !staff?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет сотрудников</TableCell></TableRow>
              ) : (
                staff.map((m) => (
                  <TableRow key={m.id} data-testid={`row-staff-${m.id}`}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.position ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.locationName ?? "—"}</TableCell>
                    <TableCell>{m.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.isActive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>
                        {m.isActive ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m as StaffMember)} data-testid={`btn-edit-staff-${m.id}`}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} data-testid={`btn-delete-staff-${m.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Редактировать сотрудника" : "Новый сотрудник"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Имя *</FormLabel><FormControl><Input placeholder="Иван Иванов" {...field} data-testid="input-staff-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="position" render={({ field }) => (
                <FormItem><FormLabel>Должность</FormLabel><FormControl><Input placeholder="Официант" {...field} data-testid="input-staff-position" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="locationId" render={({ field }) => (
                <FormItem><FormLabel>Склад</FormLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!isAdmin}>
                    <FormControl><SelectTrigger data-testid="select-staff-location"><SelectValue placeholder="Не назначен" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {locations?.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Телефон</FormLabel><FormControl><Input placeholder="+7 999 000 00 00" {...field} data-testid="input-staff-phone" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-submit-staff">
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
