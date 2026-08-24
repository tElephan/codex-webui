/**
 * Code/text viewer using Monaco Editor.
 * Uses TanStack Query for file content, Zustand for mtime conflict detection.
 */
import { useCallback, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Code2, Eye, FileWarning, Loader2, RefreshCw, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { Button } from '@/components/ui/button';
import {
  filesReadFileOptions,
  filesWriteFileMutation,
  filesReadFileQueryKey,
} from '@/generated/api/@tanstack/react-query.gen';
import { useFilesStore } from '@/stores/files-store';

interface Props {
  filePath: string;
}

export function CodeViewer({ filePath }: Props) {
  const { t } = useTranslation();
  const fileMtime = useFilesStore((s) => s.fileMtime);
  const setFileMtime = useFilesStore((s) => s.setFileMtime);
  const queryClient = useQueryClient();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const markdown = isMarkdownFile(filePath);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>(
    markdown ? 'preview' : 'source',
  );
  const [draft, setDraft] = useState<string | null>(null);

  const { data: fileData, isError, isLoading, refetch } = useQuery({
    ...filesReadFileOptions({ query: { path: filePath } }),
  });

  const writeFile = useMutation({
    ...filesWriteFileMutation(),
    onSuccess: (res) => {
      setFileMtime(res.mtime);
      void queryClient.invalidateQueries({
        queryKey: filesReadFileQueryKey({ query: { path: filePath } }),
      });
    },
  });

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleSave = useCallback(() => {
    const value = draft ?? editorRef.current?.getValue();
    if (value !== undefined) {
      writeFile.mutate({
        body: {
          path: filePath,
          content: value,
          expectedMtime: fileMtime ?? undefined,
        },
      });
    }
  }, [draft, filePath, fileMtime, writeFile]);

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
  const language = guessLanguage(fileName);
  const content = draft ?? fileData?.content ?? '';
  const slash = filePath.lastIndexOf('/');
  const fileDirectory = slash > 0 ? filePath.slice(0, slash) : '/';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1">
        {markdown ? (
          <div
            role="group"
            aria-label={t('Markdown view')}
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
        ) : <span />}

        {viewMode === 'source' && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleSave}
            title={t('Save (Ctrl+S)')}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {viewMode === 'preview' ? (
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
            path={filePath}
            value={content}
            language={language}
            theme="vs-dark"
            height="100%"
            onMount={handleMount}
            onChange={(value) => setDraft(value ?? '')}
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

/** Maps file extension to Monaco language identifier. */
function guessLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    dockerfile: 'dockerfile',
    toml: 'ini',
    env: 'ini',
  };
  return map[ext] ?? 'plaintext';
}
