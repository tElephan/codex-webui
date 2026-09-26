/** Run on code-preview.html?file=example.tex (or ?file=example.zip&entry=example.tex). */
(async () => {
  const test = window.codePreviewTest;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const editor = () => window.monaco?.editor.getEditors()[0];
  const model = () => editor()?.getModel();
  const archive = new URLSearchParams(location.search).has('entry');
  await until(() => model()?.getLanguageId() === 'latex', 'TeX editor mounted through dispatcher');
  check(model().getValue().includes('\n\\documentclass{article}'), 'TeX source loaded');
  await until(() => document.querySelector('.monaco-editor').getBoundingClientRect().height > 200, 'editor layout has usable height');
  const tokens = window.monaco.editor.tokenize('\\section{Hi} 50\\% % comment', 'latex')[0];
  check(tokens.some((token) => token.type === 'keyword.latex'), 'TeX commands highlighted');
  check(tokens.some((token) => token.type === 'string.escape.latex'), 'escaped percent preserved');
  check(tokens.some((token) => token.type === 'comment.latex'), 'TeX comments highlighted');
  check(editor().getOption(window.monaco.editor.EditorOption.readOnly) === archive, 'archive is read-only, workspace is editable');

  const original = model().getValue();
  if (!archive) {
    model().setValue(original + '\n% an unsaved edit');
    await until(() => test.getEdit()?.content.endsWith('% an unsaved edit'), 'draft stored');
  }
  test.setDark(true);
  await until(() => document.querySelector('.monaco-editor.vs-dark'), 'dark editor');
  test.setDark(false);
  await until(() => document.querySelector('.monaco-editor.vs'), 'light editor');
  check(model().getValue() === original + (archive ? '' : '\n% an unsaved edit'), 'theme changes preserve content');
  if (!archive) {
    const save = document.querySelector('button[title="Save (Ctrl+S)"]');
    check(save && !save.disabled, 'save available for TeX');
    save.click();
    await until(() => test.writes.length === 1, 'TeX saved');
    check(test.writes[0].content.endsWith('% an unsaved edit'), 'saved content is correct');
    for (const [name, language] of [['example.cpp', 'cpp'], ['example.java', 'java'], ['example.py', 'python'], ['example.vue', 'html'], ['example.proto', 'proto'], ['.env.local', 'ini']]) {
      test.openFile(name);
      await until(() => model()?.getLanguageId() === language, `${name} preview`);
      check(model().getValue().length > 10, `${name} source loaded`);
      check(window.monaco.languages.getLanguages().some(({ id }) => id === language), `${name} grammar registered`);
    }
  }
  return { passed: true, archive, viewport: [innerWidth, innerHeight] };
})();
