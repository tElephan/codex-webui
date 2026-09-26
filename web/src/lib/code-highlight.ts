type Shiki = typeof import('shiki');
type Highlighter = Awaited<ReturnType<Shiki['createHighlighter']>>;

let highlighterPromise: Promise<{ highlighter: Highlighter; languages: Shiki['bundledLanguages'] }> | undefined;
const languageLoads = new Map<string, Promise<void>>();

function getHighlighter() {
  highlighterPromise ??= import('shiki').then(async ({ createHighlighter, bundledLanguages }) => ({
    highlighter: await createHighlighter({ themes: ['github-dark', 'github-light'], langs: [] }),
    languages: bundledLanguages,
  })).catch((error) => {
    highlighterPromise = undefined;
    throw error;
  });
  return highlighterPromise;
}

/** Load only the requested grammar, including Shiki aliases such as tex and c++. */
export async function highlightCode(source: string, language: string, dark: boolean): Promise<string | null> {
  const lang = language.trim().toLowerCase();
  if (!lang) return null;
  const { highlighter, languages } = await getHighlighter();
  if (!Object.hasOwn(languages, lang)) return null;
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    let loading = languageLoads.get(lang);
    if (!loading) {
      loading = highlighter.loadLanguage(lang as keyof typeof languages).finally(() => {
        languageLoads.delete(lang);
      });
      languageLoads.set(lang, loading);
    }
    await loading;
  }
  return highlighter.codeToHtml(source, {
    lang,
    themes: { dark: 'github-dark', light: 'github-light' },
    defaultColor: dark ? 'dark' : 'light',
  });
}
