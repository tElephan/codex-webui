import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  root: webRoot,
  configFile: false,
  cacheDir: `${webRoot}node_modules/.vite-math-test`,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
after(() => vite.close());
const { remarkLatexMath } = await vite.ssrLoadModule('/src/lib/remark-latex-math.ts');
const render = (children) => renderToStaticMarkup(createElement(Markdown, {
  children,
  remarkPlugins: [remarkGfm, remarkMath, remarkLatexMath],
  rehypePlugins: [[rehypeKatex, { strict: 'ignore', trust: false }]],
}));
const count = (html, className) => html.split(`class="${className}"`).length - 1;

test('dollar and LaTeX delimiters produce inline and display equations', () => {
  const inline = render(String.raw`Energy $E=mc^2$ and fraction \(\frac{a_1}{b_2}\).`);
  assert.equal(count(inline, 'katex'), 2);
  assert.equal(count(inline, 'katex-display'), 0);
  assert.match(inline, /<mfrac>/);
  const display = render(String.raw`$$
\sum_{n=1}^{\infty} \frac{1}{n^2}
$$

\[
\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
\]`);
  assert.equal(count(display, 'katex-display'), 2);
  assert.match(display, /<mtable/);
  assert.equal(count(display, 'katex-error'), 0);
});

test('Markdown punctuation inside LaTeX stays in the equation', () => {
  const html = render(String.raw`Before \(a * b * c + \text{a\_b} + \underbrace{x}_{n}\) after.`);
  assert.equal(count(html, 'katex'), 1);
  assert.ok(!html.includes('<em>'));
  assert.ok(html.includes('Before ') && html.includes(' after.'));
  assert.match(render(String.raw`\[a+b=c\]`), /class="katex-display"/);
});

test('inline and fenced code preserve dollar and backslash formulas literally', () => {
  const source = String.raw`$x$ \(y\) \[z\]`;
  for (const markdown of ['`' + source + '`', '```latex\n' + source + '\n```', '    ' + source]) {
    const html = render(markdown);
    assert.equal(count(html, 'katex'), 0);
    assert.ok(html.includes(source));
  }
  const html = render(String.raw`Escaped \$5 and \$10, \\(x\\), [docs](https://example.com/path\(x\)).`);
  assert.equal(count(html, 'katex'), 0);
  assert.match(html, /href="https:\/\/example.com\/path\(x\)"/);
});

test('math composes with tables, lists and blockquotes', () => {
  const html = render(String.raw`| Name | Value |
| --- | --- |
| Fraction | \(\frac{1}{2}\) |

- Value $x_1$

> \[x^2+y^2=z^2\]`);
  assert.equal(count(html, 'katex'), 3);
  assert.equal(count(html, 'katex-display'), 1);
  assert.match(html, /<table>/);
  for (const markdown of [
    '> \\[\n> x + y\n> \\]',
    '- \\[\n  x + y\n  \\]',
    '\\[\r\nx + y\r\n\\]',
  ]) {
    const html = render(markdown);
    assert.equal(count(html, 'katex-display'), 1);
    assert.equal(count(html, 'katex-error'), 0);
  }
});

test('unfinished streaming input and invalid commands do not crash rendering', () => {
  const source = String.raw`Start \[
\frac{a}{b} + \sqrt{x}
\] end.`;
  for (let end = 1; end <= source.length; end++) assert.doesNotThrow(() => render(source.slice(0, end)));
  for (const source of [String.raw`$\frac{1}{$`, String.raw`\[\unknowncommand{x}\]`, '$$\n\\frac{1}{']) {
    const html = render(source);
    assert.ok(html.length > 0);
  }
  assert.equal(count(render(source), 'katex-display'), 1);
});

test('math cannot inject HTML or executable links', () => {
  const html = render(String.raw`$\href{javascript:alert(1)}{click}$ $\htmlClass{injected}{x}$`);
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('class="injected"'));
  assert.ok(!html.includes('<script'));
});
