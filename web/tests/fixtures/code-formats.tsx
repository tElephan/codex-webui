import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownRenderer } from '../../src/components/chat/markdown-renderer';
import { useThemeStore } from '../../src/stores/theme-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('en');
useThemeStore.getState().setDark(false);
const examples = [
  ['tex', String.raw`\section{TeX example} % comment`],
  ['LaTeX', String.raw`\frac{1}{2}`],
  ['C++', '#include <iostream>\nint main() { return 0; }'],
  ['java', 'public class Example { int value = 1; }'],
  ['python', 'def hello():\n    return "hi"'],
  ['vue', '<template><p>Hello</p></template>'],
];
const initial = examples.map(([language, code]) => `\`\`\`${language}\n${code}\n\`\`\``).join('\n\n');

export function Fixture() {
  const [message, setMessage] = useState({ content: initial, completed: true });
  Object.assign(window, {
    codeFormatsTest: {
      examples,
      setMessage,
      reset: () => setMessage({ content: initial, completed: true }),
      setDark: (dark: boolean) => useThemeStore.getState().setDark(dark),
    },
  });
  return <main className="mx-auto max-w-3xl p-4"><MarkdownRenderer {...message} /></main>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
