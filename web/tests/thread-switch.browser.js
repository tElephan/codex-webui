/** Run on fixtures/thread-switch.html. Uses actual sidebar clicks and route changes. */
(async () => {
  const test = window.threadSwitchTest;
  const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const main = () => document.querySelector('[data-chat-main]');
  const clickThread = (id) => {
    const button = [...document.querySelectorAll('aside button')]
      .find((node) => node.textContent.trim() === id);
    check(button, `sidebar contains ${id}`);
    button.click();
  };
  const checkLayout = (id, loaded = true) => {
    check(test.timeline.getState().threadId === id, `selected ${id}`);
    // A duplicate sibling key used to leave an orphan loading panel here.
    const scrollers = main().querySelectorAll(':scope > .overflow-y-auto');
    check(scrollers.length === 1, `exactly one message area after switching to ${id}; got ${scrollers.length}`);
    check(main().querySelectorAll('footer').length === 1, 'exactly one composer');
    const scroll = scrollers[0];
    const bounds = scroll.getBoundingClientRect();
    const headerBottom = main().querySelector('header').getBoundingClientRect().bottom;
    const footerTop = main().querySelector('footer').getBoundingClientRect().top;
    check(Math.abs(bounds.top - headerBottom) <= 2 && Math.abs(bounds.bottom - footerTop) <= 1,
      'messages occupy the full space between header and composer');
    check(document.documentElement.scrollHeight <= innerHeight, 'page does not overflow');
    if (loaded) {
      const rows = [...scroll.querySelectorAll('[data-index]')];
      check(rows.length > 0 && rows.every((row) => row.textContent.includes(id)),
        `only ${id} messages are rendered`);
      check(!scroll.textContent.includes('加载中'), 'old loading placeholder is removed');
    }
  };
  await wait(500);
  checkLayout('long-session');
  const readLong = 'GET /api/threads/long-session';
  const resumeShort = 'POST /api/threads/short-session/resume';
  test.hold(readLong);
  test.hold(resumeShort);
  const syncing = test.syncThread('long-session', true);
  await wait();
  check(test.syncState.getState().threads['long-session'].status === 'syncing',
    'first session is still syncing before switching');
  clickThread('short-session');
  await wait();
  checkLayout('short-session', false);
  check(test.pending().includes(resumeShort), 'new session history has not arrived yet');
  test.release(readLong);
  await syncing;
  await wait();
  checkLayout('short-session', false);
  test.release(resumeShort);
  await wait(400);
  checkLayout('short-session');

  // Reproduce the reported ordering with already cached messages as well.
  for (const target of ['long-session', 'third-session', 'short-session', 'long-session']) {
    const previous = test.timeline.getState().threadId;
    const key = `GET /api/threads/${previous}`;
    // Resolve any pending follow-up reconciliation before starting a delayed read.
    await test.syncThread(previous, true);
    test.hold(key);
    const pending = test.syncThread(previous, true);
    await wait(50);
    clickThread(target);
    await wait(300);
    checkLayout(target);
    test.release(key);
    await pending;
    await wait();
    checkLayout(target);
  }

  // A browser back/forward or branch link navigates without sidebar preselection.
  await test.navigate('short-session');
  await wait(300);
  checkLayout('short-session');
  await test.navigate('third-session');
  await wait(300);
  checkLayout('third-session');
  return { passed: true, viewport: [innerWidth, innerHeight], switches: 7 };
})();
