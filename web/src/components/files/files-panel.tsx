/**
 * Full-screen file browser panel (global view): tree sidebar + file viewer.
 * Desktop: inline tree sidebar (w-56) + viewer.
 * Mobile/Tablet: tree in Sheet overlay, viewer full-width with toggle button.
 */
import { useState, type FormEvent } from 'react';
import { FileCode, FolderOpen, FolderTree, Loader2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { filesAddRoot, filesGetMetadata } from '@/generated/api';
import { filesGetRootsQueryKey } from '@/generated/api/@tanstack/react-query.gen';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { getApiErrorMessage } from '@/lib/api-error';
import { useFilesStore } from '@/stores/files-store';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';

/** Shared file tree header + tree component. */
function FileTreeSidebar({
  rootDir,
  onFileClick,
  onOpenPath,
}: {
  rootDir: string | null;
  onFileClick?: (filePath: string) => void;
  onOpenPath: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{t('Explorer')}</span>
        <button
          type="button"
          onClick={onOpenPath}
          className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          title={t('Open path')}
          aria-label={t('Open path')}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
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

function getParentDirectory(filePath: string) {
  const separatorIndex = filePath.lastIndexOf('/');
  return separatorIndex <= 0 ? '/' : filePath.slice(0, separatorIndex);
}

function OpenPathDialog({
  open,
  initialPath,
  onOpenChange,
}: {
  open: boolean;
  initialPath: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setRootDir = useFilesStore((s) => s.setRootDir);
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState('');
  const selectFileForWindow = useFilesStore((s) => s.selectFileForWindow);
  const openPath = useMutation({
    mutationFn: async (requestedPath: string) => {
      const { data: metadata } = await filesGetMetadata({
        query: { path: requestedPath },
        throwOnError: true,
      });
      if (metadata.type !== 'directory' && metadata.type !== 'file') {
        throw new Error(t('Only files and directories can be opened'));
      }

      const rootDir = metadata.type === 'directory'
        ? metadata.path
        : getParentDirectory(metadata.path);
      await filesAddRoot({
        body: { root: rootDir },
        throwOnError: true,
      });
      return {
        rootDir,
        filePath: metadata.type === 'file' ? metadata.path : null,
      };
    },
    onSuccess: ({ rootDir, filePath }) => {
      setRootDir(rootDir);
      if (filePath) selectFileForWindow(filePath);
      void queryClient.invalidateQueries({ queryKey: filesGetRootsQueryKey() });
      onOpenChange(false);
    },
    onError: (reason) => {
      setError(getApiErrorMessage(reason, t('Cannot open path')));
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextPath = path.trim();
    if (!nextPath || openPath.isPending) return;
    setError('');
    openPath.mutate(nextPath);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (openPath.isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{t('Open path')}</DialogTitle>
            <DialogDescription>
              {t('Enter a file or directory path on the server.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                if (error) setError('');
              }}
              placeholder={t('Enter file or directory path...')}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={openPath.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!path.trim() || openPath.isPending}
            >
              {openPath.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {t('Open')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const [directoryDialogOpen, setDirectoryDialogOpen] = useState(false);
  const handleOpenPath = () => {
    // A modal Sheet traps focus while open. Close it before mounting the path
    // dialog so tablet users can focus and type into the input.
    setTreeSheetOpen(false);
    setDirectoryDialogOpen(true);
  };
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
          <FileTreeSidebar
            rootDir={rootDir}
            onFileClick={handleFileClick}
            onOpenPath={handleOpenPath}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {fileTabsBar}
          {viewerContent}
        </div>
        {directoryDialogOpen && (
          <OpenPathDialog
            open
            initialPath={rootDir ?? ''}
            onOpenChange={setDirectoryDialogOpen}
          />
        )}
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
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto shrink-0"
          onClick={handleOpenPath}
          title={t('Open path')}
          aria-label={t('Open path')}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {fileTabsBar}
        {viewerContent}
      </div>

      <Sheet open={treeSheetOpen} onOpenChange={setTreeSheetOpen}>
        <SheetContent side="left" className="!w-[280px] p-0 sm:!max-w-[320px]" showCloseButton={false}>
          <SheetTitle className="sr-only">{t('File explorer')}</SheetTitle>
          <div className="flex h-full flex-col bg-muted/20">
            <FileTreeSidebar
              rootDir={rootDir}
              onFileClick={handleFileClick}
              onOpenPath={handleOpenPath}
            />
          </div>
        </SheetContent>
      </Sheet>

      {directoryDialogOpen && (
        <OpenPathDialog
          open
          initialPath={rootDir ?? ''}
          onOpenChange={setDirectoryDialogOpen}
        />
      )}
    </div>
  );
}
