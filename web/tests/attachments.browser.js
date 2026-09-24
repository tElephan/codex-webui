/** Run via agent-browser eval --stdin after opening fixtures/attachments.html. */
(async () => {
  const test = window.attachmentsTest;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const imageInput = () => document.querySelector('input[type=file][accept]');
  const fileInput = () =>
    document.querySelector('input[type=file]:not([accept])');
  const button = (name) =>
    document.querySelector(`button[aria-label="${name}"]`);
  const choose = (input, files) => {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const removals = () => [
    ...document.querySelectorAll('button[aria-label^="移除附件"]'),
  ];
  const image = new File(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz0AAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    'sample.png',
    { type: 'image/png' },
  );
  const doc = new File(['hello'], 'notes one.txt', { type: 'text/plain' });
  await wait(200);
  for (const name of ['上传图片', '上传文件']) {
    const bounds = button(name).getBoundingClientRect();
    check(
      bounds.width > 40 &&
        bounds.height >= (innerWidth < 640 ? 40 : 32) &&
        bounds.left >= 0 &&
        bounds.right <= innerWidth,
      `${name} must be visible and easy to tap`,
    );
  }
  check(
    imageInput().multiple &&
      imageInput().accept === 'image/*' &&
      fileInput().multiple,
    'pickers support photos and multiple files',
  );
  let opened;
  imageInput().click = () => {
    opened = 'images';
  };
  fileInput().click = () => {
    opened = 'files';
  };
  button('上传图片').click();
  check(opened === 'images', 'image button opens image picker');
  button('上传文件').click();
  check(opened === 'files', 'file button opens file picker');

  test.state.delay = 250;
  choose(fileInput(), [image, doc]);
  await wait(60);
  check(
    document.body.innerText.includes('正在上传附件'),
    'upload progress is visible',
  );
  check(button('发送').disabled, 'cannot send partially uploaded attachments');
  document
    .querySelector('textarea')
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  check(test.state.turns.length === 0, 'Enter cannot submit while uploading');
  await wait(650);
  check(removals().length === 2, 'image and document both have chips');
  check(!button('发送').disabled, 'send enabled after upload');
  check(
    document.querySelector('textarea').value.includes('@notes\\ one.txt'),
    'file mention inserted with escaped spaces',
  );
  removals()
    .find((b) => b.getAttribute('aria-label').includes('sample'))
    .click();
  await wait(80);
  check(removals().length === 1, 'image removable on touch screens');
  choose(imageInput(), [image]);
  await wait(350);
  check(
    imageInput().value === '',
    'picker resets so the same file can be selected again',
  );
  button('发送').click();
  await wait(150);
  const input = test.state.turns[0].input;
  check(
    input.some((i) => i.type === 'localImage' && i.path.endsWith('sample.png')),
    'image included in submitted turn',
  );
  check(
    input.some(
      (i) =>
        i.type === 'text' && i.text.includes('@/uploads/1-notes\\ one.txt'),
    ),
    'file sent with uploaded absolute path',
  );
  check(removals().length === 0, 'sent attachments cleared');

  test.timeline.getState().clearActiveTurnForThread('attachments-test');
  test.state.fail = true;
  choose(fileInput(), [doc]);
  await wait(350);
  check(
    document
      .querySelector('[role=alert]')
      ?.innerText.includes('上传文件超过大小限制'),
    'upload failure is visible and translated',
  );
  check(
    !button('上传文件').disabled && removals().length === 0,
    'failed upload is retryable and does not create an attachment',
  );
  test.state.fail = false;
  test.state.delay = 0;
  choose(fileInput(), [
    doc,
    new File(['two'], 'notes two.txt', { type: 'text/plain' }),
  ]);
  await wait(200);
  check(
    removals().length === 2 &&
      document.querySelector('textarea').value.includes('@notes\\ two.txt'),
    'fast multi-file uploads preserve both mentions',
  );
  removals()
    .find((b) => b.getAttribute('aria-label').includes('one'))
    .click();
  await wait(100);
  check(
    !document.querySelector('textarea').value.includes('one.txt') &&
      document.querySelector('textarea').value.includes('two.txt'),
    'removing a file only removes its own mention',
  );

  const clipboard = new DataTransfer();
  clipboard.items.add(image);
  document
    .querySelector('textarea')
    .dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  await wait(150);
  check(removals().length === 2, 'paste still uploads images');

  test.state.delay = 600;
  choose(fileInput(), [doc]);
  await wait(50);
  test.timeline.getState().selectThread('other-thread');
  await wait(800);
  check(
    removals().length === 0 && document.querySelector('textarea').value === '',
    'in-flight uploads do not leak into another conversation',
  );
  check(!button('上传文件').disabled, 'new conversation is not left uploading');
  test.timeline.getState().setThreadModeForThread('other-thread', 'readOnly');
  await wait(100);
  check(
    button('上传图片').disabled && button('上传文件').disabled,
    'read-only conversations cannot upload',
  );
  check(
    document.documentElement.scrollWidth <= innerWidth,
    'no horizontal overflow',
  );
  return {
    passed: true,
    viewport: [innerWidth, innerHeight],
    uploads: test.state.uploads.length,
    turns: test.state.turns.length,
  };
})();
