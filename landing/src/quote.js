import gsap from "gsap";
import { apiFetch } from "./config.js";

/* ============================================================
   Instant quote engine, wired to the trucking-crm backend.

   - The client-side model renders the instant estimate (same UX).
   - POST /calculate-rate is raced against a timeout; when the
     carrier network answers, its rate replaces the estimate and
     the breakdown is scaled to match.
   - Every calculated quote is persisted via POST /api/quotes so
     it appears in the Lanely CRM pipeline as `pending`.
   - "Book This Rate" hits POST /api/quotes/:id/approve, which
     auto-creates a load record in the CRM.
   All server calls degrade silently to the local model when the
   backend is offline — the UI never blocks on infrastructure.
   ============================================================ */

export const HUBS = [
  { id: "ATL", name: "Atlanta, GA", city: "Atlanta", state: "GA", zip: "30303", lat: 33.749, lon: -84.388 },
  { id: "CHI", name: "Chicago, IL", city: "Chicago", state: "IL", zip: "60601", lat: 41.878, lon: -87.629 },
  { id: "DAL", name: "Dallas, TX", city: "Dallas", state: "TX", zip: "75201", lat: 32.776, lon: -96.797 },
  { id: "DEN", name: "Denver, CO", city: "Denver", state: "CO", zip: "80202", lat: 39.739, lon: -104.99 },
  { id: "LAX", name: "Los Angeles, CA", city: "Los Angeles", state: "CA", zip: "90013", lat: 34.052, lon: -118.243 },
  { id: "MIA", name: "Miami, FL", city: "Miami", state: "FL", zip: "33131", lat: 25.761, lon: -80.191 },
  { id: "NYC", name: "New York, NY", city: "New York", state: "NY", zip: "10001", lat: 40.712, lon: -74.006 },
  { id: "PHX", name: "Phoenix, AZ", city: "Phoenix", state: "AZ", zip: "85004", lat: 33.448, lon: -112.074 },
  { id: "SEA", name: "Seattle, WA", city: "Seattle", state: "WA", zip: "98101", lat: 47.606, lon: -122.332 },
  { id: "STL", name: "St. Louis, MO", city: "St. Louis", state: "MO", zip: "63101", lat: 38.627, lon: -90.199 },
];

/* standard pallet defaults — the landing form intentionally keeps
   dimensions out of the UI, so shipments go out as one 48x40 pallet */
const DEFAULT_PIECES = {
  unit: "in",
  quantity: 1,
  parts: [{ length: 48, width: 40, height: 48 }],
};

const RATE = {
  base: 95,                 // flat pickup/handling
  perMile: 1.72,            // line-haul $/mi
  fuelPct: 0.14,            // fuel surcharge on line-haul
  weightTiers: [            // [maxLbs, multiplier]
    [500, 0.85], [2000, 1.0], [5000, 1.28],
    [10000, 1.65], [20000, 2.1], [45000, 2.75],
  ],
  freightClass: {
    standard: { label: "Standard (Class 70)", mult: 1.0 },
    fragile: { label: "Fragile / High-Care", mult: 1.35 },
    hazmat: { label: "Hazmat Certified", mult: 1.55 },
    reefer: { label: "Temp-Controlled", mult: 1.45 },
  },
  service: {
    economy: { label: "Economy", mult: 0.82, eta: "5–7 BUSINESS DAYS" },
    standard: { label: "Standard", mult: 1.0, eta: "3–4 BUSINESS DAYS" },
    firstclass: { label: "First Class", mult: 1.9, eta: "NEXT BUSINESS DAY" },
  },
};

function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function weightMult(lbs) {
  for (const [max, mult] of RATE.weightTiers) if (lbs <= max) return mult;
  return RATE.weightTiers.at(-1)[1];
}

