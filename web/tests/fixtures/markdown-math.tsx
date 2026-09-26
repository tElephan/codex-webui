import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownRenderer } from '../../src/components/chat/markdown-renderer';
import { useThemeStore } from '../../src/stores/theme-store';
import i18n from '../../src/i18n';
import '../../src/index.css';

await i18n.changeLanguage('en');
useThemeStore.getState().setDark(false);
const initial = String.raw`Inline: $E=mc^2$ and \(\frac{a_1}{b_2}\).

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

\[
\begin{pmatrix}
1 & 2 \\
3 & 4
\end{pmatrix}
\]

Long equation:

\[` + Array.from({ length: 45 }, (_, index) => `x_{${index + 1}}`).join('+') + String.raw`=0\]

Code example: ` + '`$x$ \\(y\\)`' + '\n\n```latex\n\\frac{1}{2}\n```';

export function Fixture() {
  const [message, setMessage] = useState({ content: initial, completed: true });
  Object.assign(window, {
    mathTest: {
      setMessage,
      initial,
      reset: () => setMessage({ content: initial, completed: true }),
      setDark: (dark: boolean) => useThemeStore.getState().setDark(dark),
    },
  });
  return <main className="mx-auto max-w-3xl p-4"><MarkdownRenderer {...message} /></main>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
