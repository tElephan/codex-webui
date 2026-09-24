Run the user-input regressions from the repository root:

```sh
node --test web/tests/user-input.test.mjs
```

Theme preference, system changes, and legacy storage migration:
`node --test web/tests/theme-store.test.mjs`.

`http://127.0.0.1:5179/tests/fixtures/ui-controls.html` renders the actual header
and FilesPanel for theme-menu and path-completion checks. Test all three themes
on desktop and via the mobile overflow menu. In Open path, `/workspace/src`
matches three folders; `/workspace/src/` lists its children. Check click,
Arrow keys, Tab, Enter, Escape, paths with spaces, and an unavailable directory.
Switch from `/workspace/slow/` to `/workspace/new/` before the delayed response
arrives to check stale results. `window.uiControlsTest.requests` records all API
calls; selecting a suggestion must not open a file until the form is submitted.

These tests compile the real frontend modules with the installed Vite version. They cover question parsing, history hydration, streamed notifications, answer routing, failures, duplicate submissions, and read-only threads. No backend or API credentials are needed.

For browser interaction checks:

```sh
pnpm --dir web exec vite --config tests/browser.config.mjs
```

Open `http://127.0.0.1:5179/tests/fixtures/user-input.html?active=1` for an active async question, omit `active` for an idle thread, or use `?legacy=1` for a blocking request. The fixture renders the real TurnBlock and intercepts API calls locally. `window.userInputTest.requests` contains submitted payloads; set `window.userInputTest.fail = true` to test retry behavior. Use `?item=new-id` for a fresh async question after submitting one.

The takeover fixture is at `http://127.0.0.1:5179/tests/fixtures/thread-takeover.html`. It renders the real conflict banner and confirmation dialog with simulated API responses. Set `window.takeoverTest.changed = true` to simulate an ownership change; inspect `window.takeoverTest.requests` to verify that cancel sends no takeover request. Add `?released=1` to exercise resuming after the other client releases ownership. No process is stopped by this browser fixture.

Backend takeover and writer-inspection regressions: `pnpm test --runInBand thread-writer thread-takeover`.

The code preview fixture is at `http://127.0.0.1:5179/tests/fixtures/code-preview.html`.
It renders the real SessionPanel with local file responses and disabled terminal connections.
Add `?window=1` for FilesPanel, `?file=README.md` for Markdown preview/source, or
`?file=example.zip` for read-only archive code. Add `&dark=1` to start in dark mode.
Use `window.codePreviewTest.setDark(true/false)` to check live theme changes and
`window.codePreviewTest.writes` to inspect saves. Check editor height after resizing
the viewport or panel and verify that switching themes preserves unsaved edits.

Use `?file=example.html` or `?file=example.HTM` for HTML render/source checks.
Verify that the styled page and its button work inside the sandbox, source edits
appear when returning to preview without saving, and switching back preserves
the draft. The preview must not set `document.body.dataset.previewEscaped` on
the outer page; the iframe body should instead have `data-isolated="true"`.

Response recovery regressions: `node --test web/tests/thread-sync.test.mjs`.
They cover missed output/completion, stale reads racing live messages, changing
conversations, optimistic messages, pending requests, retry, and queued follow-ups.

`http://127.0.0.1:5179/tests/fixtures/response-status.html` mounts the actual socket
hook, timeline and persistent activity banner with a local transport. Use
`window.responseTest.disconnect()`, change `state.text` and `state.status` to
`'completed'`, then call `connect()` or `foreground()` to verify recovery without
submitting another turn. Set `state.fail = true` to exercise failed reads and the
refresh button, and `setDark(true)` to inspect the mobile dark theme. All fixture
API calls are recorded in `state.requests`; recovery should only issue GETs.

Streaming scroll regression (run the fixture server above first):

```sh
agent-browser --session chat-scroll open http://127.0.0.1:5179/tests/fixtures/response-status.html
agent-browser --session chat-scroll eval --stdin < web/tests/timeline-scroll.browser.js
agent-browser --session chat-scroll close
```

Repeat after setting a mobile viewport and reloading. This exercises the actual
virtualized timeline: small upward scrolls, reading within a growing turn,
snapshot recovery, new turns, delayed layout, touch/keyboard input, cancellation
of pending scrolling, returning to the bottom, and navigating to request cards.

Attachment picker checks (fixture uploads stay inside the browser):

```sh
agent-browser --session attachments set viewport 390 844
agent-browser --session attachments open http://127.0.0.1:5179/tests/fixtures/attachments.html
agent-browser --session attachments eval --stdin < web/tests/attachments.browser.js
agent-browser --session attachments close
```

Exercises visible photo/file buttons, multi-select, upload progress and send
blocking, image and file payloads, removal, retry, paste, read-only mode, and
leaving a conversation during an upload. Reload before each repeat.