export function computeQuote({ originId, destId, weight, freightClass, service }) {
  const origin = HUBS.find((h) => h.id === originId);
  const dest = HUBS.find((h) => h.id === destId);
  const miles = Math.round(haversineMiles(origin, dest) * 1.18); // road factor

  const lineHaul = RATE.base + miles * RATE.perMile;
  const fuel = miles * RATE.perMile * RATE.fuelPct;
  const wMult = weightMult(weight);
  const cls = RATE.freightClass[freightClass];
  const svc = RATE.service[service];

  const subtotal = (lineHaul + fuel) * wMult * cls.mult;
  const total = subtotal * svc.mult;

  return {
    id: "FC-" + String(Math.floor(100000 + Math.random() * 900000)),
    miles,
    total: Math.round(total * 100) / 100,
    eta: svc.eta,
    breakdown: [
      ["LINE HAUL // " + miles + " MI", lineHaul],
      ["FUEL SURCHARGE", fuel],
      ["WEIGHT ADJ. ×" + wMult.toFixed(2), (lineHaul + fuel) * (wMult - 1)],
      [cls.label.toUpperCase() + " ×" + cls.mult.toFixed(2), (lineHaul + fuel) * wMult * (cls.mult - 1)],
      [svc.label.toUpperCase() + " SERVICE ×" + svc.mult.toFixed(2), subtotal * (svc.mult - 1)],
    ],
  };
}

const fmt = (n) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------- backend integration ---------------- */

function shipmentPayload({ originId, destId, weight, freightClass }) {
  const origin = HUBS.find((h) => h.id === originId);
  const dest = HUBS.find((h) => h.id === destId);
  const pickupDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  return {
    pickup: {
      location: { city: origin.city, state: origin.state, zip: origin.zip, country: "US" },
      date: pickupDate,
    },
    delivery: {
      location: { city: dest.city, state: dest.state, zip: dest.zip, country: "US" },
    },
    pieces: DEFAULT_PIECES,
    weight: { unit: "lbs", value: weight },
    hazardousMaterial: { unNumbers: freightClass === "hazmat" ? ["UN3077"] : [] },
    accessorialCodes: [],
    referenceNumber: "FC-WEB-" + Date.now(),
  };
}

/* pull any plausible dollar totals out of a /calculate-rate response,
   whatever mix of carriers answered */
function extractTotals(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => extractTotals(n, out)); return out; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "number" && /^(total|totalPrice|price|rate|amount)$/i.test(k) && v > 50 && v < 100000) {
        out.push(v);
      } else {
        extractTotals(v, out);
      }
    }
  }
  return out;
}

/* ask the carrier network for a real rate; null when unavailable */
async function fetchNetworkRate(params) {
  try {
    const res = await apiFetch("/calculate-rate", {
      method: "POST",
      body: JSON.stringify(shipmentPayload(params)),
    });
    const totals = extractTotals(res);
    return totals.length ? Math.min(...totals) : null;
  } catch {
    return null;
  }
}

/* persist the quote into the Lanely CRM pipeline; null when offline */
async function saveQuoteToCrm(q, params) {
  try {
    const saved = await apiFetch("/api/quotes", {
      method: "POST",
      body: JSON.stringify({
        status: "pending",
        contact: { name: "Website visitor", email: null, phone: null },
        quote: {
          total: q.total,
          linehaul: q.breakdown[0]?.[1] ?? null,
          ratePerMile: q.miles ? Math.round((q.total / q.miles) * 100) / 100 : null,
          truckType: "Dry Van",
          // quotes.quote_transit_time is INTEGER (days)
          transitTime: { economy: 7, standard: 4, firstclass: 1 }[params.service] ?? null,
        },
        shipment: shipmentPayload(params),
      }),
    });
    return saved && saved.id ? saved : null;
  } catch {
    return null;
  }
}

