/** Shared source-file recognition for editable and archive previews. */
const languageExtensions: Record<string, string> = {
  // Text formats without a bundled Monaco grammar still get source previews.
  plaintext: [
    'txt text csv tsv log gitignore gitattributes gitmodules gitkeep lock bib adoc diff patch makefile mk',
    'cmake prisma hs lhs erl hrl ml mli zig nim nix typ f f90 f95 gradle',
  ].join(' '),
  restructuredtext: 'rst',
  markdown: 'md markdown mdx',
  json: 'json jsonc jsonl ipynb',
  yaml: 'yaml yml',
  ini: 'ini cfg conf properties env toml editorconfig npmrc yarnrc',
  typescript: 'ts tsx mts cts',
  javascript: 'js jsx mjs cjs',
  css: 'css',
  scss: 'scss sass',
  less: 'less',
  html: 'html htm vue svelte astro',
  xml: 'xml svg xsl xslt xsd plist csproj fsproj vbproj props targets',
  python: 'py pyi pyw',
  rust: 'rs',
  go: 'go',
  java: 'java',
  kotlin: 'kt kts',
  c: 'c h',
  cpp: 'cc hh cpp hpp cxx hxx c++ h++ ino',
  csharp: 'cs csx',
  fsharp: 'fs fsx fsi',
  php: 'php phtml',
  ruby: 'rb rake gemspec',
  swift: 'swift',
  sql: 'sql',
  shell: 'sh bash zsh fish bashrc zshrc profile bash_profile zprofile',
  powershell: 'ps1 psm1 psd1',
  bat: 'bat cmd',
  dockerfile: 'dockerfile containerfile',
  latex: 'tex latex ltx sty cls',
  lua: 'lua',
  r: 'r rmd',
  julia: 'jl',
  dart: 'dart',
  scala: 'scala sc sbt',
  perl: 'pl pm',
  clojure: 'clj cljs cljc edn',
  elixir: 'ex exs',
  scheme: 'scm ss',
  graphql: 'graphql gql',
  proto: 'proto',
  hcl: 'hcl tf tfvars',
  sol: 'sol',
  systemverilog: 'v vh sv svh',
  tcl: 'tcl',
  liquid: 'liquid',
  handlebars: 'hbs handlebars',
  pug: 'pug jade',
  coffeescript: 'coffee',
  razor: 'cshtml razor',
  vb: 'vb vbs',
  bicep: 'bicep',
};

const extensionLanguages = new Map(
  Object.entries(languageExtensions).flatMap(([language, extensions]) =>
    extensions.split(' ').map((extension) => [extension, language] as const),
  ),
);

/** Undefined means the suffix is not a known text/source format. */
export function getCodeLanguage(filePath: string): string | undefined {
  const name = (filePath.split(/[\\/]/).pop() ?? '').toLowerCase();
  if (/^(?:dockerfile|containerfile)(?:\.|$)/.test(name)) return 'dockerfile';
  if (/^\.env(?:\.|$)/.test(name)) return 'ini';
  if (name === 'cmakelists.txt' || /^(?:makefile|gnumakefile)(?:\.|$)/.test(name)) return 'plaintext';
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return extensionLanguages.get(extension);
}
