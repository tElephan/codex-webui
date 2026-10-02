/** Run on fixtures/model-selection.html; exercises real picker clicks and composer sends. */
(async () => {
  const test = window.modelSelectionTest;
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(message);
  };
  const picker = () =>
    document.querySelector('button[aria-label="Model & reasoning effort"]');
  const button = (text) =>
    [...document.querySelectorAll('button')].find(
      (node) =>
        node.textContent.replace(/\s+/g, '') === text.replace(/\s+/g, ''),
    );
  const open = async () => {
    if (picker().getAttribute('aria-expanded') !== 'true') picker().click();
    await waitFor(() => button('Model A default'), 'Model menu did not open');
  };
  const close = async () => {
    if (picker().getAttribute('aria-expanded') === 'true') picker().click();
    await waitFor(
      () => picker().getAttribute('aria-expanded') === 'false',
      'Model menu did not close',
    );
  };
  const selectModel = async (text) => {
    await open();
    button(text).click();
    await waitFor(
      () => button(text)?.getAttribute('aria-pressed') === 'true',
      'Model selection did not update',
    );
  };
  const selectEffort = async (text) => {
    button(text).click();
    await waitFor(
      () => button(text)?.getAttribute('aria-pressed') === 'true',
      'Effort selection did not update',
    );
  };
  const fill = async (text) => {
    const input = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    ).set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    return input;
  };
  const send = async (text, model, effort) => {
    await close();
    await fill(text);
    const count = test.state.requests.length;
    const sendButton = document.querySelector('button[aria-label="Send"]');
    check(sendButton && !sendButton.disabled, 'Composer is not sendable');
    sendButton.click();
    await waitFor(
      () => test.state.requests.length === count + 1,
      'Send request missing',
    );
    const request = test.state.requests.at(-1);
    check(
      request.body.model === model && request.body.effort === effort,
      'Sent options differ from the picker',
    );
    check(
      test.state.effectiveModel === model &&
        test.state.effectiveEffort === effort,
      'Server inherited old options',
    );
    test.finish();
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  await waitFor(
    () => picker()?.textContent.includes('Model A'),
    'Config/model queries did not load',
  );
  await selectModel('Model B');
  check(
    button('low default')?.getAttribute('aria-pressed') === 'true',
    'Model B inherited the config model effort',
  );
  await selectEffort('medium');
  await send('Use B', 'model-b', 'medium');
  await selectModel('Model A default');
  await send('Switch back to default A', 'model-a', 'high');
  await open();
  await selectEffort('low');
  await send('Lower effort', 'model-a', 'low');
  await open();
  await selectEffort('high default');
  await send('Restore default effort', 'model-a', 'high');

  await selectModel('Model B');
  await selectEffort('medium');
  test.refreshCatalog();
  await waitFor(
    () => picker().textContent.includes('model-b'),
    'Refresh unexpectedly cleared the selected model',
  );
  test.restoreCatalog();
  await waitFor(
    () => button('Model B')?.getAttribute('aria-pressed') === 'true',
    'Selection did not survive catalog refresh',
  );

  test.activate();
  await selectModel('Model A default');
  check(
    document.body.textContent.includes('Model changes apply to the next turn'),
    'Missing mid-turn explanation',
  );
  await close();
  const count = test.state.requests.length;
  const input = await fill('Queue the selected default model');
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await waitFor(
    () => document.body.textContent.includes('Queued messages (1)'),
    'Message not queued',
  );
  check(
    test.state.requests.length === count,
    'Model selection interrupted/modified the active turn',
  );
  test.finish();
  await waitFor(
    () => test.state.requests.length === count + 1,
    'Queue did not dispatch',
  );
  check(
    test.state.requests.at(-1).body.model === 'model-a',
    'Queued model was omitted',
  );
  check(
    test.state.requests.at(-1).body.effort === 'high',
    'Queued default effort was omitted',
  );

  test.activate();
  await selectModel('Model B');
  await close();
  await fill('Append while keeping the current model');
  document.querySelector('button[title="Follow up"]').click();
  await waitFor(
    () =>
      button(
        'Steer current turnChanges the active response using its current model',
      ),
    'Follow-up menu missing',
  );
  button(
    'Steer current turnChanges the active response using its current model',
  ).click();
  await waitFor(
    () => test.state.requests.at(-1)?.path.endsWith('/steer'),
    'Steer request missing',
  );
  check(
    !('model' in test.state.requests.at(-1).body),
    'Native steer attempted a model change',
  );
  check(
    test.state.effectiveModel === 'model-a',
    'Steer changed the active model',
  );
  test.finish();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await send('Use newly selected B for the next turn', 'model-b', 'low');
  return {
    passed: true,
    width: innerWidth,
    requests: test.state.requests.length,
    cases: [
      'switch back to default',
      'reset effort',
      'catalog refresh',
      'queued model',
      'native steer',
      'next-turn selection',
    ],
  };
})();
