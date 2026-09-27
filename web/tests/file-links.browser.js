/** Run on fixtures/file-links.html with both desktop and mobile viewports. */
(async () => {
  const test = window.fileLinksTest;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await wait(30);
    }
  };
  const click = (label) => {
    const button = [...document.querySelectorAll('.markdown-content button')].find((node) => node.textContent === label);
    check(button, `chat link ${label} exists`);
    button.click();
  };
  const chat = async (id = 'links') => {
    await test.chat(id);
    await until(() => document.querySelector('.markdown-content button'), 'chat links visible');
    await wait();
  };
  await until(() => document.querySelector('.markdown-content button'), 'chat loaded');
  await wait();
  const draft = test.files.getState().fileEdits['/previous/draft.ts'];
  for (const [label, directory, entry] of [
    ['Directory', '/work/reports.v1', 'result.md'],
    ['Trailing slash', '/work/reports.v1', 'result.md'],
    ['Relative directory', '/work/reports.v1', 'result.md'],
    ['Alias directory', '/work/reports.v1', 'result.md'],
    ['Unicode directory', '/work/资料 目录', 'notes.md'],
    ['Empty directory', '/work/empty', 'Empty directory'],
  ]) {
    click(label);
    await until(() => test.currentRoute() === '/files' && test.files.getState().rootDir === directory, `${label} opens its directory`);
    await until(() => document.querySelector('main').textContent.includes(entry), `${label} listing visible`);
    check(test.files.getState().selectedFile === null, 'directory is not selected as a file');
    check(!test.files.getState().windowFileTabs.includes(directory), 'directory creates no file tab');
    check(test.files.getState().windowFileTabs.includes('/previous/draft.ts'), 'existing file tab preserved');
    check(test.files.getState().fileEdits['/previous/draft.ts'] === draft, 'unsaved draft preserved');
    check(!document.querySelector('.monaco-editor'), 'directory is never loaded in code editor');
    if (innerWidth < 1024) check(!document.querySelector('[role="dialog"]'), 'mobile directory content is directly visible');
    if (label === 'Directory') {
      const child = [...document.querySelectorAll('[role="button"][data-slot="context-menu-trigger"]')].find((node) => node.textContent === 'result.md');
      check(child, 'directory child is clickable');
      child.click();
      await until(() => test.files.getState().selectedFile === '/work/reports.v1/result.md' && document.querySelector('h1'), 'child file opens from directory');
    }
    await chat();
  }
  check(!test.requests.some(({ endpoint, path }) => endpoint === '/api/files/read' && ['/work/reports.v1', '/work/资料 目录', '/work/empty'].includes(path)), 'no file read is issued for directories');

  for (const [label, path, selector] of [
    ['Markdown file', '/work/guide.md', 'h1'],
    ['Extensionless file', '/work/README', '.monaco-editor'],
  ]) {
    click(label);
    await until(() => test.files.getState().selectedFile === path && document.querySelector(selector), `${label} preview`);
    check(test.currentRoute() === '/t/links', 'files remain in the chat panel');
    document.querySelector('button[title="Close panel"]').click();
    await wait();
  }
  for (const label of ['Missing path', 'Forbidden path', 'Special path']) {
    const selected = test.files.getState().selectedFile;
    test.snackbar.getState().clear();
    click(label);
    await until(() => test.snackbar.getState().visible.length > 0, `${label} error shown`);
    check(test.currentRoute() === '/t/links' && test.files.getState().selectedFile === selected, 'failed link preserves current view');
    check(!document.querySelector('button[title="Close panel"]'), 'failed link does not open a broken preview');
  }
  test.snackbar.getState().clear();

  test.hold('/work/reports.v1');
  click('Directory');
  await until(() => test.pending('/work/reports.v1'), 'slow directory lookup pending');
  click('Markdown file');
  await until(() => test.files.getState().selectedFile === '/work/guide.md' && document.querySelector('h1'), 'newer file opens first');
  test.release('/work/reports.v1');
  await wait();
  check(test.currentRoute() === '/t/links', 'late directory lookup cannot replace newer file');
  document.querySelector('button[title="Close panel"]').click();
  await wait();

  test.hold('/work/reports.v1');
  click('Directory');
  await until(() => test.pending('/work/reports.v1'), 'second slow lookup pending');
  await chat('other-session');
  test.release('/work/reports.v1');
  await wait();
  check(test.currentRoute() === '/t/other-session', 'lookup from previous session cannot redirect the new one');
  return { passed: true, directoryLinks: 6, fileLinks: 2, viewport: [innerWidth, innerHeight] };
})();
