/** Run with agent-browser eval --stdin < web/tests/timeline-scroll.browser.js
 * after opening tests/fixtures/response-status.html. Uses the real virtualized timeline.
 */
(async () => {
  const fixture = window.responseTest;
  const store = fixture.timeline.getState();
  const threadId = 'response-test';
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const results = [];
  const check = (condition, name, detail) => {
    if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
    results.push({ name, ...detail });
  };
  const scroll = document.querySelector('main > div.overflow-y-auto');
  const gap = () =>
    scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
  let turnId = 'turn-test';
  let itemId = 'answer';
  const append = (text = '持续到达的新段落。\n\n') => {
    fixture.state.text += text;
    fixture.notify('item/agentMessage/delta', { turnId, itemId, delta: text });
  };
  const stream = async () => {
    for (let i = 0; i < 8; i++) {
      append();
      await wait(90);
    }
  };
  const bottom = async () => {
    scroll.scrollTop = scroll.scrollHeight;
    await wait(120);
  };
  const stays = async (name) => {
    const top = scroll.scrollTop;
    await stream();
    check(Math.abs(scroll.scrollTop - top) < 2, name, {
      top,
      after: scroll.scrollTop,
    });
  };

  // Let the fixture's initial recovery finish before beginning the stream.
  await wait(700);
  fixture.state.text = '正在阅读的历史内容。\n\n'.repeat(150);
  store.updateTurnItemForThread(threadId, turnId, itemId, (item) => ({
    ...item,
    content: fixture.state.text,
    completed: false,
  }));
  await wait(300);
  await stream();
  check(gap() < 2, 'follows streamed text while at the bottom', { gap: gap() });

  scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true }));
  scroll.scrollTop -= 40;
  await wait(100);
  await stays(
    'a small upward wheel scroll stays paused within the old 120px threshold',
  );

  scroll.scrollTop -= 500; // Scrollbar/programmatic scroll has no wheel event.
  await wait(100);
  await stays(
    'reading inside a growing turn preserves the exact scroll position',
  );

  const topBeforeHydration = scroll.scrollTop;
  const before = store.getThreadRuntime(threadId);
  store.reconcileThreadSnapshot(
    {
      id: threadId,
      cwd: '/work',
      status: { type: 'active', activeFlags: [] },
      turns: [
        {
          id: turnId,
          status: 'inProgress',
          items: [
            { type: 'agentMessage', id: itemId, text: fixture.state.text },
          ],
        },
      ],
    },
    before,
  );
  await wait(150);
  await stream();
  check(
    Math.abs(scroll.scrollTop - topBeforeHydration) < 2,
    'snapshot recovery does not resume following',
    { top: topBeforeHydration, after: scroll.scrollTop },
  );

  const topBeforeTurn = scroll.scrollTop;
  turnId = 'next-turn';
  itemId = 'next-answer';
  store.addUserMessageForThread(threadId, '下一条消息', undefined, turnId);
  fixture.notify('turn/started', { turn: { id: turnId } });
  append('新一轮回答。\n\n'.repeat(40));
  await wait(400);
  check(
    Math.abs(scroll.scrollTop - topBeforeTurn) < 2,
    'new turns do not drag the reader to the bottom',
    { top: topBeforeTurn, after: scroll.scrollTop },
  );

  await bottom();
  await stream();
  check(
    gap() < 2,
    'returning to the bottom resumes following across virtualized rows',
    { gap: gap() },
  );

  // ResizeObserver must keep following delayed rendered content, even without a delta.
  const lastRow = [...scroll.querySelectorAll('[data-index]')].at(-1);
  const delayedContent = document.createElement('div');
  delayedContent.style.height = '200px';
  lastRow.append(delayedContent);
  await wait(250);
  check(gap() < 2, 'follows delayed height changes while at the bottom', {
    gap: gap(),
  });
  delayedContent.remove();
  await wait(200);

  const touch = (type, y) =>
    scroll.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        touches: [new Touch({ identifier: 1, target: scroll, clientY: y })],
      }),
    );
  touch('touchstart', 100);
  touch('touchmove', 150);
  // Intent arrives before the browser's scroll event; it must cancel pending following.
  await stays('upward touch gesture pauses before native scrolling starts');
  touch('touchend', 150);

  await bottom();
  scroll.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }),
  );
  await stays('PageUp cancels following before the scroll event');

  await bottom();
  append();
  scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, bubbles: true }));
  scroll.scrollTop -= 30;
  await wait(100);
  await stays('upward input cancels a queued automatic scroll');

  // Explicit navigation must stop the virtualizer following the end of this large row.
  store.addApprovalForThread(threadId, {
    threadId,
    turnId,
    itemId: 'pending-command',
    requestId: 900,
    kind: 'commandExecution',
    status: 'pending',
    command: 'pwd',
  });
  store.updateCurrentTurnForThread(threadId, turnId, (items) => ({
    items: [
      {
        type: 'commandExecution',
        itemId: 'pending-command',
        content: '',
        command: 'pwd',
        completed: false,
      },
      ...items,
    ],
    completed: false,
  }));
  await wait(100);
  window.dispatchEvent(
    new CustomEvent('codex-webui:show-request', {
      detail: { threadId, turnId, requestId: '900' },
    }),
  );
  await wait(200);
  const card = scroll
    .querySelector('[data-request-id="900"]')
    .getBoundingClientRect();
  check(
    card.top >= 0 && card.bottom <= innerHeight,
    'request navigation reveals its card',
    { top: card.top, bottom: card.bottom },
  );
  await stays('request navigation does not keep following the growing turn');
  // Put the older turn fully above the viewport. Changes within the visible
  // portion of a row must instead preserve that row's existing text.
  const olderRow = scroll.querySelector('[data-index="0"]');
  scroll.scrollTop += Math.max(
    0,
    olderRow.getBoundingClientRect().bottom -
      scroll.getBoundingClientRect().top +
      10,
  );
  await wait(100);
  const anchor = scroll.querySelector('[data-request-id="900"]');
  const anchorTop = anchor.getBoundingClientRect().top;
  store.updateTurnItemForThread(threadId, 'turn-test', 'answer', (item) => ({
    ...item,
    content: item.content + '迟到的上方内容。\n\n'.repeat(15),
  }));
  await wait(250);
  check(
    Math.abs(anchor.getBoundingClientRect().top - anchorTop) < 2,
    'height changes above the viewport preserve the visible reading anchor',
    { before: anchorTop, after: anchor.getBoundingClientRect().top },
  );
  return {
    passed: results.length,
    viewport: [innerWidth, innerHeight],
    results,
  };
})();
