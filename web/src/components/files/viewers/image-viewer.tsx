/** Image viewer using an authenticated fetch and a local Blob URL. */
import { useEffect, useState } from 'react';
import { ImageIcon, Loader2, RefreshCw, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fetchPreviewBlob, filePreviewSource, type PreviewSource } from './preview-source';

interface Props {
  filePath: string;
  source?: PreviewSource;
}

export function ImageViewer({ filePath, source }: Props) {
  const { t } = useTranslation();
  const previewSource = source ?? filePreviewSource(filePath);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;
    void fetchPreviewBlob(previewSource)
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [loadAttempt, previewSource]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ImageIcon className="h-8 w-8 opacity-40" />
        <span className="text-sm">{t('Failed to load image')}</span>
        <Button size="sm" variant="outline" onClick={() => {
          setBlobUrl(null);
          setError(false);
          setLoadAttempt((attempt) => attempt + 1);
        }}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('Retry')}
        </Button>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('Loading...')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))}
          title={t('Zoom out')}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
          title={t('Zoom in')}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title={t('Rotate')}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={() => {
            setZoom(1);
            setRotation(0);
          }}
        >
          {t('Reset')}
        </Button>
      </div>

      {/* Image area with checkerboard background for transparency */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
        <img
          src={blobUrl}
          alt={filePath.split('/').pop() ?? ''}
          onError={() => setError(true)}
          className="block max-h-full max-w-full object-contain transition-transform"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
