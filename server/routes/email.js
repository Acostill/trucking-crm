var express = require('express');
var router = express.Router();

var emailService = require('../services/emailService');

/**
 * POST /api/email/send
 * Body: {
 *   "to": "user@example.com",
 *   "templateKey": "load-ready",
 *   "data": { "loadNumber": "123", ... }
 * }
 */
router.post('/send', async function(req, res, next) {
  var payload = req.body || {};
  var to = payload.to;
  var templateKey = payload.templateKey || 'load-ready';
  var templateData = payload.data || payload.templateData || {};

  if (!to) {
    res.status(400).json({ error: 'Recipient email (to) is required' });
    return;
  }

  try {
    var info = await emailService.sendTemplatedEmail({
      to: to,
      templateKey: templateKey,
      data: templateData
    });

    res.status(202).json({
      message: 'Email sent',
      messageId: info && info.messageId ? info.messageId : undefined,
      accepted: info && info.accepted ? info.accepted : undefined
    });
  } catch (err) {
    var clientError = err && err.message && (
      err.message.includes('templateKey') ||
      err.message.includes('Recipient email') ||
      err.message.includes('Unknown template')
    );
    if (clientError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

module.exports = router;

