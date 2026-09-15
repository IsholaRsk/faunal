import React from 'react';

/**
 * Minimal, dependency-free renderer for the guide bodies stored in the DB.
 * Deliberately element-based (no innerHTML anywhere) so a seeded or future
 * admin-authored body can never inject markup — spec §22 "sanitization".
 *
 * Supported: ### headings, - lists, 1. lists, > quotes, **bold**, `code`,
 * paragraphs, and --- separators.
 */
export function renderMarkdown(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const lines = src.replace(/\r/g, '').split('\n');
  let i = 0;
  let key = 0;

  const inline = (text: string): React.ReactNode[] =>
    text
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .filter((part) => part.length > 0)
      .map((part, n) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={n}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`'))
          return (
            <code key={n} className="mono text-[13px]">
              {part.slice(1, -1)}
            </code>
          );
        return <React.Fragment key={n}>{part}</React.Fragment>;
      });

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} className="my-8 border-[var(--line)]" />);
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      const cls = level === 2 ? 'h2 mt-10' : 'h3 mt-8';
      out.push(
        React.createElement(
          `h${Math.min(level + 1, 5)}`,
          { key: key++, id, className: cls, style: { scrollMarginTop: 96 } },
          text,
        ),
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={key++} className="my-4 space-y-2 pl-1">
          {items.map((it, n) => (
            <li key={n} className="flex gap-2.5 text-[15px] leading-relaxed">
              <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--accent-soft)]" />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={key++} className="my-4 space-y-2.5">
          {items.map((it, n) => (
            <li key={n} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="mono mt-[3px] text-[12px] text-[var(--accent-soft)]">{String(n + 1).padStart(2, '0')}</span>
              <span>{inline(it)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        <blockquote key={key++} className="my-6 border-l-2 border-[var(--ink)] bg-[var(--surface-2)] px-5 py-4 text-[15px] italic leading-relaxed">
          {inline(quoted.join(' '))}
        </blockquote>,
      );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|\s*[-*]\s|\s*\d+[.)]\s|>|---)/.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(
      <p key={key++} className="my-4 text-[15.5px] leading-[1.75] text-[#25251f]">
        {inline(para.join(' '))}
      </p>,
    );
  }

  return out;
}

/** Table of contents extracted from the same headings, for the desktop rail. */
export function headingsOf(src: string): { id: string; text: string; level: number }[] {
  return src
    .split('\n')
    .map((l) => l.match(/^(#{2,3})\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({
      level: m[1].length,
      text: m[2],
      id: m[2]
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-'),
    }));
}
