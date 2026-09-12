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