/* approving a quote auto-creates a load record in the CRM */
async function approveQuoteInCrm(id) {
  try {
    await apiFetch(`/api/quotes/${encodeURIComponent(id)}/approve`, { method: "POST" }, 4000);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- form wiring ---------------- */
export function initQuoteForm() {
  const form = document.getElementById("quote-form");
  const originSel = document.getElementById("origin");
  const destSel = document.getElementById("destination");
  const picker = document.getElementById("service-picker");
  const idle = document.getElementById("result-idle");
  const live = document.getElementById("result-live");

  for (const hub of HUBS) {
    originSel.add(new Option(hub.name, hub.id));
    destSel.add(new Option(hub.name, hub.id));
  }
  originSel.value = "LAX";
  destSel.value = "NYC";

  let service = "standard";
  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".service");
    if (!btn) return;
    picker.querySelectorAll(".service").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    service = btn.dataset.service;
  });

  let crmQuote = null; // CRM record backing the currently displayed rate
  let submitSeq = 0;   // ignore stale async results from older submissions

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const weight = Math.max(1, Number(document.getElementById("weight").value) || 1);

    if (originSel.value === destSel.value) {
      gsap.fromTo(form, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.35)" });
      return;
    }

    const params = {
      originId: originSel.value,
      destId: destSel.value,
      weight,
      freightClass: document.getElementById("freight-class").value,
      service,
    };

    // instant: render the local estimate immediately, no network wait
    const q = computeQuote(params);
    renderResult(q, { idle, live });

    // on stacked layouts the result sits below the form — bring it into view
    const resultPanel = document.getElementById("quote-result");
    if (window.matchMedia("(max-width: 900px)").matches) {
      if (window.lenis) window.lenis.scrollTo(resultPanel, { offset: -156, duration: 1.1 });
      else resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // background: carrier-network rate ticks the total in place when it
    // lands, then the final quote is persisted to the CRM pipeline
    const token = ++submitSeq;
    crmQuote = null;
    fetchNetworkRate(params).then((networkTotal) => {
      if (token !== submitSeq) return;
      if (networkTotal) {
        const scale = networkTotal / q.total;
        q.total = Math.round(networkTotal * 100) / 100;
        q.breakdown = q.breakdown.map(([label, v]) => [label, v * scale]);
        retickTotals(q);
      }
      saveQuoteToCrm(q, params).then((saved) => {
        if (!saved || token !== submitSeq) return;
        crmQuote = saved;
        const idEl = document.getElementById("result-id");
        if (idEl) idEl.textContent = saved.id;
      });
    });
  });

  document.getElementById("result-book").addEventListener("click", async () => {
    const btn = document.getElementById("result-book");
    btn.disabled = true;
    const booked = crmQuote ? await approveQuoteInCrm(crmQuote.id) : false;
    btn.innerHTML = booked
      ? "⚡ RATE BOOKED — LOAD CREATED, DISPATCH WILL CONFIRM"
      : "⚡ RATE RESERVED — DISPATCH WILL CONFIRM";
    gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" });
  });
}

function breakdownHtml(q) {
  return (
    q.breakdown
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([label, v]) => `<div class="row"><span>${label}</span><b>$${fmt(v)}</b></div>`)
      .join("") +
    `<div class="row row--total"><span>GUARANTEED TOTAL</span><b>$${fmt(q.total)}</b></div>`
  );
}

/* the carrier network answered after first paint — glide the displayed
   total to the real rate and refresh the breakdown to match */
function retickTotals(q) {
  const amount = document.getElementById("result-amount");
  const from = parseFloat(amount.textContent.replace(/,/g, "")) || 0;
  if (Math.abs(from - q.total) < 0.005) return;

  const counter = { v: from };
  gsap.to(counter, {
    v: q.total,
    duration: 0.7,
    ease: "power2.inOut",
    onUpdate: () => (amount.textContent = fmt(counter.v)),
  });

  const bd = document.getElementById("result-breakdown");
  bd.innerHTML = breakdownHtml(q);
  gsap.fromTo(bd.children, { opacity: 0.35 }, { opacity: 1, duration: 0.5, stagger: 0.05, ease: "power2.out" });
}

function renderResult(q, { idle, live }) {
  idle.hidden = true;
  live.hidden = false;

  document.getElementById("result-id").textContent = q.id;
  document.getElementById("result-eta").textContent = "ETA // " + q.eta;

  const bd = document.getElementById("result-breakdown");
  bd.innerHTML = breakdownHtml(q);

  const book = document.getElementById("result-book");
  book.disabled = false;
  book.innerHTML = 'Book This Rate <span class="btn__arrow">→</span>';

  // cinematic count-up
  const amount = document.getElementById("result-amount");
  const counter = { v: 0 };
  gsap.to(counter, {
    v: q.total,
    duration: 1.1,
    ease: "expo.out",
    onUpdate: () => (amount.textContent = fmt(counter.v)),
  });
  // rAF can be throttled in background tabs — make sure the price lands
  // (skip if a network retick has since changed the target)
  const target = q.total;
  setTimeout(() => {
    if (q.total === target && counter.v < target) amount.textContent = fmt(target);
  }, 1300);

  gsap.fromTo(
    live,
    { opacity: 0, y: 24, filter: "blur(8px)" },
    { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "power3.out" }
  );
  gsap.fromTo(
    bd.children,
    { opacity: 0, x: -14 },
    { opacity: 1, x: 0, duration: 0.6, stagger: 0.07, delay: 0.25, ease: "power2.out" }
  );
}
