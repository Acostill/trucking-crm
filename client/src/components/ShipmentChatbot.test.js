import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShipmentChatbot from './ShipmentChatbot';

const shipmentA = {
  id: 'miami-quote',
  shipment: {
    pickup: { location: { city: 'Miami', state: 'FL', zip: '33166' }, date: '2026-09-10' },
    delivery: { location: { city: 'Atlanta', state: 'GA' } },
    pieces: { quantity: 1, unit: 'in', parts: [{ count: 1, length: 48, width: 40, height: 48 }] },
    weight: { value: 500, unit: 'lb' }, truckType: 'Cargo Van', commodity: 'Medical equipment',
    aiRecommendation: { status: 'completed', confidence: 'high', recommendedTruckType: 'Cargo Van', appliedTruckType: 'Cargo Van', fitAnalysis: 'Fits within capacity.', risks: ['Confirm non-hazardous freight.'], suggestions: ['Confirm loading hours.'] }
  },
  selection: { clientPrice: 1473.37 },
  carrierQuotes: [{ key: 'forwardAir', source: 'Forward Air', cost: 1248.62, available: true }],
  recommendation: { reason: 'Confirm carrier service before sending.' }
};
const shipmentB = { id: 'dallas-quote', shipment: { pickup: { location: { city: 'Dallas', state: 'TX' } }, delivery: { location: { city: 'Chicago', state: 'IL' } } } };
const advisor = { reviewRequired: true, checks: [{ label: 'Equipment fit', detail: 'Confirm the equipment.', tone: 'warning' }] };

function Harness(props) {
  const [view, setView] = useState(null);
  return <ShipmentChatbot quote={shipmentA} advisor={advisor} previewMode view={view} onViewChange={setView} {...props} />;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function response(exchanges) {
  return { ok: true, json: async () => ({ exchanges }) };
}
function openChat() {
  fireEvent.click(screen.getByRole('button', { name: 'Open shipment assistant' }));
}
function ask(question) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask about this shipment' }), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

test('opens with selected shipment context and keeps review guidance inside the panel', () => {
  render(<Harness />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  openChat();
  expect(screen.getByText('Miami, FL → Atlanta, GA')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.click(screen.getByText('Shipment details included'));
  expect(screen.getByText('1 unit(s): 48 × 40 × 48 in')).toBeVisible();
  expect(screen.getByText('Forward Air · $1,248.62')).toBeVisible();
  expect(screen.getByText('$1,473.37')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Shipment review/ }));
  expect(screen.getByText('Confirm non-hazardous freight.')).toBeVisible();
  expect(screen.getByText('Confirm loading hours.')).toBeVisible();
  expect(screen.getByText('Confirm carrier service before sending.')).toBeVisible();
  expect(screen.getByText('Confirm the equipment.')).toBeVisible();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open shipment assistant' })).toHaveFocus();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('an answer in flight stays with its quote and preserves the other shipment’s draft', async () => {
  const pending = deferred();
  const createPreviewExchange = jest.fn(() => pending.promise);
  const { rerender } = render(<Harness createPreviewExchange={createPreviewExchange} />);
  openChat();
  ask('Check the Miami equipment');
  expect(screen.getByText('Reviewing this shipment…')).toBeVisible();
  expect(createPreviewExchange).toHaveBeenCalledWith(shipmentA, 'Check the Miami equipment');
  rerender(<Harness quote={shipmentB} createPreviewExchange={createPreviewExchange} />);
  expect(screen.getByText('Dallas, TX → Chicago, IL')).toBeVisible();
  expect(screen.queryByText('Check the Miami equipment')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dallas question draft' } });
  await act(async () => { pending.resolve({ id: 'answer-a', question: 'Check the Miami equipment', answer: 'Miami equipment answer.' }); });
  expect(screen.queryByText('Miami equipment answer.')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Dallas question draft');
  rerender(<Harness createPreviewExchange={createPreviewExchange} />);
  expect(screen.getByText('Miami equipment answer.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close shipment assistant' }));
  openChat();
  expect(screen.getByText('Miami equipment answer.')).toBeVisible();
  rerender(<Harness quote={shipmentB} createPreviewExchange={createPreviewExchange} />);
  expect(screen.getByRole('textbox')).toHaveValue('Dallas question draft');
});

test('loads persisted history from the selected quote and ignores a late history response', async () => {
  const oldHistory = deferred();
  global.fetch.mockImplementation(url => url.includes(shipmentA.id)
    ? oldHistory.promise
    : Promise.resolve(response([{ id: 'b-history', question: 'Dallas rate?', answer: 'Dallas saved answer.' }])));
  const { rerender } = render(<Harness previewMode={false} />);
  openChat();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  rerender(<Harness quote={shipmentB} previewMode={false} />);
  expect(await screen.findByText('Dallas saved answer.')).toBeVisible();
  await act(async () => { oldHistory.resolve(response([{ id: 'old-a', question: 'Miami?', answer: 'Late Miami history.' }])); });
  expect(screen.queryByText('Late Miami history.')).not.toBeInTheDocument();
  rerender(<Harness previewMode={false} />);
  expect(await screen.findByText('Late Miami history.')).toBeVisible();
  expect(screen.queryByText('Dallas saved answer.')).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(true);
});

test('retries failed history loading and posts to the selected shipment with linked sources', async () => {
  global.fetch
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'History unavailable' }) })
    .mockResolvedValueOnce(response([]))
    // eslint-disable-next-line no-script-url -- Verify that unsafe source URLs never become links.
    .mockResolvedValueOnce({ ok: true, json: async () => ({ exchange: { id: 'live-a', question: 'Check the route', answer: 'Route answer.', usedWebSearch: true, sources: [{ title: 'Weather source', url: 'https://weather.gov/example' }, { title: 'Unsafe source', url: 'javascript:alert(1)' }] } }) });
  render(<Harness previewMode={false} />);
  openChat();
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading history' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check equipment' })).toBeEnabled());
  ask('Check the route');
  expect(await screen.findByText('Route answer.')).toBeVisible();
  expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('/miami-quote/advisor-conversation'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ question: 'Check the route' }) }));
  expect(screen.getByRole('link', { name: 'Weather source' })).toHaveAttribute('href', 'https://weather.gov/example');
  expect(screen.queryByRole('link', { name: 'Unsafe source' })).not.toBeInTheDocument();
});

