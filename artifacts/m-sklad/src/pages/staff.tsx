import { useState } from "react";
import {
  useListStaff, useCreateStaffMember, useUpdateStaffMember, useDeleteStaffMember,
  getListStaffQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
});
type StaffFormData = z.infer<typeof staffSchema>;

type StaffMember = { id: number; name: string; position?: string | null; phone?: string | null; isActive: boolean };

export default function Staff() {
  const { data: staff, isLoading } = useListStaff({ query: { queryKey: getListStaffQueryKey() } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canDo } = useCurrentUser();

  const create = useCreateStaffMember();
  const update = useUpdateStaffMember();
  const remove = useDeleteStaffMember();

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: "", position: "", phone: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", position: "", phone: "" });
    setOpen(true);
  }

  function openEdit(m: StaffMember) {
    setEditing(m);
    form.reset({ name: m.name, position: m.position ?? "", phone: m.phone ?? "" });
    setOpen(true);
  }

  function onSubmit(data: StaffFormData) {
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() }); setOpen(false); };
    if (editing) {
      update.mutate({ id: editing.id, data }, {
        onSuccess: () => { toast({ title: "Сотрудник обновлён" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-muted-foreground text-sm">Справочник персонала.</p>
        </div>
        {canDo("admin") && (
          <Button onClick={openCreate} data-testid="btn-create-staff">
            <Plus className="mr-2 h-4 w-4" /> Добавить
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Должность</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Статус</TableHead>
                {canDo("admin") && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !staff?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет сотрудников</TableCell></TableRow>
              ) : (
                staff.map((m) => (
                  <TableRow key={m.id} data-testid={`row-staff-${m.id}`}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.position ?? "—"}</TableCell>
                    <TableCell>{m.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.isActive ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-muted-foreground"}>
                        {m.isActive ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                    {canDo("admin") && (
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
