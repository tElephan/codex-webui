/**
 * Code/text viewer using Monaco Editor.
 * Uses TanStack Query for file content, Zustand for mtime conflict detection.
 */
import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { getCodeLanguage } from '@/lib/code-language';
import { registerCodeLanguages } from '@/lib/monaco-languages';
import {
  Code2,
  Eye,
  FileWarning,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { Button } from '@/components/ui/button';
import { filesReadFileOptions } from '@/generated/api/@tanstack/react-query.gen';
import { useSaveFile } from '@/hooks/use-save-file';
import { useFilesStore } from '@/stores/files-store';
import { useThemeStore } from '@/stores/theme-store';

interface Props {
  filePath: string;
}

export function CodeViewer({ filePath }: Props) {
  const { t } = useTranslation();
  const dark = useThemeStore((s) => s.dark);
  const fileMtime = useFilesStore((s) => s.fileMtime);
  const fileEdit = useFilesStore((s) => s.fileEdits[filePath]);
  const setFileEdit = useFilesStore((s) => s.setFileEdit);
  const discardFileEdit = useFilesStore((s) => s.discardFileEdit);
  const markdown = isMarkdownFile(filePath);
  const html = /\.html?$/i.test(filePath);
  const hasPreview = markdown || html;
  const [viewMode, setViewMode] = useState<'preview' | 'source'>(
    hasPreview ? 'preview' : 'source',
  );

  const {
    data: fileData,
    isError,
    isLoading,
    refetch,
  } = useQuery({
    ...filesReadFileOptions({ query: { path: filePath } }),
  });
  const persistedContent = fileData?.content ?? '';

  const writeFile = useSaveFile();

  useEffect(() => {
    if (fileData && fileEdit?.content === fileData.content) {
      discardFileEdit(filePath);
    }
  }, [discardFileEdit, fileData, fileEdit?.content, filePath]);

  const handleSave = useCallback(() => {
    if (!fileEdit || writeFile.isPending) return;
    writeFile.mutate({
      body: {
        path: filePath,
        content: fileEdit.content,
        expectedMtime: fileEdit.expectedMtime ?? undefined,
      },
    });
  }, [fileEdit, filePath, writeFile]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('Loading...')}
      </div>
    );
  }

  if (isError) {
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

  const fileName = filePath.split('/').pop() ?? filePath;
  const language = getCodeLanguage(fileName) ?? 'plaintext';
  const content = fileEdit?.content ?? persistedContent;
  const hasUnsavedChanges = Boolean(fileEdit);
  const slash = filePath.lastIndexOf('/');
  const fileDirectory = slash > 0 ? filePath.slice(0, slash) : '/';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1">
        {hasPreview ? (
          <div
            role="group"
            aria-label={html ? t('HTML view') : t('Markdown view')}
            className="flex h-6 items-center rounded-md bg-muted p-0.5"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'preview'}
              onClick={() => setViewMode('preview')}
              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              title={t('Preview')}
            >
              <Eye className="h-3 w-3" />
              {t('Preview')}
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'source'}
              onClick={() => setViewMode('source')}
              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              title={t('Source')}
            >
              <Code2 className="h-3 w-3" />
              {t('Source')}
            </button>
          </div>
        ) : (
          <span />
        )}

        {viewMode === 'source' && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleSave}
            disabled={!hasUnsavedChanges || writeFile.isPending}
            title={t('Save (Ctrl+S)')}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {viewMode === 'preview' && html ? (
          <iframe
            title={t('HTML preview')}
            srcDoc={content}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        ) : viewMode === 'preview' ? (
          <div className="h-full overflow-auto px-4 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-5">
            <div className="mx-auto max-w-4xl">
              <MarkdownRenderer
                content={content}
                completed
                localLinkBase={fileDirectory}
                allowBareRelativeLinks
              />
            </div>
          </div>
        ) : (
          <Editor
            beforeMount={registerCodeLanguages}
            path={filePath}
            value={content}
            language={language}
            theme={dark ? 'vs-dark' : 'vs'}
            height="100%"
            onChange={(value) =>
              setFileEdit(filePath, value ?? '', persistedContent, fileMtime)
            }
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 },
            }}
          />
        )}
      </div>
    </div>
  );
}

function isMarkdownFile(filePath: string): boolean {
  return /\.(?:md|markdown|mdx)$/i.test(filePath);
}
