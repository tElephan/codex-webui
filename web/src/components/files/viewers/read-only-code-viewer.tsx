/** Read-only Monaco viewer for archive entry text/code previews. */
import Editor from '@monaco-editor/react';
import { getCodeLanguage } from '@/lib/code-language';
import { registerCodeLanguages } from '@/lib/monaco-languages';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/theme-store';
import { fetchPreviewText, previewSourceLabel, type PreviewSource } from './preview-source';

interface Props {
  source: PreviewSource;
}

export function ReadOnlyCodeViewer({ source }: Props) {
  const { t } = useTranslation();
  const dark = useThemeStore((s) => s.dark);
  const label = previewSourceLabel(source);
  const { data, isLoading, error } = useQuery({
    queryKey: ['preview-text', source],
    queryFn: () => fetchPreviewText(source),
  });

  if (isLoading) {
    return <CenteredMessage icon={<Loader2 className="h-4 w-4 animate-spin" />} message={t('Loading...')} />;
  }
  if (error) return <CenteredMessage message={t('Failed to load file')} />;

  return (
    <Editor
      beforeMount={registerCodeLanguages}
      path={label}
      value={data ?? ''}
      language={getCodeLanguage(label) ?? 'plaintext'}
      theme={dark ? 'vs-dark' : 'vs'}
      height="100%"
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        padding: { top: 8 },
      }}
    />
  );
}

function CenteredMessage({ icon, message }: { icon?: React.ReactNode; message: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      {icon}
      {message}
    </div>
  );
}
