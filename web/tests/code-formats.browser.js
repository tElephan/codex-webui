/** Run on fixtures/code-formats.html; uses the actual Markdown renderer. */
(async () => {
  const test = window.codeFormatsTest;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const blocks = () => [...document.querySelectorAll('pre.shiki')];
  await until(() => blocks().length === test.examples.length, 'all fenced languages highlighted');
  for (const [index, [, source]] of test.examples.entries()) {
    check(blocks()[index].textContent === source, 'source text preserved exactly');
    check(blocks()[index].querySelectorAll('span[style]').length > 1, 'tokens have colors');
  }
  const colors = () => blocks().map((block) => block.querySelector('span[style]').style.color).join(',');
  const lightColors = colors();
  test.setDark(true);
  await until(() => blocks().length === test.examples.length && colors() !== lightColors, 'dark highlight palette');
  test.setDark(false);
  await until(() => blocks().length === test.examples.length && colors() === lightColors, 'light highlight palette');

  test.setMessage({ content: '```tex\n\\section{New streamed text}\n```', completed: false });
  await until(() => document.querySelector('main').textContent.includes('New streamed text'), 'streaming source visible');
  check(blocks().length === 0, 'streaming does not display stale highlighted HTML');
  check(!document.querySelector('main').textContent.includes('TeX example'), 'previous source removed');
  test.setMessage({ content: '```tex\n\\section{New streamed text}\n```', completed: true });
  await until(() => blocks().length === 1, 'completed TeX highlighted');
  test.setMessage({ content: '```unknown-format\n<script>window.codeExecuted = true</script>\n```', completed: true });
  await until(() => document.querySelector('main').textContent.includes('<script>'), 'unknown language readable');
  check(blocks().length === 0, 'no obsolete TeX highlight for an unsupported label');
  check(!window.codeExecuted && !document.querySelector('main script'), 'source is not executed');
  test.reset();
  await until(() => blocks().length === test.examples.length, 'restored examples');
  return { passed: true, languages: test.examples.map(([language]) => language), viewport: [innerWidth, innerHeight] };
})();
