/** Shared choice/free-text form for blocking requests and async agent questions. */
import { useId, useRef, useState } from 'react';
import { CheckCircle, Loader2, MessageCircleQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import type { UserInputAnswers, UserInputQuestion } from '@/types/approval';

interface Props {
  questions: UserInputQuestion[];
  resolved: boolean;
  disabled?: boolean;
  submittedAnswers?: UserInputAnswers;
  onSubmit: (answers: UserInputAnswers) => Promise<void>;
}

export function UserInputForm({
  questions,
  resolved,
  disabled = false,
  submittedAnswers,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const formId = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions.map((q) => [q.id, submittedAnswers?.[q.id]?.answers[0] ?? '']),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const locked = resolved || disabled || submitting;
  const complete =
    questions.length > 0 && questions.every((q) => draft[q.id]?.trim());

  const submit = async () => {
    if (locked || !complete || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        Object.fromEntries(
          questions.map((q) => [q.id, { answers: [draft[q.id].trim()] }]),
        ),
      );
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form
      className={cn(
        'rounded-lg border text-sm',
        resolved
          ? 'border-muted bg-muted/5'
          : 'border-blue-500/50 bg-blue-500/5',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <MessageCircleQuestion
          className={cn(
            'h-4 w-4',
            resolved ? 'text-muted-foreground' : 'text-blue-500',
          )}
        />
        <span className="font-medium">{t('Input Requested')}</span>
        {resolved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3" /> {t('Resolved')}
          </span>
        )}
      </div>
      <div className="space-y-3 px-3 py-2">
        {questions.map((question) => {
          const value = draft[question.id] ?? '';
          const options = question.options ?? [];
          const selected = options.some((option) => option.label === value);
          const update = (answer: string) =>
            setDraft((prev) => ({ ...prev, [question.id]: answer }));
          return (
            <fieldset
              key={question.id}
              disabled={locked}
              className="min-w-0 space-y-2"
            >
              <legend className="mb-2 text-xs">
                {question.header && (
                  <span className="block font-medium">{question.header}</span>
                )}
                <span className="whitespace-pre-wrap text-muted-foreground">
                  {question.question}
                </span>
              </legend>
              {options.length > 0 && (
                <div className="space-y-1.5">
                  {options.map((option) => (
                    <label
                      key={option.label}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 hover:bg-accent/30',
                        value === option.label
                          ? 'border-primary bg-accent/30'
                          : 'border-border/60',
                      )}
                    >
                      <input
                        type="radio"
                        name={`${formId}-${question.id}`}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                        checked={value === option.label}
                        onChange={() => update(option.label)}
                      />
                      <span className="min-w-0 break-words text-xs">
                        <span className="block">{option.label}</span>
                        {option.description && (
                          <span className="block text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {(options.length === 0 || question.isOther) && (
                <Input
                  type={question.isSecret ? 'password' : 'text'}
                  aria-label={`${question.question} — ${t(options.length ? 'Other answer' : 'Answer')}`}
                  value={selected ? '' : value}
                  placeholder={t(options.length ? 'Other answer' : 'Answer')}
                  onChange={(event) => update(event.target.value)}
                />
              )}
            </fieldset>
          );
        })}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {!resolved && (
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={locked || !complete}>
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t('Submit')}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
