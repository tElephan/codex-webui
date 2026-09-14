import { createRoot } from 'react-dom/client';
import { MarkdownRenderer } from '../../src/components/chat/markdown-renderer';
import '../../src/index.css';

const diagram = `
\`\`\`mermaid
flowchart LR
  Request --> Queue
  Queue --> NextTurn[Next turn]
\`\`\`
`;

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-3xl p-4">
    <MarkdownRenderer content={diagram} completed />
  </main>,
);
