/** Binary fallback viewer showing metadata and a hex dump of the first 256 bytes. */
import { useEffect, useMemo, useState } from 'react';
import { Binary, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { filesGetMetadata } from '@/generated/api/sdk.gen';
import { fetchPreviewBytes, type PreviewSource } from './preview-source';

interface Props {
  source: PreviewSource;
}

interface Metadata {
  size?: number;
  mimeType?: string;
}

export function BinaryViewer({ source }: Props) {
  const { t } = useTranslation();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({ size: source.kind === 'archive' ? source.size : undefined });
  const [error, setError] = useState<string | null>(null);

  // Reset state when source changes (adjusting state during render)
  const [prevSource, setPrevSource] = useState(source);
  if (source !== prevSource) {
    setPrevSource(source);
    setBytes(null);
    setError(null);
    setLoadAttempt(0);
    setMetadata({ size: source.kind === 'archive' ? source.size : undefined });
  }

  useEffect(() => {
    let cancelled = false;
    void loadBinaryPreview(source)
      .then(({ meta, result }) => {
        if (cancelled) return;
        setMetadata({
          size: meta.size ?? (source.kind === 'archive' ? source.size : undefined),
          mimeType: result?.response.headers.get('content-type') ?? meta.mimeType,
        });
        setBytes(result ? new Uint8Array(result.buffer) : new Uint8Array());
      })
      .catch(() => { if (!cancelled) setError(t('Failed to load binary preview')); });
    return () => { cancelled = true; };
  }, [loadAttempt, source, t]);

  const rows = useMemo(() => (bytes ? toHexRows(bytes) : []), [bytes]);

  if (error) {
    return (
      <BinaryMessage
        message={error}
        action={(
          <Button size="sm" variant="outline" onClick={() => {
            setBytes(null);
            setError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('Retry')}
          </Button>
        )}
      />
    );
  }
  if (!bytes) return <BinaryMessage icon={<Loader2 className="h-4 w-4 animate-spin" />} message={t('Loading...')} />;

  return (
    <div className="h-full overflow-auto p-4 text-sm">
      <div className="mb-4 grid gap-2 rounded-lg border border-border bg-card/50 p-4 md:grid-cols-2">
        <div><span className="text-muted-foreground">{t('Size')}:</span> {metadata.size ?? t('Unknown')}</div>
        <div><span className="text-muted-foreground">{t('MIME type')}:</span> {metadata.mimeType ?? t('Unknown')}</div>
      </div>
      {bytes.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
          {t('Empty file')}
        </div>
      ) : (
        <pre className="overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-5">
          {rows.join('\n')}
        </pre>
      )}
    </div>
  );
}

async function loadBinaryPreview(source: PreviewSource) {
  const meta = await loadMetadata(source);
  if (meta.size === 0) return { meta, result: null };
  const result = await fetchPreviewBytes(source, 'bytes=0-255');
  return { meta, result };
}

async function loadMetadata(source: PreviewSource): Promise<Metadata> {
  if (source.kind === 'archive') return { size: source.size };
  try {
    const { data } = await filesGetMetadata({ query: { path: source.filePath }, throwOnError: true });
    return { size: data.size };
  } catch {
    return {};
  }
}

function toHexRows(bytes: Uint8Array): string[] {
  const rows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.slice(offset, offset + 16);
    const hex = Array.from(slice).map((value) => value.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice).map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : '.')).join('');
    rows.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  ${ascii}`);
  }
  return rows;
}

function BinaryMessage({ icon, message, action }: { icon?: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        {icon ?? <Binary className="h-5 w-5 opacity-50" />}
        {message}
      </div>
      {action}
    </div>
  );
}
