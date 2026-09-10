import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowUp, Check, ChevronDown, ExternalLink, MessageCircle, X } from 'lucide-react';
import { buildApiUrl } from '../config';
import './ShipmentChatbot.css';

const QUICK_QUESTIONS = [
  ['Check equipment', 'Check the equipment and dimensions for this shipment.'],
  ['Compare rates', 'Compare the connected carrier rates and DAT market context for this shipment.'],
  ['Check the route', 'Search for current route, weather, or disruption risks.'],
  ['What’s missing?', 'What should staff verify before sending this quote?']
];
const EMPTY_CONVERSATION = { exchanges: [], draft: '', pending: '', loading: false, error: '', failedQuestion: '', historyError: '' };

function place(location) {
  return [location?.city, location?.state || location?.state_code, location?.zip || location?.zip_code].filter(Boolean).join(', ') || 'Not supplied';
}

function money(value) {
  return value == null ? 'Not saved' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date to confirm' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function requestConversation(id, options) {
  const response = await fetch(buildApiUrl('/api/email-quotes/' + encodeURIComponent(id) + '/advisor-conversation'), {
    credentials: 'include', ...options
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Unable to reach the shipment assistant. Please try again.');
  return result;
}

function mergeExchanges(saved, current) {
  return Array.from(new Map([...saved, ...current].map(exchange => [exchange.id, exchange])).values());
}

function ShipmentContext({ quote }) {
  const shipment = quote.shipment || {};
  const pieces = shipment.pieces || {};
  const options = quote.carrierQuotes || [];
  const rates = options.filter(option => option.available && option.selectable !== false && !option.benchmark);
  const benchmarks = options.filter(option => option.available && option.benchmark);
  return (
    <details className="shipment-chat-context" key={quote.id}>
      <summary>Shipment details included <ChevronDown size={14} aria-hidden="true" /></summary>
      <dl>
        <div><dt>Pickup</dt><dd>{place(shipment.pickup?.location)}{shipment.pickup?.date && ' · ' + dateLabel(shipment.pickup.date)}</dd></div>
        <div><dt>Delivery</dt><dd>{place(shipment.delivery?.location)}{shipment.delivery?.date && ' · ' + dateLabel(shipment.delivery.date)}</dd></div>
        <div><dt>Freight</dt><dd>{pieces.quantity || 'Unspecified'} handling units · {shipment.weight?.value != null ? Number(shipment.weight.value).toLocaleString() + ' ' + (shipment.weight.unit || 'lb') : 'Weight not supplied'}</dd></div>
        <div><dt>Dimensions</dt><dd>{pieces.parts?.length ? pieces.parts.map((part, index) => <span key={index}>{part.count || 1} unit(s): {part.length || '?'} × {part.width || '?'} × {part.height || '?'} {pieces.unit || 'in'}</span>) : 'Not supplied'}</dd></div>
        <div><dt>Commodity</dt><dd>{shipment.commodity || 'Not supplied'}</dd></div>
        <div><dt>Stackable</dt><dd>{typeof shipment.stackable === 'boolean' ? (shipment.stackable ? 'Yes' : 'No') : 'Not supplied'}</dd></div>
        <div><dt>Equipment</dt><dd>{shipment.truckType || 'Unassigned'}{shipment.datEquipmentType && ' · DAT ' + shipment.datEquipmentType}</dd></div>
        <div><dt>Carrier rates</dt><dd>{rates.length ? rates.map(option => <span key={option.key}>{option.source} · {money(option.cost)}</span>) : 'No available carrier rates'}</dd></div>
        <div><dt>DAT context</dt><dd>{benchmarks.length ? benchmarks.map(option => <span key={option.key}>{option.source} · {money(option.cost)}</span>) : 'No market benchmarks available'}</dd></div>
        <div><dt>Client price</dt><dd>{money(quote.selection?.clientPrice)}</dd></div>
      </dl>
      <p>The original email, saved service requirements, pricing notes and this shipment’s chat history are included automatically.</p>
    </details>
  );
}

function ShipmentReview({ quote, advisor }) {
  const shipment = quote.shipment || {};
  const recommendation = shipment.aiRecommendation;
  return (
    <div className="shipment-chat-review">
      <section>
        <h3>Equipment review</h3>
        {recommendation ? <>
          <dl>
            <div><dt>Recommended</dt><dd>{recommendation.recommendedTruckType || 'Needs review'}</dd></div>
            <div><dt>Used for rating</dt><dd>{recommendation.appliedTruckType || shipment.truckType || 'Unassigned'}</dd></div>
            <div><dt>Assessment</dt><dd>{recommendation.status === 'completed' ? (recommendation.confidence ? recommendation.confidence + ' confidence' : 'Completed') : 'Capacity safeguards applied'}</dd></div>
          </dl>
          <p>{recommendation.fitAnalysis || recommendation.note}</p>
          {recommendation.note && recommendation.fitAnalysis && <p>{recommendation.note}</p>}
          {!!recommendation.risks?.length && <div className="shipment-chat-flags"><h4>Needs attention</h4><ul>{recommendation.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></div>}
          {!!recommendation.suggestions?.length && <><h4>Before booking</h4><ul>{recommendation.suggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}</ul></>}
        </> : <p>Equipment guidance will appear after this shipment is saved and rated.</p>}
        {shipment.truckAssignment?.reason && <p>{shipment.truckAssignment.reason}</p>}
      </section>
      {quote.recommendation?.reason && <section><h3>Pricing guidance</h3><p>{quote.recommendation.reason}</p></section>}
      <section>
        <h3>Quote checks</h3>
        <ul className="shipment-chat-checks">
          {(advisor.checks || []).map(check => <li key={check.label} className={check.tone === 'warning' ? 'needs-review' : ''}>
            {check.tone === 'good' ? <Check size={15} aria-label="Ready" /> : <AlertCircle size={15} aria-label={check.tone === 'warning' ? 'Review' : 'Note'} />}
            <div><strong>{check.label}</strong><p>{check.detail}</p></div>
          </li>)}
        </ul>
      </section>
      <p className="shipment-chat-disclaimer">Confirm equipment, service and the final price before sending the quote.</p>
    </div>
  );
}

export default function ShipmentChatbot({ quote, advisor = {}, view, onViewChange, previewMode = false, createPreviewExchange, hasUnsavedChanges = false, contextLoading = false }) {
  const [conversations, setConversations] = useState({});
  const [historyRetry, setHistoryRetry] = useState(0);
  const loaded = useRef(new Set());
  const sending = useRef(new Set());
  const launcher = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const scrollArea = useRef(null);
  const wasOpen = useRef(false);
  const mounted = useRef(true);
  const quoteId = quote?.id;
  const open = Boolean(view);
  const conversation = conversations[quoteId] || EMPTY_CONVERSATION;
  const reviewRequired = advisor.reviewRequired || quote?.shipment?.truckAssignment?.status === 'needs_review' || Boolean(quote?.shipment?.aiRecommendation?.risks?.length);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const updateConversation = useCallback((id, update) => {
    if (!mounted.current) return;
    setConversations(current => ({ ...current, [id]: { ...(current[id] || EMPTY_CONVERSATION), ...update(current[id] || EMPTY_CONVERSATION) } }));
  }, []);

  useEffect(() => {
    if (!open || !quoteId || previewMode || loaded.current.has(quoteId)) return undefined;
    const controller = new AbortController();
    updateConversation(quoteId, () => ({ loading: true, historyError: '' }));
    requestConversation(quoteId, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        loaded.current.add(quoteId);
        updateConversation(quoteId, current => ({ loading: false, exchanges: mergeExchanges(result?.exchanges || [], current.exchanges) }));
      })
      .catch(error => {
        if (!controller.signal.aborted) updateConversation(quoteId, () => ({ historyError: error.message }));
      })
      .finally(() => {
        if (!controller.signal.aborted) updateConversation(quoteId, () => ({ loading: false }));
      });
    return () => controller.abort();
  }, [open, quoteId, previewMode, historyRetry, updateConversation]);

  useEffect(() => {
    if (open && view === 'conversation' && !contextLoading) input.current?.focus({ preventScroll: true });
    if (open && view === 'review') panel.current?.focus({ preventScroll: true });
    if (!open && wasOpen.current) launcher.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, view, contextLoading]);

  useEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = view === 'review' || (!conversation.exchanges.length && !conversation.pending) ? 0 : scrollArea.current.scrollHeight;
  }, [open, view, quoteId, conversation.exchanges.length, conversation.pending]);

  async function ask(question) {
    question = question.trim();
    if (!quoteId || contextLoading || !question || question.length > 2000 || sending.current.has(quoteId) || conversation.loading || conversation.historyError) return;
    const id = quoteId;
    sending.current.add(id);
    updateConversation(id, () => ({ pending: question, draft: '', error: '', failedQuestion: '' }));
    try {
      const exchange = previewMode
        ? await createPreviewExchange(quote, question)
        : (await requestConversation(id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })).exchange;
      if (!exchange?.id || !exchange?.answer) throw new Error('No answer was returned. Please try again.');
      updateConversation(id, current => ({ exchanges: mergeExchanges(current.exchanges, [exchange]) }));
    } catch (error) {
      updateConversation(id, current => ({ error: error.message, failedQuestion: question, draft: current.draft || question }));
    } finally {
      sending.current.delete(id);
      updateConversation(id, () => ({ pending: '' }));
    }
  }

  const disabled = !quoteId || contextLoading || conversation.loading || Boolean(conversation.pending || conversation.historyError);
  const shipment = quote?.shipment || {};
  const pickup = shipment.pickup?.location;
  const delivery = shipment.delivery?.location;

  return createPortal(
    <div className="shipment-chat">
      {open && <section ref={panel} id="shipment-chat-panel" tabIndex={-1} className="shipment-chat-panel" role="dialog" aria-modal="false" aria-labelledby="shipment-chat-title" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onViewChange(null); }
      }}>
        <header className="shipment-chat-header">
          <img src="/brand/logo.png" alt="First Class Trucking" width="44" height="30" />
          <div><h2 id="shipment-chat-title">Shipment assistant</h2><p>First Class · AI assistant</p></div>
          <button type="button" className="shipment-chat-icon-button" onClick={() => onViewChange(null)} aria-label="Close shipment assistant"><X size={19} /></button>
        </header>
        <div className="shipment-chat-lane" aria-live="polite">
          <small>{contextLoading ? 'Loading shipment…' : 'Selected shipment'}</small>
          <strong>{contextLoading ? 'Updating context…' : quote ? `${pickup?.city || pickup?.zip || 'Pickup'}${pickup?.state ? ', ' + pickup.state : ''} → ${delivery?.city || delivery?.zip || 'Delivery'}${delivery?.state ? ', ' + delivery.state : ''}` : 'Select a quote to get started'}</strong>
          {quote && !contextLoading && <span>{[shipment.pieces?.quantity && `${shipment.pieces.quantity} handling unit${Number(shipment.pieces.quantity) === 1 ? '' : 's'}`, shipment.weight?.value && `${Number(shipment.weight.value).toLocaleString()} ${shipment.weight.unit || 'lb'}`, shipment.truckType].filter(Boolean).join(' · ') || 'Shipment details needed'}</span>}
        </div>
        <div className="shipment-chat-tabs" role="group" aria-label="Assistant view">
          <button type="button" aria-pressed={view === 'conversation'} onClick={() => onViewChange('conversation')}>Conversation</button>
          <button type="button" aria-pressed={view === 'review'} onClick={() => onViewChange('review')}>Shipment review{reviewRequired && <span className="shipment-chat-review-dot" aria-label="Needs attention" />}</button>
        </div>
        <div className="shipment-chat-scroll" ref={scrollArea}>
          {!quote ? <p className="shipment-chat-intro">Choose an email from the inbox. Its shipment details and conversation will load here.</p> : contextLoading ? <p role="status">Loading the selected shipment…</p> : <>
            {view === 'review' && hasUnsavedChanges && <p className="shipment-chat-unsaved">This review uses saved shipment details. Save your changes to refresh the guidance.</p>}
            <ShipmentContext quote={quote} />
            {view === 'review' ? <ShipmentReview quote={quote} advisor={advisor} /> : <>
              {!conversation.exchanges.length && !conversation.pending && <div className="shipment-chat-intro">
                <h3>How can I help with this load?</h3>
                <p>I have the saved shipment details, original email, carrier rates and DAT results. Ask a question or review the shipment checks.</p>
                <div className="shipment-chat-prompts">{QUICK_QUESTIONS.map(([label, question]) => <button type="button" key={label} disabled={disabled} onClick={() => ask(question)}>{label}</button>)}</div>
              </div>}
              {conversation.historyError && <div className="shipment-chat-error" role="alert"><p>Couldn’t load this shipment’s conversation. {conversation.historyError}</p><button type="button" onClick={() => setHistoryRetry(value => value + 1)}>Retry loading history</button></div>}
              <div role="log" aria-label="Shipment conversation" aria-live="polite" aria-relevant="additions text" aria-busy={conversation.loading}>
                {conversation.loading && <p className="shipment-chat-status" role="status">Loading conversation…</p>}
                {conversation.exchanges.map(exchange => <div className="shipment-chat-exchange" key={exchange.id}>
                  <div className="shipment-chat-message user"><small>{exchange.createdBy || 'Staff'}</small><p>{exchange.question}</p></div>
                  <div className="shipment-chat-message assistant"><small>Shipment assistant</small><p>{exchange.answer}</p>
                    {!!exchange.sources?.length && <div className="shipment-chat-sources"><strong>Sources</strong>{exchange.sources.filter(source => /^https?:\/\//i.test(source.url)).map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<ExternalLink size={12} /></a>)}</div>}
                    <span className="shipment-chat-citation-note">{exchange.usedWebSearch ? 'Includes web research' : 'Saved quote data'}{exchange.createdAt && ' · ' + new Date(exchange.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                </div>)}
                {conversation.pending && <div className="shipment-chat-exchange"><div className="shipment-chat-message user"><small>You</small><p>{conversation.pending}</p></div><p className="shipment-chat-status" role="status">Reviewing this shipment…</p></div>}
              </div>
              {conversation.error && <div className="shipment-chat-error" role="alert"><p><strong>{conversation.failedQuestion}</strong></p>{conversation.error}</div>}
            </>}
          </>}
        </div>
        {view === 'conversation' && <form className="shipment-chat-composer" onSubmit={event => { event.preventDefault(); ask(conversation.draft); }}>
          {hasUnsavedChanges && <p className="shipment-chat-unsaved">Using saved details. Save your changes to include them in the assistant’s answers.</p>}
          <div>
            <textarea ref={input} aria-label="Ask about this shipment" placeholder="Ask about this shipment…" value={conversation.draft} maxLength={2000} rows={2} disabled={!quoteId || contextLoading} onChange={event => { const draft = event.target.value; updateConversation(quoteId, () => ({ draft })); }} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(conversation.draft); }
            }} />
            <button type="submit" disabled={disabled || !conversation.draft.trim()} aria-label="Send message"><ArrowUp size={19} /></button>
          </div>
          <small>{previewMode ? 'Demo preview · Live answers available when signed in' : 'Uses saved quote data · Shift + Enter for a new line'}</small>
        </form>}
      </section>}
      <button ref={launcher} type="button" className={'shipment-chat-launcher' + (open ? ' is-open' : '')} onClick={() => onViewChange(open ? null : 'conversation')} aria-expanded={open} aria-controls={open ? 'shipment-chat-panel' : undefined} aria-label={open ? 'Minimize shipment assistant' : 'Open shipment assistant'}>
        {open ? <X size={19} /> : <MessageCircle size={19} />}<span>Shipment assistant</span>{!open && reviewRequired && <span className="shipment-chat-review-dot" aria-label="Needs attention" />}
      </button>
    </div>, document.body
  );
}
