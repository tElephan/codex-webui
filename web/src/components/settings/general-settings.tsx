/** General settings: appearance, language, WebUI session logout. */
import { Globe, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';
import { SettingEditor } from './setting-editor';
import { useCategorySettings } from './use-category-settings';

interface Props {
  language: string;
  changeLanguage: (lang: string) => void;
  onLogout: () => void;
}

export function GeneralSettings({
  language,
  changeLanguage,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const runtimeSettings = useCategorySettings('general');

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t('Appearance')}
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3">
          <div className="flex items-center gap-3">
            {mode === 'system' ? (
              <Monitor className="h-4 w-4" />
            ) : mode === 'dark' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            <span className="text-sm">{t('Theme')}</span>
          </div>
          <select
            aria-label={t('Theme')}
            value={mode}
            onChange={(event) => setMode(event.target.value as ThemeMode)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="system">{t('Follow system')}</option>
            <option value="light">{t('Light mode')}</option>
            <option value="dark">{t('Dark mode')}</option>
          </select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4" />
            <span className="text-sm">{t('Language')}</span>
          </div>
          <div className="flex gap-1">
            <Button
              variant={language.startsWith('zh') ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => changeLanguage('zh-CN')}
            >
              简体中文
            </Button>
            <Button
              variant={!language.startsWith('zh') ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => changeLanguage('en')}
            >
              English
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('Runtime Settings')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              'Idle thread subscriptions are cleaned up in the browser while active or approval-blocked threads stay subscribed.',
            )}
          </p>
        </div>

        {runtimeSettings.isLoading && (
          <div className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
            {t('Loading...')}
          </div>
        )}

        {runtimeSettings.settings.map((setting) => (
          <SettingEditor
            key={setting.key}
            setting={setting}
            draft={runtimeSettings.drafts[setting.key] ?? ''}
            disabled={runtimeSettings.isSaving}
            onDraftChange={runtimeSettings.handleDraftChange}
            onSave={runtimeSettings.handleSave}
            onReset={runtimeSettings.handleReset}
          />
        ))}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t('Account')}
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-card/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogOut className="h-4 w-4 text-destructive" />
            <span className="text-sm">{t('Sign out of this session')}</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={onLogout}
          >
            {t('Logout')}
          </Button>
        </div>
      </section>
    </>
  );
}
