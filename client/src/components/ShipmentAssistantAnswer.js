import React from 'react';
import Markdown from 'markdown-to-jsx';

export function safeAssistantUrl(value) {
  try {
    const text = String(value || '');
    if (Array.from(text).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
    if (/["<>\\]/.test(text)) return null;
    const url = new URL(text);
    if (/["<>\\]/.test(url.href)) return null;
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function SourceLink({ href, children }) {
  const url = safeAssistantUrl(href);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function ComparisonTable({ children }) {
  return <div className="shipment-chat-table" role="region" aria-label="Comparison table" tabIndex={0}><table>{children}</table></div>;
}

const MARKDOWN_OPTIONS = {
  forceBlock: true,
  forceWrapper: true,
  wrapper: 'div',
  disableParsingRawHTML: true,
  evalUnserializableExpressions: false,
  overrides: {
    a: SourceLink,
    img: () => null,
    table: ComparisonTable,
    h1: { component: 'h3' },
    h2: { component: 'h3' }
  }
};

export default function ShipmentAssistantAnswer({ answer }) {
  // Older saved answers retained provider markers without their offsets.
  // Their source list is still available below the answer.
  const text = String(answer || '').replace(/\uE200cite\uE202[^\uE201]*\uE201/g, '');
  return <Markdown className="shipment-chat-answer" options={MARKDOWN_OPTIONS}>{text}</Markdown>;
}
