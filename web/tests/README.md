Run the user-input regressions from the repository root:

```sh
node --test web/tests/user-input.test.mjs
```

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
