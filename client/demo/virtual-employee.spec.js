const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const scenarioPath = path.join(__dirname, 'scenarios', 'miami-to-atlanta.json');
const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const autoApprove = process.env.DEMO_AUTO_APPROVE === '1';
const autoClose = process.env.DEMO_AUTO_CLOSE === '1';

function dateFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function terminalLog(message) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  console.log(`[${time}] ${message}`);
}

async function installEmployeePanel(page, shipment) {
  await page.evaluate(function(demoShipment) {
    document.body.classList.add('ve-demo-mode');
    window.__veStarted = false;
    window.__veApproved = false;
    window.__veFinished = false;

    const style = document.createElement('style');
    style.id = 've-demo-style';
    style.textContent = `
      body.ve-demo-mode {
        overflow-x: hidden !important;
      }

      body.ve-demo-mode #root {
        width: calc(100vw - 365px);
        min-width: 980px;
      }

      #ve-demo-panel {
        position: fixed;
        z-index: 2147483647;
        inset: 0 0 0 auto;
        width: 365px;
        box-sizing: border-box;
        padding: 22px 20px 18px;
        overflow-y: auto;
        color: #f6fbff;
        background:
          radial-gradient(circle at 80% 0%, rgba(45, 141, 172, .28), transparent 35%),
          linear-gradient(180deg, #071a2f 0%, #0b2640 100%);
        border-left: 1px solid rgba(169, 219, 231, .24);
        box-shadow: -18px 0 45px rgba(7, 26, 47, .24);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #ve-demo-panel * {
        box-sizing: border-box;
      }

      .ve-brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 22px;
      }

      .ve-brand-copy {
        display: flex;
        align-items: center;
        gap: 11px;
      }

      .ve-avatar {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 1px solid rgba(169, 219, 231, .38);
        border-radius: 13px;
        color: #dff8f2;
        background: linear-gradient(145deg, #174d7d, #16836f);
        box-shadow: 0 9px 24px rgba(0, 0, 0, .18);
        font-size: 20px;
      }

      .ve-brand strong,
      .ve-brand small {
        display: block;
      }

      .ve-brand strong {
        font-size: 14px;
        letter-spacing: .01em;
      }

      .ve-brand small {
        margin-top: 2px;
        color: #a8bacb;
        font-size: 11px;
      }

      .ve-live {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border: 1px solid rgba(62, 197, 167, .3);
        border-radius: 999px;
        color: #b9f1e5;
        background: rgba(62, 197, 167, .1);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .ve-live::before {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #3ec5a7;
        box-shadow: 0 0 0 5px rgba(62, 197, 167, .12);
        content: "";
        animation: ve-pulse 1.5s ease-out infinite;
      }

      .ve-section-label {
        display: block;
        margin: 0 0 8px;
        color: #88a4b9;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      .ve-request {
        margin-bottom: 18px;
        padding: 14px;
        border: 1px solid rgba(169, 219, 231, .16);
        border-radius: 13px;
        background: rgba(255, 255, 255, .055);
      }

      .ve-request-header {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 9px;
        color: #d8e8f2;
        font-size: 11px;
        font-weight: 700;
      }

      .ve-request-header span:last-child {
        color: #8fb0c5;
        font-weight: 500;
      }

      .ve-request p {
        margin: 0;
        color: #b8cbd9;
        font-size: 11px;
        line-height: 1.55;
      }

      .ve-status-card {
        margin-bottom: 18px;
        padding: 14px;
        border: 1px solid rgba(62, 197, 167, .22);
        border-radius: 13px;
        background: linear-gradient(145deg, rgba(23, 77, 125, .34), rgba(22, 131, 111, .18));
      }

      .ve-status-card strong {
        display: block;
        margin-bottom: 4px;
        color: #f4fbff;
        font-size: 13px;
      }

      .ve-status-card p {
        min-height: 32px;
        margin: 0;
        color: #afc7d6;
        font-size: 11px;
        line-height: 1.45;
      }

      .ve-progress-track {
        height: 4px;
        margin-top: 12px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, .1);
      }

      #ve-progress-bar {
        width: 4%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #2d8dac, #3ec5a7);
        transition: width .45s ease;
      }

      #ve-action-list {
        display: grid;
        gap: 9px;
        margin: 0 0 18px;
        padding: 0;
        list-style: none;
      }

      #ve-action-list li {
        display: grid;
        grid-template-columns: 20px 1fr;
        gap: 8px;
        align-items: start;
        color: #90a9bb;
        font-size: 11px;
        line-height: 1.35;
      }

      #ve-action-list li::before {
        display: grid;
        width: 18px;
        height: 18px;
        place-items: center;
        border: 1px solid rgba(169, 219, 231, .2);
        border-radius: 50%;
        color: #8aa6ba;
        background: rgba(255, 255, 255, .04);
        content: "•";
        font-size: 12px;
      }

      #ve-action-list li.running {
        color: #e8f5fb;
      }

      #ve-action-list li.running::before {
        border-color: rgba(45, 141, 172, .6);
        color: transparent;
        border-top-color: #69c6df;
        animation: ve-spin .75s linear infinite;
      }

      #ve-action-list li.done {
        color: #b8cbd9;
      }

      #ve-action-list li.done::before {
        border-color: rgba(62, 197, 167, .45);
        color: #dff8f2;
        background: rgba(62, 197, 167, .16);
        content: "✓";
      }

      .ve-button {
        display: none;
        width: 100%;
        min-height: 44px;
        padding: 11px 14px;
        border: 0;
        border-radius: 11px;
        color: #06251f;
        background: linear-gradient(135deg, #54d7ba, #3ec5a7);
        box-shadow: 0 10px 24px rgba(62, 197, 167, .18);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 850;
        transition: transform .18s ease, box-shadow .18s ease;
      }

      .ve-button:hover {
        box-shadow: 0 13px 28px rgba(62, 197, 167, .28);
        transform: translateY(-1px);
      }

      .ve-button.visible {
        display: block;
        animation: ve-enter .25s ease-out;
      }

      .ve-button.finish {
        color: #e9f5fb;
        background: rgba(255, 255, 255, .1);
        box-shadow: none;
      }

      .ve-safety {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin-top: 13px;
        color: #849eb1;
        font-size: 10px;
        line-height: 1.4;
      }

      .ve-safety::before {
        color: #3ec5a7;
        content: "◆";
        font-size: 8px;
        transform: translateY(2px);
      }

      .ve-target {
        position: relative;
        z-index: 2;
        border-radius: 7px !important;
        outline: 3px solid rgba(45, 141, 172, .72) !important;
        outline-offset: 4px !important;
        box-shadow: 0 0 0 8px rgba(45, 141, 172, .12) !important;
        transition: outline-color .2s ease, box-shadow .2s ease;
      }

      @keyframes ve-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes ve-pulse {
        70%, 100% { box-shadow: 0 0 0 9px rgba(62, 197, 167, 0); }
      }

      @keyframes ve-enter {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('aside');
    panel.id = 've-demo-panel';
    panel.setAttribute('aria-label', 'Virtual employee activity');
    panel.innerHTML = `
      <div class="ve-brand">
        <div class="ve-brand-copy">
          <div class="ve-avatar">✦</div>
          <div><strong>FCTL Virtual Employee</strong><small>Quote Operations Agent</small></div>
        </div>
        <span class="ve-live">Live</span>
      </div>

      <span class="ve-section-label">Assigned work</span>
      <div class="ve-request">
        <div class="ve-request-header"><span id="ve-customer"></span><span id="ve-source"></span></div>
        <p id="ve-request-text"></p>
      </div>

      <span class="ve-section-label">Current activity</span>
      <div class="ve-status-card">
        <strong id="ve-status">Ready for assignment</strong>
        <p id="ve-detail">Start the virtual employee when you are ready to present the workflow.</p>
        <div class="ve-progress-track"><div id="ve-progress-bar"></div></div>
      </div>

      <span class="ve-section-label">Audit trail</span>
      <ol id="ve-action-list"></ol>

      <button id="ve-start" class="ve-button visible" type="button">Start virtual employee</button>
      <button id="ve-approve" class="ve-button" type="button">Approve and create quote</button>
      <button id="ve-finish" class="ve-button finish" type="button">End demo</button>
      <div class="ve-safety">A person stays in control of final customer-facing actions.</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('ve-customer').textContent = demoShipment.customer;
    document.getElementById('ve-source').textContent = demoShipment.source;
    document.getElementById('ve-request-text').textContent = demoShipment.request;

    document.getElementById('ve-start').addEventListener('click', function() {
      window.__veStarted = true;
      this.disabled = true;
      this.textContent = 'Virtual employee started';
    });

    document.getElementById('ve-approve').addEventListener('click', function() {
      window.__veApproved = true;
      this.disabled = true;
      this.textContent = 'Approved — creating quote…';
    });

    document.getElementById('ve-finish').addEventListener('click', function() {
      window.__veFinished = true;
      this.disabled = true;
      this.textContent = 'Closing demo…';
    });

    window.__veHud = {
      update: function(update) {
        if (update.status) document.getElementById('ve-status').textContent = update.status;
        if (update.detail) document.getElementById('ve-detail').textContent = update.detail;
        if (update.progress != null) {
          document.getElementById('ve-progress-bar').style.width = update.progress + '%';
        }
        if (update.action) {
          const list = document.getElementById('ve-action-list');
          const previous = list.querySelector('li.running');
          if (previous) {
            previous.classList.remove('running');
            previous.classList.add('done');
          }
          const item = document.createElement('li');
          item.className = update.state === 'done' ? 'done' : 'running';
          item.textContent = update.action;
          list.appendChild(item);
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        document.getElementById('ve-start').classList.toggle('visible', update.start === true);
        document.getElementById('ve-approve').classList.toggle('visible', update.approval === true);
        document.getElementById('ve-finish').classList.toggle('visible', update.finished === true);
      },
      completeCurrent: function() {
        const current = document.querySelector('#ve-action-list li.running');
        if (current) {
          current.classList.remove('running');
          current.classList.add('done');
        }
      }
    };
  }, shipment);
}

async function updateEmployee(page, audit, update) {
  const entry = {
    timestamp: new Date().toISOString(),
    status: update.status,
    detail: update.detail,
    action: update.action,
    progress: update.progress
  };
  audit.push(entry);
  terminalLog(`${update.action || update.status}${update.detail ? ` — ${update.detail}` : ''}`);
  await page.evaluate(function(hudUpdate) {
    window.__veHud.update(hudUpdate);
  }, update);
  await page.waitForTimeout(350);
}

async function spotlight(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(function(element) {
    document.querySelectorAll('.ve-target').forEach(function(target) {
      target.classList.remove('ve-target');
    });
    element.classList.add('ve-target');
  });
}

async function typeLikeEmployee(locator, value) {
  await spotlight(locator);
  await locator.fill('');
  await locator.pressSequentially(String(value), { delay: 28 });
}

test('FCTL virtual employee creates a customer quote', async ({ page }, testInfo) => {
  const audit = [];
  const latestArtifacts = path.join(__dirname, 'artifacts', 'latest');
  fs.mkdirSync(latestArtifacts, { recursive: true });

  terminalLog('Opening the First Class Trucking customer quote workspace');
  await page.goto('/portal/quote?preview=1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('customer-quote-builder')).toBeVisible();
  await installEmployeePanel(page, scenario);

  if (autoApprove) {
    await page.waitForTimeout(350);
    await page.evaluate(function() {
      document.getElementById('ve-start').click();
    });
  }

  terminalLog('Waiting to start the virtual employee');
  await page.waitForFunction(function() {
    return window.__veStarted === true;
  }, null, { timeout: 0 });

  await updateEmployee(page, audit, {
    status: 'Reading customer request',
    detail: 'Identifying the lane, freight characteristics, service level, and special handling.',
    action: 'Received quote request from customer email',
    progress: 8
  });
  await page.waitForTimeout(900);

  await updateEmployee(page, audit, {
    status: 'Request understood',
    detail: 'Miami, FL → Atlanta, GA · 2 pallets · 1,800 lb · standard LTL candidate.',
    action: 'Extracted and validated shipment details',
    progress: 18
  });

  const laneSection = page.locator('.cq-panel').filter({
    has: page.getByRole('heading', { name: 'Where is it going?' })
  });
  const locationGroups = laneSection.locator('.cq-location-group');
  const pickup = locationGroups.nth(0);
  const delivery = locationGroups.nth(1);

  await updateEmployee(page, audit, {
    status: 'Entering pickup and delivery',
    detail: 'Using the same customer portal workflow as an FCTL team member.',
    action: 'Opened lane details',
    progress: 26
  });
  await typeLikeEmployee(pickup.getByLabel('City', { exact: true }), scenario.origin.city);
  await typeLikeEmployee(pickup.getByLabel('State', { exact: true }), scenario.origin.state);
  await typeLikeEmployee(pickup.getByLabel('ZIP code', { exact: true }), scenario.origin.zip);
  await typeLikeEmployee(delivery.getByLabel('City', { exact: true }), scenario.destination.city);
  await typeLikeEmployee(delivery.getByLabel('State', { exact: true }), scenario.destination.state);
  await typeLikeEmployee(delivery.getByLabel('ZIP code', { exact: true }), scenario.destination.zip);

  const pickupDate = laneSection.getByLabel('Pickup date');
  await spotlight(pickupDate);
  await pickupDate.fill(dateFromNow(scenario.pickupDaysFromNow));
  await spotlight(page.getByRole('button', { name: 'Standard', exact: true }));
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await spotlight(page.getByRole('button', { name: /Continue/ }));
  await page.getByRole('button', { name: /Continue/ }).click();

  await updateEmployee(page, audit, {
    status: 'Entering freight details',
    detail: 'Checking dimensions, weight, stackability, and requested accessorials.',
    action: 'Validated lane and pickup date',
    progress: 42
  });

  const freightSection = page.locator('.cq-panel').filter({
    has: page.getByRole('heading', { name: 'What are we moving?' })
  });
  await expect(freightSection).toBeVisible();
  await typeLikeEmployee(freightSection.getByLabel('Pallets'), scenario.freight.pallets);
  await typeLikeEmployee(freightSection.getByLabel('Length (in)'), scenario.freight.length);
  await typeLikeEmployee(freightSection.getByLabel('Width (in)'), scenario.freight.width);
  await typeLikeEmployee(freightSection.getByLabel('Height (in)'), scenario.freight.height);
  await typeLikeEmployee(freightSection.getByLabel('Total weight (lb)'), scenario.freight.totalWeight);
  await typeLikeEmployee(freightSection.getByLabel('Commodity'), scenario.freight.commodity);

  const stackable = freightSection.getByRole('checkbox', { name: /Stackable/ });
  if (scenario.freight.stackable !== await stackable.isChecked()) {
    await spotlight(stackable);
    await stackable.click();
  }

  for (const accessorial of scenario.accessorials) {
    const option = freightSection.getByRole('button', { name: accessorial, exact: true });
    await spotlight(option);
    await option.click();
  }

  await spotlight(page.getByRole('button', { name: /Continue/ }));
  await page.getByRole('button', { name: /Continue/ }).click();

  await updateEmployee(page, audit, {
    status: 'Selecting the right equipment',
    detail: 'FCTL Smart Match recommends shared LTL capacity for this shipment.',
    action: 'Applied dimensions, weight, and special services',
    progress: 60
  });

  const equipmentButton = page.getByRole('button', { name: new RegExp(scenario.equipment) });
  await expect(equipmentButton).toBeVisible();
  await spotlight(equipmentButton);
  await equipmentButton.click();

  await updateEmployee(page, audit, {
    status: 'Preparing rate options',
    detail: 'The employee is checking the selected equipment against the shipment profile.',
    action: `Selected ${scenario.equipment} based on capacity rules`,
    progress: 72
  });
  const getRates = page.getByRole('button', { name: /Get rate options/ });
  await spotlight(getRates);
  await getRates.click();
  await expect(page.getByRole('heading', { name: 'Choose the best way to move it' })).toBeVisible();
  await expect(page.getByText(/without contacting live carrier systems/i)).toBeVisible();

  const primaryRate = page.locator('.cq-rate-card').first();
  const price = (await primaryRate.locator('.cq-rate-price').innerText()).split('\n')[0].trim();
  const service = (await primaryRate.getByRole('heading').innerText()).trim();

  await updateEmployee(page, audit, {
    status: 'Quote ready for review',
    detail: `${service} at ${price}. Final submission is paused for human approval.`,
    action: 'Compared available service and pricing options',
    progress: 84,
    approval: true
  });

  if (autoApprove) {
    await page.waitForTimeout(650);
    await page.evaluate(function() {
      document.getElementById('ve-approve').click();
    });
  }

  terminalLog('Waiting for approval in the virtual employee panel');
  await page.waitForFunction(function() {
    return window.__veApproved === true;
  }, null, { timeout: 0 });

  await updateEmployee(page, audit, {
    status: 'Approval received',
    detail: 'Creating the selected customer quote and recording the decision.',
    action: 'Human approved final quote submission',
    progress: 91
  });
  const requestRate = primaryRate.getByRole('button', { name: /Request this rate/ });
  await spotlight(requestRate);
  await requestRate.click();

  const success = page.getByText('Rate request received', { exact: true });
  await expect(success).toBeVisible();
  const successCopy = await page.locator('.cq-request-success').innerText();
  const referenceMatch = successCopy.match(/Reference\s+([A-Z0-9-]+)/i);
  const reference = referenceMatch ? referenceMatch[1] : 'FCTL-DEMO';

  await page.evaluate(function() {
    document.querySelectorAll('.ve-target').forEach(function(target) {
      target.classList.remove('ve-target');
    });
  });
  await updateEmployee(page, audit, {
    status: 'Quote created successfully',
    detail: `${reference} is ready for the FCTL representative to confirm capacity and customer details.`,
    action: `Created quote ${reference} and completed the audit trail`,
    progress: 100,
    finished: true
  });
  await page.evaluate(function() {
    window.__veHud.completeCurrent();
  });

  const auditPayload = {
    demo: 'FCTL Virtual Employee',
    completedAt: new Date().toISOString(),
    scenario,
    result: {
      reference,
      service,
      price
    },
    actions: audit
  };
  fs.writeFileSync(
    path.join(latestArtifacts, 'audit-trail.json'),
    JSON.stringify(auditPayload, null, 2)
  );
  await page.screenshot({
    path: path.join(latestArtifacts, 'completed-quote.png'),
    fullPage: true
  });
  await testInfo.attach('completed-quote', {
    path: path.join(latestArtifacts, 'completed-quote.png'),
    contentType: 'image/png'
  });

  terminalLog(`Demo complete: ${reference} created at ${price}`);
  terminalLog(`Screenshot: ${path.join(latestArtifacts, 'completed-quote.png')}`);

  if (autoClose) {
    await page.waitForTimeout(700);
    await page.evaluate(function() {
      document.getElementById('ve-finish').click();
    });
  }

  await page.waitForFunction(function() {
    return window.__veFinished === true;
  }, null, { timeout: 0 });
});
