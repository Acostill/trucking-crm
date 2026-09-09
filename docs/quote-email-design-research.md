# First Class Trucking quote email

Researched September 9, 2026. Scope: a customer-facing U.S. freight quote for the CRM's LTL, expedited and truckload workflows. Following visual review, the email uses the existing First Class logo in a simple white letterhead, compact left-aligned detail tables, a modest quoted-total line and neutral rules. Decorative panels, the large headline, numbered stops and the marketing slogan were removed at the user's request. Shipment data and pricing behavior remain unchanged.

## Research and application

These are practical quoting conventions drawn from published industry specifications and carrier workflows, not a claim that every freight email must follow a single prescribed template or that this CRM implements an entire API standard.

| Source | Relevant practice | Applied in this email |
| --- | --- | --- |
| [NMFTA / DSDC Rate Quote API, public preview 1.0.0](https://dsdcapis.github.io/full-truckload/api-specs/rate-quote/v1.0-public-preview/index.html) | Identifies the quote, validity dates, shipment totals, equipment, requested additional services, currency, fuel and other charges; distinguishes an all-inclusive quote. | Exact saved quote reference, issue date from `pricedAt`, staff-selected expiration, USD customer total, equipment/service fields, and explicit fuel and service inclusion declarations. This public preview was examined as a reference; no certification or latest-version claim is made. |
| [XPO rate quote workflow](https://ltl.xpo.com/webapp/rating_p_app/) | Collects origin/destination postal codes, shipment date, handling units, weight, dimensions, commodity class, and pickup/delivery services. | Show the saved lane, requested dates, handling-unit count, total weight and all dimension groups with units. Separate requested extra services from services included in the price. |
| [Freightquote / C.H. Robinson: What goes into a truckload rate quote?](https://www.freightquote.com/blog/what-goes-into-a-truckload-rate-quote/) | Accurate locations, dimensions, weight and timing support accurate rates; capacity, fuel, loading access and appointments affect pricing. | Keep the shipment basis visible. Explain that changed shipment details or service requirements may require repricing. Ask for addresses, contacts, available hours and special handling when the customer requests booking. |
| [NMFTA: National Motor Freight Classification](https://nmfta.org/standards/classification/nmfc/) | LTL classification considers density, handling, stowability and liability; incorrect classification can lead to adjustments. | Show supplied freight class/NMFC for LTL, or request confirmation when missing. Never calculate or invent a class from dimensions and weight alone. |
| [Freightquote FAQ: guaranteed transit](https://www.freightquote.com/frequently-asked-questions/) | Guaranteed transit and pickup guarantees are distinct; scheduled pickup does not automatically carry a guarantee. | Label dates as requested and transit as estimated. Explain that a quote does not reserve equipment and that booking is confirmed before dispatch. No guarantee is inferred from a carrier name or transit-day count. |

## Data and drafting decisions

- Use the exact CRM `quoteId`; do not truncate it into a potentially ambiguous new identifier. `pricedAt` supplies the issue date, rather than the inbound email date or the time the preview is opened.
- Calendar dates retain their recorded day. Missing or invalid dates are explicit; there is no invented seven-day validity period.
- Distinguish quoted service (for example, LTL) from the requested equipment. The carrier service label does not prove that a specific vehicle is reserved.
- Include commodity, every dimension group, dimension units, handling units and weight units. Incomplete measurements remain visibly incomplete. Do not label all handling units as pallets because the canonical data does not retain packaging type.
- Include stackability, temperature range, hazardous UN numbers and requested services when recorded. Do not imply non-hazardous status from an absent UN number.
- Carrier linehaul, accessorial prices and margin are internal procurement data. They are not a customer rate breakdown. The email keeps the saved customer total and does not manufacture a split between base rate, fuel and other charges.
- Add fuel treatment and included-services controls to the email draft. Default fuel treatment is unconfirmed, not included. Merely requesting a service or receiving a carrier accessorial price never marks it included for the customer. These declarations do not change the quoted amount.
- Draft inclusions are scoped to the selected quote and priced revision. They survive a refresh of that same revision within the page, but reset for repricing. Like the personal email note, these fields are email composition data, not new persisted pricing fields; reloading the page starts a fresh draft.
- No payment period, liability limit, insurance promise, cancellation fee, detention rate, MC/DOT number, or carrier tariff is invented or copied from another company's terms.
- Keep browser previews and sent HTML identical. Research citations stay in this implementation note, not in customer emails.

## Verification

Focused template tests cover reference/date accuracy, all dimension groups, missing data, LTL-specific classification, explicit inclusion handling, exclusion of procurement costs, special handling and escaping. Desktop/mobile rendering and the normal client build are checked separately. Browser checks do not substitute for delivery tests across every email client.
