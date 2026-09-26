import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Construct, State } from 'micromark-util-types';
import type { Plugin } from 'unified';
import type {} from 'remark-parse';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    latexMath: 'latexMath';
    latexMathData: 'latexMathData';
  }
}

/** Parse LaTeX delimiters in Markdown text, leaving code and link URLs intact. */
export const remarkLatexMath: Plugin = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ text: { 92: latexMath } });
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
};

const latexMath: Construct = {
  name: 'latexMath',
  tokenize(effects, ok, nok) {
    let closing: number;
    const start: State = (code) => {
      effects.enter('latexMath');
      effects.enter('latexMathData');
      effects.consume(code);
      return opening;
    };
    const opening: State = (code) => {
      if (code !== 40 && code !== 91) return nok(code);
      closing = code === 40 ? 41 : 93;
      effects.consume(code);
      return content;
    };
    const content: State = (code) => {
      if (code === null) return nok(code);
      // Micromark needs a token for every line ending to join multiline chunks.
      if (code < -2) {
        effects.exit('latexMathData');
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return nextLine;
      }
      effects.consume(code);
      return code === 92 ? afterBackslash : content;
    };
    const nextLine: State = (code) => {
      effects.enter('latexMathData');
      return content(code);
    };
    const afterBackslash: State = (code) => {
      if (code === closing) {
        effects.consume(code);
        effects.exit('latexMathData');
        effects.exit('latexMath');
        return ok;
      }
      // Consume escaped backslashes together, including TeX matrix row breaks.
      if (code === 92) {
        effects.consume(code);
        return content;
      }
      return content(code);
    };
    return start;
  },
};

const fromMarkdown: FromMarkdownExtension = {
  enter: {
    latexMath(token) {
      const source = this.sliceSerialize(token);
      const value = source.slice(2, -2);
      this.enter({
        type: 'inlineMath',
        value,
        data: {
          hName: 'code',
          hProperties: { className: ['language-math', source[1] === '[' ? 'math-display' : 'math-inline'] },
          hChildren: [{ type: 'text', value }],
        },
      }, token);
      this.buffer();
    },
  },
  exit: {
    latexMath(token) {
      this.resume();
      this.exit(token);
    },
  },
};
