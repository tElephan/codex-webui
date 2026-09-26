/** Run on fixtures/markdown-math.html, on both desktop and mobile. */
(async () => {
  const test = window.mathTest;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await wait(50);
    }
  };
  const math = () => [...document.querySelectorAll('.katex')];
  await until(() => math().length === 5, 'inline and display formulas rendered');
  await document.fonts.ready;
  check(document.querySelectorAll('.katex-display').length === 3, 'block equations use display mode');
  check(document.querySelectorAll('math').length === 5, 'accessible MathML generated');
  check(document.querySelectorAll('.katex-error').length === 0, 'all sample formulas parsed');
  check(document.fonts.check('16px KaTeX_Main') && document.fonts.check('16px KaTeX_Math'), 'math fonts loaded');
  check([...document.fonts].filter((font) => font.family.startsWith('KaTeX')).every((font) => font.status !== 'error'), 'no math font failed');
  const longEquation = document.querySelectorAll('.katex-display')[2];
  check(longEquation.scrollWidth > longEquation.clientWidth, 'long formula scrolls inside its container');
  check(document.documentElement.scrollWidth <= innerWidth, 'math does not widen the page');
  check(longEquation.querySelector('.katex').getBoundingClientRect().left >= longEquation.getBoundingClientRect().left - 1,
    'start of long equation is reachable');
  longEquation.scrollLeft = longEquation.scrollWidth;
  check(longEquation.scrollLeft > 0, 'long formula can scroll to its end');
  const lightColor = getComputedStyle(math()[0]).color;
  test.setDark(true);
  await until(() => getComputedStyle(math()[0]).color !== lightColor, 'math follows dark theme');
  check(getComputedStyle(math()[0]).color === getComputedStyle(document.querySelector('.markdown-content')).color,
    'math inherits message text color');
  test.setDark(false);
  await until(() => getComputedStyle(math()[0]).color === lightColor, 'math follows light theme');
  check([...document.querySelectorAll('code')].some((node) => node.textContent === '$x$ \\(y\\)'), 'inline code remains literal');
  await until(() => document.querySelector('pre.shiki'), 'LaTeX code fence remains highlighted source');

  const streamed = String.raw`Now \[
\frac{a}{b} + \sqrt{x}
\] done.`;
  for (let end = 1; end <= streamed.length; end++) {
    test.setMessage({ content: streamed.slice(0, end), completed: false });
    await wait();
    check(document.querySelector('.markdown-content'), 'streaming never removes the message');
  }
  await until(() => document.querySelector('.katex-display'), 'closed formula renders while response is streaming');
  check(document.querySelector('.markdown-content').textContent.includes('done.'), 'text after formula survives');
  test.setMessage({ content: String.raw`Broken $\frac{1}{$ then valid $x^2$.`, completed: true });
  await until(() => document.querySelector('.katex-error'), 'invalid formula has readable fallback');
  check(document.querySelector('.katex'), 'invalid formula does not break a subsequent valid formula');
  test.reset();
  await until(() => math().length === 5, 'examples restored');
  return { passed: true, formulas: 5, streamedUpdates: streamed.length, viewport: [innerWidth, innerHeight] };
})();
