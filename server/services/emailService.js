var nodemailer = require('nodemailer');
var path = require('path');
var dotenv = require('dotenv');

var templates = require('../templates/emailTemplates');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

var cachedTransporter;

function buildTransporter() {
  var missing = [];
  var host = process.env.SMTP_HOST;
  var port = parseInt(process.env.SMTP_PORT || '0', 10);
  var user = process.env.SMTP_USER;
  var pass = process.env.SMTP_PASS;
  var from = process.env.SMTP_FROM || user;

  if (!host) missing.push('SMTP_HOST');
  if (!port) missing.push('SMTP_PORT');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('SMTP_FROM');

  if (missing.length) {
    throw new Error('Missing SMTP configuration: ' + missing.join(', '));
  }

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: user,
      pass: pass
    }
  });
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = buildTransporter();
  }
  return cachedTransporter;
}

function renderTemplate(content, data) {
  if (!content) {
    return content;
  }
  return content.replace(/{{\s*([\w.]+)\s*}}/g, function(match, key) {
    if (!data || typeof data[key] === 'undefined' || data[key] === null) {
      return '';
    }
    return data[key];
  });
}

async function sendTemplatedEmail(options) {
  var templateKey = options && options.templateKey;
  var to = options && options.to;
  var data = options && options.data;

  if (!templateKey) {
    throw new Error('templateKey is required');
  }
  if (!to) {
    throw new Error('Recipient email (to) is required');
  }

  var template = templates[templateKey];
  if (!template) {
    throw new Error('Unknown template "' + templateKey + '"');
  }

  var subject = renderTemplate(template.subject, data);
  var html = renderTemplate(template.html, data);
  var text = renderTemplate(template.text, data);

  var transporter = getTransporter();
  var info = await transporter.sendMail({
    to: to,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    subject: subject,
    html: html,
    text: text
  });

  return info;
}

module.exports = {
  sendTemplatedEmail: sendTemplatedEmail
};