test('a failed message keeps the question available without overwriting new typing', async () => {
  const pending = deferred();
  const createPreviewExchange = jest.fn(() => pending.promise);
  render(<Harness createPreviewExchange={createPreviewExchange} />);
  openChat();
  ask('Original question');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My next question' } });
  await act(async () => { pending.resolve(null); });
  expect(screen.getByRole('alert')).toHaveTextContent('No answer was returned');
  expect(screen.getByRole('alert')).toHaveTextContent('Original question');
  expect(screen.getByRole('textbox')).toHaveValue('My next question');
});

test('Shift+Enter keeps a multiline draft; Enter sends once and changing context disables sending', async () => {
  const pending = deferred();
  const createPreviewExchange = jest.fn(() => pending.promise);
  const { rerender } = render(<Harness createPreviewExchange={createPreviewExchange} hasUnsavedChanges />);
  openChat();
  expect(screen.getByText(/Using saved details/)).toBeVisible();
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Equipment question' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(createPreviewExchange).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(createPreviewExchange).toHaveBeenCalledTimes(1);
  rerender(<Harness quote={shipmentB} createPreviewExchange={createPreviewExchange} contextLoading />);
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.queryByText('Dallas, TX → Chicago, IL')).not.toBeInTheDocument();
  await act(async () => { pending.resolve({ id: 'a', question: 'Equipment question', answer: 'Equipment answer.' }); });
  expect(within(screen.getByRole('dialog')).queryByText('Equipment answer.')).not.toBeInTheDocument();
});

test('empty inbox gives a selection prompt and cannot send', () => {
  render(<Harness quote={null} />);
  openChat();
  expect(screen.getByText('Select a quote to get started')).toBeVisible();
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
});
