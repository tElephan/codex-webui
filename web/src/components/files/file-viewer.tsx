/**
 * File viewer shell — shows file path header and delegates content to the
 * appropriate viewer (Monaco for code/text, ImageViewer for images, etc.).
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileWarning, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { filesGetMetadataOptions } from '@/generated/api/@tanstack/react-query.gen';
import { useFilesStore } from '@/stores/files-store';
import { getFileCategory, isInlineLoadingCategory } from '@/lib/file-category';
import { FileContentViewer } from './viewers';

export function FileViewer() {
  const { t } = useTranslation();
  const selectedFile = useFilesStore((s) => s.selectedFile);
  const setFileMtime = useFilesStore((s) => s.setFileMtime);

  const { data: metadata, isError, isLoading, refetch } = useQuery({
    ...filesGetMetadataOptions({ query: { path: selectedFile! } }),
    enabled: !!selectedFile,
  });

  // Track mtime for conflict detection (used by CodeViewer)
  useEffect(() => {
    if (metadata?.mtime != null) {
      setFileMtime(metadata.mtime);
    }
  }, [metadata?.mtime, setFileMtime]);

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('Select a file to view')}
      </div>
    );
  }

  // Inline viewers (media, PDF, image, office previews) own their loading state.
  const loadsInline = isInlineLoadingCategory(getFileCategory(selectedFile));

  if (isLoading && !loadsInline) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('Loading...')}
      </div>
    );
  }

  if (isError && !loadsInline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 opacity-60" />
          {t('Failed to load file')}
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('Retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* File path header */}
      <div className="flex shrink-0 items-center border-b border-border px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">
          {selectedFile}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <FileContentViewer filePath={selectedFile} />
      </div>
    </div>
  );
}
