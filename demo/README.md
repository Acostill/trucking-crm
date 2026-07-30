# First Class Trucking virtual employee demo

This demo shows a Playwright-operated virtual employee completing the same
customer quote workflow a person uses. It runs entirely in the local preview
workspace and does not contact live carrier systems or write production data.

## Run the presentation

From the repository root:

```bash
./demo/run-virtual-employee.sh
```

The runner starts the React workspace when needed and opens Chromium:

1. Introduce the customer request, then click **Start virtual employee**.
2. At the checkpoint, explain that customer-facing actions remain under human
   control.
3. Click **Approve and create quote** in the virtual employee panel.
4. Present the completed FCTL reference and the audit trail.
5. Click **End demo** to close the browser and stop any server started by the
   runner.

## Before the meeting

Install dependencies and the bundled browser once:

```bash
cd client
npm install
npm run demo:install-browser
```

Then rehearse the full demo from the repository root.

## Automatic rehearsal

For a non-interactive confidence check, start the client and run:

```bash
cd client
npm run demo:virtual-employee:auto
```

The latest screenshot and JSON audit log are written to
`client/demo/artifacts/latest/`. Playwright trace evidence is stored under
`client/demo/artifacts/test-results/`.

## Customize the shipment

Edit `client/demo/scenarios/miami-to-atlanta.json`. Keep equipment and
accessorial names aligned with the labels in the quote workspace.
