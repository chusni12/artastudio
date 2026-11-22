import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is not permitted
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2.5 rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950/90 shadow-md">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800/80 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            {language || 'code'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition-colors cursor-pointer"
          title="Salin kode"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Tersalin!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Salin</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <pre className="p-3.5 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isStreaming = false,
  className = '',
}) => {
  // Parse markdown into sections (code blocks vs regular paragraphs)
  const renderFormattedText = (text: string) => {
    // Regex for bold, italic, inline code, and links
    const parts: React.ReactNode[] = [];
    let currentIdx = 0;

    // Pattern matching: inline code (`...`), bold (**...**), italic (*...*), links ([...](...))
    const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let match: RegExpExecArray | null;

    let textToScan = text;
    let lastIndex = 0;

    while ((match = inlineRegex.exec(textToScan)) !== null) {
      if (match.index > lastIndex) {
        parts.push(textToScan.substring(lastIndex, match.index));
      }

      const matchedStr = match[0];
      if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
        // Inline code
        const codeText = matchedStr.slice(1, -1);
        parts.push(
          <code
            key={`code-${currentIdx++}`}
            className="px-1.5 py-0.5 mx-0.5 text-[11px] font-mono bg-slate-800/90 text-amber-300 rounded border border-slate-700/60"
          >
            {codeText}
          </code>
        );
      } else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
        // Bold text
        const boldText = matchedStr.slice(2, -2);
        parts.push(
          <strong key={`bold-${currentIdx++}`} className="font-semibold text-white">
            {boldText}
          </strong>
        );
      } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
        // Italic text
        const italicText = matchedStr.slice(1, -1);
        parts.push(
          <em key={`italic-${currentIdx++}`} className="italic text-slate-200">
            {italicText}
          </em>
        );
      } else if (matchedStr.startsWith('[') && matchedStr.includes('](') && matchedStr.endsWith(')')) {
        // Link
        const linkTextMatch = matchedStr.match(/\[(.*?)\]\((.*?)\)/);
        if (linkTextMatch) {
          const [, linkText, linkUrl] = linkTextMatch;
          parts.push(
            <a
              key={`link-${currentIdx++}`}
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
            >
              {linkText}
            </a>
          );
        } else {
          parts.push(matchedStr);
        }
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < textToScan.length) {
      parts.push(textToScan.substring(lastIndex));
    }

    return parts;
  };

  const renderBlocks = () => {
    if (!content) {
      return null;
    }

    // Split by code blocks
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const blocks: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let blockKey = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const precedingText = content.substring(lastIndex, match.index);
      if (precedingText) {
        blocks.push(renderTextParagraphs(precedingText, `p-${blockKey++}`));
      }

      const language = match[1] || 'text';
      const code = match[2].trimEnd();
      blocks.push(<CodeBlock key={`code-block-${blockKey++}`} language={language} code={code} />);

      lastIndex = codeBlockRegex.lastIndex;
    }

    // Trailing text or streaming unclosed code block
    if (lastIndex < content.length) {
      const remainingText = content.substring(lastIndex);
      // Check if there is an unclosed code block during streaming
      const unclosedMatch = remainingText.match(/^([\s\S]*?)```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
      if (unclosedMatch) {
        const [, preText, lang, unclosedCode] = unclosedMatch;
        if (preText) {
          blocks.push(renderTextParagraphs(preText, `p-${blockKey++}`));
        }
        blocks.push(
          <CodeBlock
            key={`code-block-unclosed-${blockKey++}`}
            language={lang || 'streaming'}
            code={unclosedCode}
          />
        );
      } else {
        blocks.push(renderTextParagraphs(remainingText, `p-${blockKey++}`));
      }
    }

    return blocks;
  };

  const renderTextParagraphs = (rawText: string, keyPrefix: string) => {
    const lines = rawText.split('\n');
    const elements: React.ReactNode[] = [];
    let lineIdx = 0;

    while (lineIdx < lines.length) {
      const line = lines[lineIdx];

      // Empty line
      if (!line.trim()) {
        lineIdx++;
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h3
            key={`${keyPrefix}-h3-${lineIdx}`}
            className="text-sm font-semibold text-amber-300 mt-2.5 mb-1 flex items-center gap-1.5"
          >
            {renderFormattedText(line.slice(4))}
          </h3>
        );
        lineIdx++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2
            key={`${keyPrefix}-h2-${lineIdx}`}
            className="text-base font-bold text-white mt-3 mb-1.5"
          >
            {renderFormattedText(line.slice(3))}
          </h2>
        );
        lineIdx++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h1
            key={`${keyPrefix}-h1-${lineIdx}`}
            className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-500 mt-3 mb-2"
          >
            {renderFormattedText(line.slice(2))}
          </h1>
        );
        lineIdx++;
        continue;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        elements.push(
          <blockquote
            key={`${keyPrefix}-quote-${lineIdx}`}
            className="border-l-2 border-amber-500/60 pl-3 my-1.5 italic text-slate-300 text-xs bg-amber-500/5 py-1 rounded-r"
          >
            {renderFormattedText(line.slice(2))}
          </blockquote>
        );
        lineIdx++;
        continue;
      }

      // Lists (- or *)
      if (line.match(/^[\*\-]\s+/)) {
        const listItems: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].match(/^[\*\-]\s+/)) {
          listItems.push(lines[lineIdx].replace(/^[\*\-]\s+/, ''));
          lineIdx++;
        }
        elements.push(
          <ul key={`${keyPrefix}-ul-${lineIdx}`} className="my-1.5 space-y-1 pl-4 text-xs">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="text-amber-400 mt-1 select-none text-[10px]">•</span>
                <span className="flex-1">{renderFormattedText(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered lists (1. 2.)
      if (line.match(/^\d+\.\s+/)) {
        const listItems: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].match(/^\d+\.\s+/)) {
          listItems.push(lines[lineIdx].replace(/^\d+\.\s+/, ''));
          lineIdx++;
        }
        elements.push(
          <ol key={`${keyPrefix}-ol-${lineIdx}`} className="my-1.5 space-y-1 pl-4 text-xs">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="text-amber-400/90 font-mono text-[11px] font-semibold select-none">
                  {idx + 1}.
                </span>
                <span className="flex-1">{renderFormattedText(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Regular paragraph
      elements.push(
        <p
          key={`${keyPrefix}-p-${lineIdx}`}
          className="text-xs text-slate-200 leading-relaxed my-1"
        >
          {renderFormattedText(line)}
        </p>
      );
      lineIdx++;
    }

    return <div key={keyPrefix} className="space-y-0.5">{elements}</div>;
  };

  return (
    <div className={`prose-studio text-xs leading-relaxed ${className}`}>
      {renderBlocks()}
      {isStreaming && (
        <span
          className="inline-block w-2 h-3.5 ml-1 bg-amber-400 animate-pulse rounded-sm align-middle shadow-[0_0_8px_rgba(245,158,11,0.6)]"
          aria-label="Sedang mengetik respons..."
        />
      )}
    </div>
  );
};
