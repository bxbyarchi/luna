import { useState } from "react";
import {
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const catSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  slug: z.string().min(1, "Slug обязателен").regex(/^[a-z0-9-]+$/, "Только латинские буквы, цифры и дефисы"),
  description: z.string().optional(),
});
type CatFormData = z.infer<typeof catSchema>;

type Category = { id: number; name: string; slug: string; description?: string | null };

export default function Categories() {
  const { data: categories, isLoading } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const form = useForm<CatFormData>({
    resolver: zodResolver(catSchema),
    defaultValues: { name: "", slug: "", description: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", slug: "", description: "" });
    setOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    form.reset({ name: cat.name, slug: cat.slug, description: cat.description ?? "" });
    setOpen(true);
  }

  function onSubmit(data: CatFormData) {
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setOpen(false); };
    if (editing) {
      update.mutate({ id: editing.id, data }, {
        onSuccess: () => { toast({ title: "Категория обновлена" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: () => { toast({ title: "Категория создана" }); invalidate(); },
        onError: () => toast({ title: "Ошибка", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Удалить категорию?")) return;
    remove.mutate({ id }, {
      onSuccess: () => { toast({ title: "Категория удалена" }); queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); },
      onError: () => toast({ title: "Ошибка", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Категории</h1>
          <p className="text-muted-foreground text-sm">Группы классификации позиций.</p>
        </div>
        <Button onClick={openCreate} data-testid="btn-create-category">
          <Plus className="mr-2 h-4 w-4" /> Добавить
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !categories?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Нет категорий</TableCell></TableRow>
              ) : (
                (categories as Category[]).map((cat) => (
                  <TableRow key={cat.id} data-testid={`row-category-${cat.id}`}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell className="text-muted-foreground">{cat.description ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cat)} data-testid={`btn-edit-cat-${cat.id}`}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cat.id)} data-testid={`btn-delete-cat-${cat.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Редактировать категорию" : "Новая категория"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Название *</FormLabel><FormControl><Input placeholder="Мебель" {...field} data-testid="input-cat-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="slug" render={({ field }) => (
                <FormItem><FormLabel>Slug *</FormLabel><FormControl><Input placeholder="furniture" {...field} data-testid="input-cat-slug" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Описание</FormLabel><FormControl><Input placeholder="Столы, стулья, диваны..." {...field} data-testid="input-cat-description" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={create.isPending || update.isPending} data-testid="btn-submit-cat">
                  {editing ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
