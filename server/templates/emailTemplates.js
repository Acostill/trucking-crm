/**
 * Central place for automated email templates. Each template uses simple
 * double-curly braces (e.g. {{loadNumber}}) for dynamic placeholders.
 */
var templates = {
  'load-ready': {
    subject: 'Load {{loadNumber}} is ready for dispatch',
    html:
      '<p>Hi {{recipientName}},</p>' +
      '<p>The load <strong>{{loadNumber}}</strong> is ready for dispatch.</p>' +
      '<ul>' +
      '<li>Customer: {{customer}}</li>' +
      '<li>Dispatcher: {{dispatcher}}</li>' +
      '<li>Delivery date: {{deliveryDate}}</li>' +
      '</ul>' +
      '<p>Please <a href="{{ctaUrl}}">review the load details</a> to keep the schedule on track.</p>' +
      '<p>— Automated Load Desk</p>',
    text:
      'Hi {{recipientName}},\n\n' +
      'The load {{loadNumber}} is ready for dispatch.\n' +
      'Customer: {{customer}}\n' +
      'Dispatcher: {{dispatcher}}\n' +
      'Delivery date: {{deliveryDate}}\n\n' +
      'Review the load details: {{ctaUrl}}\n\n' +
      '— Automated Load Desk'
  }
};

module.exports = templates;

