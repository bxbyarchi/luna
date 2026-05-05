import { useRef, useState } from "react";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE_MB = 10;

interface Props {
  value?: string | null;
  onChange: (objectPath: string | null) => void;
  label?: string;
}

export function PhotoUploader({ value, onChange, label = "Добавить фото" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      setError(`Файл слишком большой (максимум ${MAX_FILE_SIZE_MB} МБ)`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Поддерживаются только изображения");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      if (!urlRes.ok) {
        throw new Error(`Не удалось получить URL для загрузки (${urlRes.status})`);
      }

      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error(`Ошибка загрузки файла (${uploadRes.status})`);
      }

      onChange(objectPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки фото";
      setError(msg);
      toast({ title: "Ошибка загрузки фото", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const photoUrl = value
    ? `/api/storage/objects/${value.replace(/^\/objects\//, "")}`
    : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          data-testid="photo-file-input"
          aria-label="Загрузить фото"
        />
        {photoUrl ? (
          <div className="flex items-center gap-2">
            <a href={photoUrl} target="_blank" rel="noopener noreferrer" title="Открыть фото">
              <img
                src={photoUrl}
                alt="Фото поставки"
                className="h-16 w-16 rounded-md object-cover border border-border hover:opacity-90 transition-opacity"
              />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => { onChange(null); setError(null); }}
              aria-label="Удалить фото"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => { setError(null); inputRef.current?.click(); }}
            disabled={uploading}
            data-testid="photo-upload-btn"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Загрузка..." : label}
          </Button>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
