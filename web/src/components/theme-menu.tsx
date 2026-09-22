import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';

const choices = [
  { mode: 'dark', label: 'Dark mode', icon: Moon },
  { mode: 'light', label: 'Light mode', icon: Sun },
  { mode: 'system', label: 'Follow system', icon: Monitor },
] as const;

export function ThemeMenu({ wide = false, onSelect }: { wide?: boolean; onSelect?: () => void }) {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const Icon = choices.find((choice) => choice.mode === mode)!.icon;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={wide ? 'sm' : 'icon'}
          className={wide ? 'h-8 w-full justify-start gap-2 px-3 font-normal' : 'h-8 w-8'}
          aria-label={t('Theme')}
          title={t('Theme')}
        >
          <Icon className="h-4 w-4" />
          {wide && t('Theme')}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => {
            setMode(value as ThemeMode);
            onSelect?.();
          }}>
            {choices.map(({ mode: value, label, icon: ChoiceIcon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="flex cursor-default items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                <ChoiceIcon className="h-4 w-4" />
                {t(label)}
                <span className="ml-auto h-4 w-4">
                  <DropdownMenu.ItemIndicator><Check className="h-4 w-4" /></DropdownMenu.ItemIndicator>
                </span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
