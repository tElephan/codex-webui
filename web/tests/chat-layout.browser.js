/** Run via agent-browser eval --stdin on fixtures/attachments.html at mobile,
 * landscape, short (keyboard-sized), and desktop viewport sizes.
 */
(async () => {
  const fixture = window.attachmentsTest;
  const threadId = 'attachments-test';
  const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const results = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const timeline = () => document.querySelector('[tabindex="0"].overflow-y-auto');
  const footer = () => document.querySelector('footer');
  const rect = (element) => element.getBoundingClientRect();
  const layout = (name) => {
    const head = rect(document.querySelector('header'));
    const chat = rect(timeline());
    const input = rect(footer());
    check(head.top >= 0 && head.height >= 50, `${name}: header remains visible`);
    check(chat.height >= innerHeight * 0.2, `${name}: chat retains usable height`);
    check(chat.top >= head.bottom && chat.bottom <= input.top + 1,
      `${name}: header, messages and composer do not overlap`);
    check(Math.abs(input.bottom - innerHeight) <= 1,
      `${name}: composer stays within the viewport`);
    check(document.documentElement.scrollHeight <= innerHeight &&
      document.documentElement.scrollWidth <= innerWidth,
      `${name}: page does not overflow`);
    results.push({ name, chatHeight: chat.height, composerHeight: input.height });
  };
  fixture.queue.setState({ queues: {} });
  fixture.drafts.getState().setDraft(threadId, '');
  await wait(300);
  layout('idle');

  fixture.timeline.getState().setActiveTurnIdForThread(threadId, 'turn-7');
  await wait();
  layout('response status');

  fixture.state.delay = 0;
  const files = new DataTransfer();
  for (let i = 0; i < 20; i++) {
    files.items.add(new File(['content'], `附件文档-${i}.txt`, { type: 'text/plain' }));
  }
  const fileInput = document.querySelector('input[type=file]:not([accept])');
  fileInput.files = files.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(500);
  check(document.querySelectorAll('button[aria-label^="移除附件"]').length === 20,
    'all selected attachments are present');
  fixture.drafts.getState().setDraft(threadId, '多行草稿\n'.repeat(30));
  await wait();
  layout('many attachments and long draft');

  for (let i = 0; i < 5; i++) fixture.queue.getState().enqueue({
    threadId, input: [{ type: 'text', text: `排队消息 ${i}` }], displayText: `排队消息 ${i}`,
  });
  await wait();
  layout('queued messages');
  for (const dark of [true, false]) {
    document.documentElement.classList.toggle('dark', dark);
    layout(dark ? 'dark theme' : 'light theme');
  }

  // Every control must remain reachable even if the composer must scroll.
  footer().scrollTop = footer().scrollHeight;
  await wait();
  for (const name of ['上传图片', '上传文件']) {
    const button = document.querySelector(`button[aria-label="${name}"]`);
    const bounds = rect(button);
    check(bounds.top >= rect(footer()).top && bounds.bottom <= innerHeight,
      `${name}: upload control remains reachable`);
  }
  const chatTop = timeline().scrollTop;
  footer().scrollTop = 0;
  await wait();
  check(Math.abs(timeline().scrollTop - chatTop) < 1,
    'scrolling composer does not move the conversation');

  // @ suggestions sit above the scrollable footer and must not be clipped by it.
  const input = document.querySelector('textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '@source');
  input.setSelectionRange(7, 7);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(300);
  const suggestion = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'source-0.ts');
  check(suggestion, 'file suggestions open');
  const bounds = rect(suggestion);
  check(bounds.top >= 0 && bounds.bottom <= rect(footer()).top,
    'suggestions fit above the composer');
  check(suggestion.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)),
    'suggestions are visible and clickable outside the scrolling composer');
  suggestion.click();
  await wait();
  check(input.value.includes('@source-0.ts'), 'suggestion selection still works');
  layout('after selecting a suggestion');

  fixture.timeline.getState().setThreadModeForThread(threadId, 'readOnly');
  await wait();
  layout('read-only notice');
  return { passed: true, viewport: [innerWidth, innerHeight], results };
})();
