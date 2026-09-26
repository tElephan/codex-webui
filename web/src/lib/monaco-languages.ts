import type { BeforeMount } from '@monaco-editor/react';

/** Monaco has no built-in TeX grammar. Register it before either viewer mounts. */
export const registerCodeLanguages: BeforeMount = (monaco) => {
  if (monaco.languages.getLanguages().some(({ id }: { id: string }) => id === 'latex')) return;
  monaco.languages.register({ id: 'latex', extensions: ['.tex', '.latex', '.ltx', '.sty', '.cls'], aliases: ['LaTeX', 'TeX'] });
  monaco.languages.setLanguageConfiguration('latex', {
    comments: { lineComment: '%' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }],
  });
  monaco.languages.setMonarchTokensProvider('latex', {
    tokenizer: {
      root: [
        [/\\[a-zA-Z@]+\*?/, 'keyword'],
        [/\\./, 'string.escape'],
        [/%.*$/, 'comment'],
        [/\$\$?|[&_^]/, 'operator'],
        [/[{}[\]()]/, 'delimiter'],
        [/\d+(?:\.\d+)?/, 'number'],
      ],
    },
  });
};
