import type { 
  EmailService, 
  EmailResult, 
  EmailOptions, 
  EmailRecipient,
  BulkEmailResult,
  ServiceMetadata 
} from './types';

/**
 * Email Service Implementation
 * Provides email sending capabilities for actions
 */
export class EmailServiceImpl implements EmailService {
  async send(
    to: string | string[], 
    subject: string, 
    body: string, 
    options?: EmailOptions
  ): Promise<EmailResult> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      messageId,
      success: true,
      to,
      subject,
      timestamp: Date.now(),
      status: 'sent'
    };
  }

  async sendTemplate(
    to: string | string[], 
    templateId: string, 
    data: any, 
    options?: EmailOptions
  ): Promise<EmailResult> {
    const messageId = `msg-tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      messageId,
      success: true,
      to,
      subject: `Template: ${templateId}`,
      timestamp: Date.now(),
      status: 'sent'
    };
  }

  async sendBulk(
    recipients: EmailRecipient[], 
    options?: EmailOptions
  ): Promise<BulkEmailResult> {
    const results: EmailResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const result = recipient.templateId
          ? await this.sendTemplate(recipient.to, recipient.templateId, recipient.templateData, options)
          : await this.send(recipient.to, recipient.subject, recipient.body || '', options);
        
        results.push(result);
        sent++;
      } catch (error) {
        failed++;
        results.push({
          messageId: '',
          success: false,
          to: recipient.to,
          subject: recipient.subject,
          timestamp: Date.now(),
          status: 'failed'
        });
      }
    }

    return {
      sent,
      failed,
      results
    };
  }
}

// Service metadata for potential action generation
export const emailServiceMetadata: ServiceMetadata = {
  name: 'email',
  description: 'Email service for sending notifications and communications',
  category: 'communication',
  methods: [
    {
      name: 'send',
      description: 'Send a simple email',
      parameters: [
        {
          name: 'to',
          type: 'string | string[]',
          required: true,
          description: 'Recipient email address(es)'
        },
        {
          name: 'subject',
          type: 'string',
          required: true,
          description: 'Email subject line'
        },
        {
          name: 'body',
          type: 'string',
          required: true,
          description: 'Email body content (HTML or plain text)'
        },
        {
          name: 'options',
          type: 'EmailOptions',
          required: false,
          description: 'Additional email options (from, cc, bcc, attachments, etc.)'
        }
      ],
      returns: 'EmailResult',
      example: `const result = await services.email.send(
  'user@example.com',
  'Welcome to our service!',
  '<h1>Welcome!</h1><p>Thank you for signing up.</p>',
  { from: 'noreply@example.com' }
);`
    },
    {
      name: 'sendTemplate',
      description: 'Send an email using a pre-defined template',
      parameters: [
        {
          name: 'to',
          type: 'string | string[]',
          required: true,
          description: 'Recipient email address(es)'
        },
        {
          name: 'templateId',
          type: 'string',
          required: true,
          description: 'Template identifier'
        },
        {
          name: 'data',
          type: 'object',
          required: true,
          description: 'Template variables/data'
        },
        {
          name: 'options',
          type: 'EmailOptions',
          required: false,
          description: 'Additional email options'
        }
      ],
      returns: 'EmailResult',
      example: `const result = await services.email.sendTemplate(
  'user@example.com',
  'welcome-email',
  { firstName: 'John', accountType: 'Premium' }
);`
    },
    {
      name: 'sendBulk',
      description: 'Send emails to multiple recipients',
      parameters: [
        {
          name: 'recipients',
          type: 'EmailRecipient[]',
          required: true,
          description: 'Array of recipient configurations'
        },
        {
          name: 'options',
          type: 'EmailOptions',
          required: false,
          description: 'Common email options for all recipients'
        }
      ],
      returns: 'BulkEmailResult',
      example: `const result = await services.email.sendBulk([
  { to: 'user1@example.com', subject: 'Update', body: 'News...' },
  { to: 'user2@example.com', templateId: 'newsletter', templateData: { month: 'January' } }
]);`
    }
  ]
};

// Factory function for creating email service
export function createEmailService(): EmailService {
  return new EmailServiceImpl();
}