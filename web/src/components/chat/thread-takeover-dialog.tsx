/** Shows the process-wide impact before explicitly taking over an external writer. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  threadTakeoverPreviewOptions,
  threadTakeoverTakeoverMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import type { ThreadResumeResponseDto } from '@/generated/api';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTimelineStore } from '@/stores/timeline-store';

interface Props {
  threadId: string;
  open: boolean;
  onClose: () => void;
  onResumed: (response: ThreadResumeResponseDto) => void;
}

export function ThreadTakeoverDialog({
  threadId,
  open,
  onClose,
  onResumed,
}: Props) {
  const { t } = useTranslation();
  const preview = useQuery({
    ...threadTakeoverPreviewOptions({ path: { threadId } }),
    enabled: open,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const takeover = useMutation({
    ...threadTakeoverTakeoverMutation(),
    onSuccess: (response) => {
      onResumed(response);
      onClose();
    },
    onError: () => {
      void preview.refetch();
    },
  });
  const error = takeover.error ?? preview.error;
  const owner = preview.data?.ownerPid;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !takeover.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Take over this conversation?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Continue the original conversation here, keeping its history and branches.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview.isFetching && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('Checking conversation ownership…')}
          </p>
        )}
        {!!owner && (
          <div className="space-y-2 text-sm">
            <p className="text-destructive">
              {t(
                'This will stop the other Codex process and interrupt all {{count}} conversations it owns. Unsaved progress may be lost.',
                { count: preview.data!.affectedThreadIds.length },
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('Codex process: {{pid}}', { pid: owner })}
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3">
              {preview.data!.affectedThreadIds.map((id) => (
                <li key={id} className="break-words" title={id}>
                  {useTimelineStore.getState().getThreadTitle(id)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {preview.data && !owner && (
          <p className="text-sm">
            {t(
              'The other client has released this conversation. You can resume it now.',
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={takeover.isPending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <Button
            variant="outline"
            disabled={preview.isFetching || takeover.isPending}
            onClick={() => {
              takeover.reset();
              void preview.refetch();
            }}
          >
            {t('Refresh')}
          </Button>
          <Button
            variant={owner ? 'destructive' : 'default'}
            disabled={
              !preview.data ||
              preview.isFetching ||
              !!preview.error ||
              takeover.isPending
            }
            onClick={() =>
              takeover.mutate({
                path: { threadId },
                body: { confirmationToken: preview.data!.confirmationToken },
              })
            }
          >
            {takeover.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t(
              owner ? 'Stop other client and take over' : 'Resume conversation',
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
