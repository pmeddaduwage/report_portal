import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST || 'mail.smtp2go.com';
    const port = Number(process.env.SMTP_PORT) || 2525;
    const isSecure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : port === 465 || port === 8465;

    const user = process.env.SMTP_USER || 'mis@hgusa.com';
    const pass = process.env.SMTP_PASS || '';

    if (!pass || pass === 'sent via Teams DM') {
      throw new Error(
        'SMTP_PASS is not configured. Set the SMTP2GO password in backend/.env.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    return this.transporter;
  }

  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully.' };
    } catch (error: any) {
      this.logger.error(`SMTP Verification Failed: ${error.message}`, error.stack);
      return { success: false, message: error.message || 'SMTP Connection failed.' };
    }
  }

  async sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const transporter = this.getTransporter();
      const fromAddress =
        process.env.SMTP_FROM ||
        '"Horizon Report Portal" <mis@hgusa.com>';

      const info = await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject: '[Report Portal] SMTP Test Email',
        text: 'This is a test email sent from Horizon Report Portal to verify SMTP configuration.',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>SMTP Configuration Test Successful!</h2>
            <p>This email confirms that your SMTP server (${process.env.SMTP_HOST || 'mail.smtp2go.com'}) is properly configured and functioning in Horizon Report Portal.</p>
            <p><strong>Sent To:</strong> ${toEmail}</p>
            <p><strong>Sent At:</strong> ${new Date().toUTCString()}</p>
          </div>
        `,
      });

      this.logger.log(`Test email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send test email: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  async sendReportEmail(options: {
    to: string[];
    subject: string;
    bodyText?: string;
    reportName: string;
    displayViewName?: string;
    rowCount: number;
    filename: string;
    fileBuffer: Buffer;
    contentType?: string;
  }): Promise<{ messageId: string }> {
    const {
      to,
      subject,
      bodyText,
      reportName,
      displayViewName,
      rowCount,
      filename,
      fileBuffer,
      contentType = 'text/csv',
    } = options;

    const fromAddress =
      process.env.SMTP_FROM ||
      '"Horizon Report Portal" <mis@hgusa.com>';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9; color: #0f172a; }
    .email-wrapper { width: 100%; padding: 32px 0; background-color: #f1f5f9; }
    .email-container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .email-header { background: #0b2138; padding: 24px 28px; color: #ffffff; }
    .brand-title { font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 6px 0; }
    .header-title { margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px; }
    .email-body { padding: 28px; }
    .message-text { font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0; }
    .summary-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #f8fafc; margin-top: 16px; margin-bottom: 8px; }
    .summary-row td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .summary-row:last-child td { border-bottom: none; }
    .label-col { width: 130px; font-weight: 600; color: #64748b; white-space: nowrap; vertical-align: top; }
    .value-col { font-weight: 600; color: #0f172a; vertical-align: top; }
    .badge { display: inline-block; background-color: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .email-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <div class="brand-title">Horizon Group USA &bull; Report Portal</div>
        <div class="header-title">Scheduled Report Delivery</div>
      </div>
      <div class="email-body">
        <div class="message-text">
          ${bodyText ? `<p style="margin: 0 0 12px 0;">${bodyText.replace(/\n/g, '<br/>')}</p>` : `<p style="margin: 0 0 12px 0;">Hello,</p><p style="margin: 0;">Please find attached the scheduled automated report export generated from the Report Portal.</p>`}
        </div>

        <table class="summary-table">
          <tbody>
            <tr class="summary-row">
              <td class="label-col">Report</td>
              <td class="value-col">${reportName}</td>
            </tr>
            ${
              displayViewName
                ? `
            <tr class="summary-row">
              <td class="label-col">Display View</td>
              <td class="value-col"><span class="badge">${displayViewName}</span></td>
            </tr>
            `
                : ''
            }
            <tr class="summary-row">
              <td class="label-col">Total Records</td>
              <td class="value-col">${rowCount.toLocaleString()} rows</td>
            </tr>
            <tr class="summary-row">
              <td class="label-col">Generated At</td>
              <td class="value-col" style="font-weight: 500; color: #475569;">${new Date().toUTCString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="email-footer">
        This is an automated delivery from <strong>Horizon Report Portal &bull; Team MIS</strong>.<br/>
        Please do not reply directly to this automated email.
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: to.join(', '),
      subject: subject || `[Report Portal] ${reportName}${displayViewName ? ` - ${displayViewName}` : ''} Report`,
      html: htmlContent,
      attachments: [
        {
          filename: filename,
          content: fileBuffer,
          contentType: contentType,
        },
      ],
    };

    this.logger.log(`Sending report email "${mailOptions.subject}" to: ${to.join(', ')}`);
    const transporter = this.getTransporter();
    const info = await transporter.sendMail(mailOptions);
    this.logger.log(`Email successfully sent! Message ID: ${info.messageId}`);
    return { messageId: info.messageId };
  }
}
