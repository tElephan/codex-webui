import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  filesReadFileQueryKey,
  filesWriteFileMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import { useFilesStore } from '@/stores/files-store';

export function useSaveFile() {
  const queryClient = useQueryClient();
  const markFileSaved = useFilesStore((state) => state.markFileSaved);
  const setFileMtime = useFilesStore((state) => state.setFileMtime);

  return useMutation({
    ...filesWriteFileMutation(),
    onSuccess: (response, variables) => {
      const { path: filePath, content: savedContent } = variables.body;
      queryClient.setQueryData(
        filesReadFileQueryKey({ query: { path: filePath } }),
        (current) =>
          current
            ? {
                ...current,
                content: savedContent,
                size: new TextEncoder().encode(savedContent).byteLength,
              }
            : current,
      );
      markFileSaved(filePath, savedContent, response.mtime);
      if (useFilesStore.getState().selectedFile === filePath) {
        setFileMtime(response.mtime);
      }
      void queryClient.invalidateQueries({
        queryKey: filesReadFileQueryKey({ query: { path: filePath } }),
      });
    },
  });
}
