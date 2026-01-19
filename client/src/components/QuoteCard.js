import React from 'react';

function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  } catch (_e) {
    return `$${Number(value).toFixed(2)}`;
  }
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export default function QuoteCard(props) {
  var quote = props.quote || {};
  var onSelectQuote = typeof props.onSelectQuote === 'function' ? props.onSelectQuote : null;
  var rate = quote.rate || {};
  var priceAccessorials = Array.isArray(quote.priceAccessorials) ? quote.priceAccessorials : [];

  var linehaul = rate.priceLineHaul;
  var rpm = rate.rpm;
  var total = quote.priceTotal;
  var truckType = quote.truckType;
  var transitTime = quote.transitTime;
  var rateCalculationID = quote.rateCalculationID;

  var accessorialsTotal = priceAccessorials.reduce(function(sum, a) { return sum + (Number(a.price) || 0); }, 0);

  var source = quote.source || 'Unknown';

  return (
    <div className="quote-card">
      <div className="quote-header">
        <div>
          <div className="title">Your quote</div>
          <div className="subtitle">Based on the shipment details you provided</div>
        </div>
        <div className="quote-total">
          <div className="label">Total</div>
          <div className="value">{formatCurrency(total)}</div>
        </div>
      </div>

      <div className="quote-badges">
        {source && source !== 'Unknown' && <span className="badge" style={{ backgroundColor: '#6366f1', color: 'white' }}>{source}</span>}
        {truckType && <span className="badge">{truckType}</span>}
        {typeof transitTime === 'number' && <span className="badge">{transitTime} day{transitTime === 1 ? '' : 's'}</span>}
        {rateCalculationID && <span className="badge muted">ID: {rateCalculationID}</span>}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Rate breakdown</div>
          <div className="kv">
            <div className="k">Linehaul</div>
            <div className="v">{formatCurrency(linehaul)}</div>
          </div>
          <div className="kv">
            <div className="k">Rate per mile</div>
            <div className="v">{typeof rpm === 'number' ? `$${formatNumber(rpm)} / mi` : '-'}</div>
          </div>
          <div className="divider" />
          <div className="kv total">
            <div className="k">Total</div>
            <div className="v">{formatCurrency(total)}</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Accessorials</div>
          {priceAccessorials.length === 0 ? (
            <div className="muted">No accessorials</div>
          ) : (
            <div className="table">
              <div className="thead">
                <div>Description</div>
                <div>Price</div>
              </div>
              <div className="tbody">
                {priceAccessorials.map(function(a){
                  return (
                    <div className="tr" key={a.code || a.description}>
                      <div>
                        <div className="desc">{a.description || a.code}</div>
                        {a.code && <div className="sub">{a.code}</div>}
                      </div>
                      <div className="amount">{formatCurrency(Number(a.price) || 0)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="tfoot">
                <div>Accessorials total</div>
                <div>{formatCurrency(accessorialsTotal)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      {onSelectQuote && (
        <div className="quote-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={function(){ onSelectQuote(quote); }}
          >
            Select this quote
          </button>
        </div>
      )}
    </div>
  );
}

