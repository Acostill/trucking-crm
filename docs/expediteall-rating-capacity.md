# ExpediteAll dimension rejection — September 21, 2026

## Evidence

The matching CRM request `email-quote-1790004039365-5ca27bd5` contains two
107 × 31 × 31 inch pieces, 130 lb total, and a staff-selected Cargo Van.
Stackability is unspecified. Its saved ExpediteAll response is:
“The size of the load exceeds the dimensions.”

ExpediteAll's [published API documentation](https://documenter.getpostman.com/view/30227005/2sAYJ1j2MS),
linked in their integration email and retrieved September 21, explicitly
describes `POST /api/v2/calculate-rate` as Cargo Van rating. It does not document
a request field for selecting box/straight equipment. The local Cargo Van-only
restriction therefore remains; removing it cannot establish a box-truck rate.
This API restriction is distinct from the capacity of ExpediteAll's fleet.

## Local correction

The prior automatic assignment checked each piece and total cube but could
accept pairs that cannot share the truck interior. The new rule checks upright
length/width orientations and whether every pair can coexist end to end,
side by side, or (only with explicit stackability) vertically. Unspecified
stackability also retains the floor-area guard. This is a necessary fit check,
not a complete packing solver or a carrier capacity guarantee.

For the matching freight, the configured Cargo Van interior is 120 × 54 × 60
inches. Two pieces require 214 inches end to end, 62 inches side by side, or
62 inches stacked. They fit the configured Box Truck interior side by side.
Automatic/AI assignment now chooses Box Truck for this example. Staff equipment
choices remain preserved because specific vehicle capacities can differ from
these conservative defaults; the existing record is not automatically changed.

Carrier dimension errors now explain that the connected API rejected Cargo Van
fit and that a portal/manual quote is needed for suitable larger equipment.
Freight dimensions and actual carrier prices are never reduced or fabricated.

## Remaining integration dependency

To return an actual ExpediteAll box-truck price automatically, obtain their
supported box/straight-truck rating endpoint, equipment selector and account
access, or implement a separately verified portal workflow. The current public
contract does not establish that capability. Confirm the actual vehicle and
loading constraints before booking.

These are local code changes. No deployment, booking, outbound email, or
production quote update was performed as part of this fix.
