/** Run on code-preview.html?file=MATH.md, optionally with &window=1. */
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
  const formulas = () => [...document.querySelectorAll('.markdown-content .katex')];
  const click = (title) => {
    const button = document.querySelector(`button[title="${title}"]`);
    check(button && !button.disabled, `${title} is available`);
    button.click();
  };
  const model = () => window.monaco?.editor.getEditors()[0]?.getModel();
  await until(() => formulas().length === 4, 'Markdown file formulas rendered through file viewer');
  await document.fonts.ready;
  check(document.querySelectorAll('.katex-display').length === 2, 'both display delimiters rendered');
  check(document.querySelectorAll('.katex-error').length === 0, 'no formula parse errors');
  check(formulas().every((node) => node.getBoundingClientRect().height > 0), 'math has visible height');
  check(document.querySelector('button[title="/fixture/example.tex"]'), 'relative file links resolve from Markdown directory');
  const lightColor = getComputedStyle(formulas()[0]).color;
  test.setDark(true);
  await until(() => getComputedStyle(formulas()[0]).color !== lightColor, 'preview math follows dark theme');
  test.setDark(false);
  await until(() => getComputedStyle(formulas()[0]).color === lightColor, 'preview math follows light theme');

  click('Source');
  await until(() => model()?.getLanguageId() === 'markdown', 'source editor mounted');
  check(model().getValue() === test.mathMarkdown, 'rendering preserves exact Markdown source');
  const edited = test.mathMarkdown + '\nAdditional inline formula: $x^2+y^2$.\n';
  model().setValue(edited);
  await until(() => test.getEdit()?.content === edited, 'draft stored');
  click('Preview');
  await until(() => formulas().length === 5, 'unsaved equation immediately appears in preview');
  check(test.writes.length === 0, 'preview does not save the draft');
  click('Source');
  await until(() => model()?.getValue() === edited, 'source switch preserves draft');
  click('Save (Ctrl+S)');
  await until(() => test.writes.length === 1 && !test.getEdit(), 'saved formula round trip');
  check(test.writes[0].content === edited, 'saved Markdown retains original delimiters');
  click('Preview');
  await until(() => formulas().length === 5, 'saved equations rendered');
  return { passed: true, formulas: 5, window: new URLSearchParams(location.search).has('window'), viewport: [innerWidth, innerHeight] };
})();
