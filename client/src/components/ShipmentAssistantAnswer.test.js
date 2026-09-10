import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShipmentAssistantAnswer from './ShipmentAssistantAnswer';

test('renders emphasis, paragraphs and lists without exposing Markdown punctuation', () => {
  const { container } = render(<ShipmentAssistantAnswer answer={'***hello***\n\n**Recommendation:** use the saved truck.\n\n- Check pickup\n- Review cost\n\n1. Save\n2. Reply\n\n2 * 3 = 6'} />);
  expect(screen.getByRole('emphasis')).toHaveTextContent('hello');
  expect(screen.getByText('hello', { selector: 'strong' })).toBeVisible();
  expect(screen.getByText('Recommendation:').tagName).toBe('STRONG');
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(container.textContent).not.toContain('***');
  expect(container.textContent).toContain('2 * 3 = 6');
});

test('keeps inline source citations clickable and supports tables and literal code', () => {
  render(<ShipmentAssistantAnswer answer={'Check terminal hours. [1](<https://www.forwardair.com/locations>)\n\n| Option | Cost |\n| --- | --- |\n| Saved carrier | $500 |\n\n`**literal**`'} />);
  expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('href', 'https://www.forwardair.com/locations');
  expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(within(screen.getByRole('region', { name: 'Comparison table' })).getByRole('table')).toBeInTheDocument();
  expect(screen.getByText('**literal**').tagName).toBe('CODE');
});

test('never mounts raw HTML, unsafe links, or remote images from an answer', () => {
  const { container } = render(<ShipmentAssistantAnswer answer={'[unsafe](javascript:alert%281%29)\n\n[credentials](https://user:password@example.com/)\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n![tracking](https://example.com/pixel.png)\n\n<iframe src="https://example.com"></iframe>'} />);
  // These executable/resource elements have no reliable accessible role.
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('script, iframe, img')).toBeNull();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('cleans obsolete provider citation markers in saved answers', () => {
  const { container } = render(<ShipmentAssistantAnswer answer={'**Saved advice.** citeturn0search0'} />);
  expect(screen.getByText('Saved advice.')).toBeVisible();
  expect(container.textContent).not.toContain('turn0search0');
});
