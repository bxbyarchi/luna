import { useRef, useState } from "react";
import { Camera, X, Loader2, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE_MB = 10;

interface Props {
  value?: string[] | null;
  onChange: (objectPaths: string[]) => void;
  label?: string;
}

export function PhotoUploader({ value, onChange, label = "Добавить фото" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const photos = value ?? [];

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

      onChange([...photos, objectPath]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки фото";
      setError(msg);
      toast({ title: "Ошибка загрузки фото", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removePhoto(index: number) {
    const next = photos.filter((_, i) => i !== index);
    onChange(next);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        data-testid="photo-file-input"
        aria-label="Загрузить фото"
      />
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((path, index) => {
            const photoUrl = `/api/storage/objects/${path.replace(/^\/objects\//, "")}`;
            return (
              <div key={index} className="relative group">
                <a href={photoUrl} target="_blank" rel="noopener noreferrer" title="Открыть фото">
                  <img
                    src={photoUrl}
                    alt={`Фото ${index + 1}`}
                    className="h-16 w-16 rounded-md object-cover border border-border hover:opacity-90 transition-opacity"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  aria-label={`Удалить фото ${index + 1}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => { setError(null); inputRef.current?.click(); }}
        disabled={uploading}
        data-testid="photo-upload-btn"
      >
        {uploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : photos.length > 0 ? (
          <Plus className="mr-2 h-4 w-4" />
        ) : (
          <Camera className="mr-2 h-4 w-4" />
        )}
        {uploading ? "Загрузка..." : photos.length > 0 ? "Добавить ещё фото" : label}
      </Button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
