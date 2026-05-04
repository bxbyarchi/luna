import { useState } from "react";
import { useListAuditLog, getListAuditLogQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
  submit: "Завершение",
};

const ENTITY_LABELS: Record<string, string> = {
  category: "Категория",
  item: "Позиция",
  receipt: "Поступление",
  write_off: "Списание",
  inventory_audit: "Инвентаризация",
  staff: "Сотрудник",
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-emerald-700 bg-emerald-50 border-emerald-200",
  update: "text-amber-700 bg-amber-50 border-amber-200",
  delete: "text-destructive bg-destructive/5 border-destructive/20",
  submit: "text-blue-700 bg-blue-50 border-blue-200",
};

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useListAuditLog(
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { query: { queryKey: getListAuditLogQueryKey({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }) } }
  );

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-audit-log">Журнал аудита</h1>
        <p className="text-muted-foreground text-sm">Все действия в системе.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Сущность</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : !rows.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет записей</TableCell></TableRow>
              ) : (
                rows.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${ACTION_COLORS[log.action] ?? ""}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{ENTITY_LABELS[log.entityType] ?? log.entityType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.entityId ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">{log.clerkUserId ? log.clerkUserId.slice(0, 16) + "…" : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.details ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Всего {total} записей</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} data-testid="btn-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm self-center">Стр. {page + 1} из {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="btn-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}