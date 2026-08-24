/**
 * Full-screen file browser panel (global view): tree sidebar + file viewer.
 * Desktop: inline tree sidebar (w-56) + viewer.
 * Mobile/Tablet: tree in Sheet overlay, viewer full-width with toggle button.
 */
import { useState } from 'react';
import { FileCode, FolderTree, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useFilesStore } from '@/stores/files-store';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';

/** Shared file tree header + tree component. */
function FileTreeSidebar({
  rootDir,
  onFileClick,
}: {
  rootDir: string | null;
  onFileClick?: (filePath: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground">
        {t('Explorer')}
      </div>
      {rootDir && (
        <div className="shrink-0 truncate border-b border-border px-3 pb-1.5 text-xs text-muted-foreground/60">
          {rootDir}
        </div>
      )}
      <FileTree onFileClick={onFileClick} />
    </>
  );
}

export function FilesPanel() {
  const { t } = useTranslation();
  const selectedFile = useFilesStore((s) => s.selectedFile);
  const rootDir = useFilesStore((s) => s.rootDir);
  const selectFile = useFilesStore((s) => s.selectFile);
  const selectFileForWindow = useFilesStore((s) => s.selectFileForWindow);
  const closeFileForWindow = useFilesStore((s) => s.closeFileForWindow);
  const fileTabs = useFilesStore((s) => s.windowFileTabs);
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint === 'desktop';
  const [treeSheetOpen, setTreeSheetOpen] = useState(false);
  const handleFileClick = (filePath: string) => {
    selectFileForWindow(filePath);
    setTreeSheetOpen(false);
  };

  const closeFileTab = (filePath: string) => {
    closeFileForWindow(filePath);
  };

  const fileTabsBar = fileTabs.length > 0 && (
    <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/20">
      {fileTabs.map((filePath) => {
        const name = filePath.split('/').pop() ?? filePath;
        const active = selectedFile === filePath;
        return (
          <div
            key={filePath}
            className={active ? 'flex shrink-0 border-b-2 border-primary' : 'flex shrink-0'}
          >
            <button
              type="button"
              onClick={() => selectFile(filePath)}
              className="flex min-w-0 items-center gap-1.5 pl-3 pr-1 text-xs text-muted-foreground hover:text-foreground"
              title={filePath}
            >
              <FileCode className="h-3 w-3 shrink-0" />
              <span className="max-w-48 truncate">{name}</span>
            </button>
            <button
              type="button"
              onClick={() => closeFileTab(filePath)}
              className="px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('Close')}
              aria-label={t('Close')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );

  const viewerContent = selectedFile ? (
    <FileViewer />
  ) : (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {t('Select a file to view')}
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-0 flex-1">
        <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/20">
          <FileTreeSidebar rootDir={rootDir} onFileClick={handleFileClick} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {fileTabsBar}
          {viewerContent}
        </div>
      </div>
    );
  }

  // Mobile/Tablet: file tree in Sheet, viewer full-width
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          onClick={() => setTreeSheetOpen(true)}
        >
          <FolderTree className="h-4 w-4" />
          {t('Explorer')}
        </Button>
        {rootDir && (
          <span className="truncate text-xs text-muted-foreground/60">{rootDir}</span>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {fileTabsBar}
        {viewerContent}
      </div>

      <Sheet open={treeSheetOpen} onOpenChange={setTreeSheetOpen}>
        <SheetContent side="left" className="!w-[280px] p-0 sm:!max-w-[320px]" showCloseButton={false}>
          <SheetTitle className="sr-only">{t('File explorer')}</SheetTitle>
          <div className="flex h-full flex-col bg-muted/20">
            <FileTreeSidebar rootDir={rootDir} onFileClick={handleFileClick} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
