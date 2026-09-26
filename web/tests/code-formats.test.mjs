import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  root: webRoot,
  configFile: false,
  cacheDir: `${webRoot}node_modules/.vite-code-formats-test`,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
after(() => vite.close());
const { getFileCategory } = await vite.ssrLoadModule('/src/lib/file-category.ts');
const { getCodeLanguage } = await vite.ssrLoadModule('/src/lib/code-language.ts');
const { highlightCode } = await vite.ssrLoadModule('/src/lib/code-highlight.ts');

test('common source files reach the code viewer with the correct language', () => {
  for (const [path, language] of [
    ['/notes/paper.tex', 'latex'], ['/notes/paper.TEX', 'latex'],
    ['archive/format.sty', 'latex'], ['C:\\notes\\paper.ltx', 'latex'],
    ['main.c', 'c'], ['main.cpp', 'cpp'], ['include/example.hxx', 'cpp'],
    ['Example.java', 'java'], ['Program.cs', 'csharp'], ['main.py', 'python'],
    ['index.mjs', 'javascript'], ['types.d.mts', 'typescript'],
    ['App.vue', 'html'], ['service.proto', 'proto'], ['main.tf', 'hcl'],
    ['example.sol', 'sol'], ['script.coffee', 'coffeescript'],
    ['Dockerfile.dev', 'dockerfile'], ['.env.local', 'ini'],
    ['Makefile.am', 'plaintext'], ['CMakeLists.txt', 'plaintext'],
    ['paper.bib', 'plaintext'], ['main.zig', 'plaintext'],
  ]) {
    assert.equal(getFileCategory(path), 'code', path);
    assert.equal(getCodeLanguage(path), language, path);
  }
});

test('media, archive and unknown binary files retain their viewers', () => {
  for (const [path, category] of [
    ['photo.png', 'image'], ['drawing.svg', 'image'], ['paper.pdf', 'pdf'],
    ['video.mp4', 'video'], ['font.woff2', 'font'], ['song.mp3', 'audio'],
    ['files.tar.gz', 'archive'], ['files.zip', 'archive'], ['report.docx', 'docx'],
    ['sheet.xlsx', 'xlsx'], ['slides.pptx', 'pptx'], ['program.exe', 'binary'],
    ['model.bin', 'binary'], ['Example.class', 'binary'], ['data.unknown', 'binary'],
  ]) assert.equal(getFileCategory(path), category, path);
});

test('loads common fenced grammars and aliases on demand, in both themes', async () => {
  const examples = [
    ['tex', String.raw`\section{Example} % comment`],
    ['LaTeX', String.raw`\frac{1}{2}`],
    ['C++', '#include <iostream>\nint main() { return 0; }'],
    ['java', 'public class Example { int value = 1; }'],
    ['c#', 'public class Example { int value = 1; }'],
    ['py', 'def hello():\n    return "hi"'],
    ['yml', 'name: example'],
    ['typescript', 'const value: number = 1;'],
    ['vue', '<template><p>Hello</p></template>'],
  ];
  await Promise.all(examples.map(async ([language, source]) => {
    for (const dark of [false, true]) {
      const html = await highlightCode(source, language, dark);
      assert.match(html, /class="shiki /, language);
      assert.match(html, /<span style="color:/, language);
      assert.match(html, dark ? /background-color:#24292e/ : /background-color:#fff/, language);
    }
  }));
});

test('unsupported labels fall back to text and highlighted source remains escaped', async () => {
  for (const language of ['made-up-language', '__proto__', 'constructor', 'text', '']) {
    assert.equal(await highlightCode('readable source', language, false), null);
  }
  const html = await highlightCode('<script>alert(1)</script>', 'html', false);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&#x3C;|&lt;/);
});
