import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: Number(process.env.EMAIL_PORT) || 2525,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    try {
        const info = await transporter.sendMail({
            from: `"Apraizal" <${process.env.EMAIL_USER || 'no-reply@apraizal.com'}>`, // sender address
            to,
            subject,
            html,
        });

        console.log("Message sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};

const renderEmailWrapper = (title: string, contentHtml: string, clientBaseUrl: string) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #EEF0EC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #151A23; -webkit-font-smoothing: antialiased;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #EEF0EC; padding: 40px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid #151A23; border-radius: 6px; box-shadow: 0 4px 20px rgba(21, 26, 35, 0.06); overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 24px 32px; border-bottom: 1px solid #EEF0EC; background-color: #FFFFFF;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                        <tr>
                                            <td align="left">
                                                <img src="${clientBaseUrl}/images/image.png" alt="Apraizal" style="height: 34px; display: block;" />
                                            </td>
                                            <td align="right" style="font-family: 'Courier New', Courier, monospace; font-size: 10px; font-weight: 700; color: #E14B2A; letter-spacing: 0.08em; text-transform: uppercase; background-color: rgba(225,75,42,0.06); padding: 4px 8px; border: 1px solid rgba(225,75,42,0.25); border-radius: 3px;">
                                                ✓ VERIFIED RECORD
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <!-- Body Content -->
                            <tr>
                                <td style="padding: 32px;">
                                    ${contentHtml}
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px 32px; background-color: #EEF0EC; border-top: 1px solid #151A23; text-align: center; font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #5F6876;">
                                    &copy; ${new Date().getFullYear()} Apraizal Performance Verification. All rights reserved.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;
};

export const sendOtpEmail = async (to: string, otp: string) => {
    const subject = "Your Verification Code - Apraizal";
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    
    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0; text-align: left;">Verify Your Email Address</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hello,</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">Thank you for signing up with Apraizal. Please use the verification code below to confirm your account:</p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 18px; text-align: center; margin: 0 0 24px 0;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #151A23;">${otp}</span>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/confirm-otp?email=${encodeURIComponent(to)}" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Verify & Join
            </a>
        </div>
        
        <p style="color: #5F6876; font-size: 13px; margin: 0 0 8px 0;">This code will expire in 15 minutes.</p>
        <p style="color: #5F6876; font-size: 13px; margin: 0;">If you did not request this verification, please ignore this message.</p>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendPasswordResetEmail = async (to: string, otp: string) => {
    const subject = "Password Reset Request - Apraizal";
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    
    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0; text-align: left;">Password Reset Request</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hello,</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">You requested to reset your password. Please use the following code to proceed:</p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 18px; text-align: center; margin: 0 0 24px 0;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #151A23;">${otp}</span>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/forgot-password?email=${encodeURIComponent(to)}" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Reset Password
            </a>
        </div>
        
        <p style="color: #5F6876; font-size: 13px; margin: 0 0 8px 0;">This code will expire in 15 minutes.</p>
        <p style="color: #5F6876; font-size: 13px; margin: 0;">If you did not request this password reset, your account remains secure and no action is needed.</p>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendProvisioningOnboardingEmail = async (params: {
    to: string;
    otp: string;
    organizationName: string;
    recipientName?: string | null;
    setupUrl?: string;
}) => {
    const {
        to,
        otp,
        organizationName,
        recipientName,
        setupUrl,
    } = params;

    const subject = "Your Apraizal Account is Ready";
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    const fallbackSetupUrl = `${clientBaseUrl}/forgot-password?email=${encodeURIComponent(to)}&source=volint-provisioning`;
    const resolvedSetupUrl = setupUrl || fallbackSetupUrl;
    const displayName = recipientName || to;

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">Account Setup</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi ${displayName},</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            Your Apraizal account has been provisioned under <strong>${organizationName}</strong>.
        </p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            Use the setup code below to complete your onboarding:
        </p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 18px; text-align: center; margin: 0 0 24px 0;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #151A23;">${otp}</span>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${resolvedSetupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Set Password & Join
            </a>
        </div>
        
        <p style="color: #5F6876; font-size: 13px; margin: 0;">This code expires in 15 minutes.</p>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendTaskAssignmentEmail = async (params: {
    to: string;
    assigneeName?: string | null;
    taskTitle: string;
    organizationName: string;
    assignerName?: string | null;
    dueDate?: Date | null;
    priority?: string | null;
}) => {
    const {
        to,
        assigneeName,
        taskTitle,
        organizationName,
        assignerName,
        dueDate,
        priority
    } = params;

    const subject = `New Task Assignment: ${taskTitle}`;
    const dueDateText = dueDate ? dueDate.toLocaleDateString() : 'No due date';
    const priorityText = priority || 'LOW';
    const displayName = assigneeName || to;
    const assignedBy = assignerName || 'A team lead';
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">New Task Assignment</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi ${displayName},</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            ${assignedBy} assigned you a new performance record in <strong>${organizationName}</strong>.
        </p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 20px; margin: 0 0 24px 0;">
            <p style="margin: 0 0 10px 0; font-size: 15px; color: #151A23;"><strong>Task:</strong> ${taskTitle}</p>
            <p style="margin: 0 0 10px 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #151A23;"><strong>PRIORITY:</strong> ${priorityText}</p>
            <p style="margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #E14B2A;"><strong>DUE DATE:</strong> ${dueDateText}</p>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/dashboard" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Open Task Inspector
            </a>
        </div>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendInviteEmail = async (params: {
    to: string;
    organizationName: string;
    role: string;
    inviteUrl: string;
    inviterName?: string | null;
    inviteeName?: string | null;
}) => {
    const { to, organizationName, role, inviteUrl, inviterName, inviteeName } = params;
    const subject = `Invitation to join ${organizationName} on Apraizal`;
    const inviter = inviterName || 'An administrator';
    const recipient = inviteeName || to;
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">Organization Invite</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi ${recipient},</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            ${inviter} invited you to join <strong>${organizationName}</strong> as <strong>${role}</strong> on Apraizal.
        </p>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Accept Invitation
            </a>
        </div>
        
        <p style="color: #5F6876; font-size: 13px; margin: 0;">This invitation will expire in 72 hours.</p>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendTaskAlertEmail = async (params: {
    to: string;
    taskTitle: string;
    taskDescription?: string | null;
    creatorName: string | null;
    organizationName: string;
}) => {
    const { to, taskTitle, taskDescription, creatorName, organizationName } = params;
    const subject = `Task Review Alert: ${taskTitle}`;
    const fromUser = creatorName || 'A team member';
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">Task Review Request</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi Team Lead,</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            ${fromUser} has submitted a task in <strong>${organizationName}</strong> for review.
        </p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 20px; margin: 0 0 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #151A23;"><strong>Task:</strong> ${taskTitle}</p>
            ${taskDescription ? `<p style="margin: 0; font-size: 14px; color: #5F6876;"><strong>Description:</strong> ${taskDescription}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/dashboard" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Review Task Record
            </a>
        </div>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendOkrNotificationEmail = async (params: {
    to: string;
    recipientName?: string | null;
    okrTitle: string;
    okrDescription?: string | null;
    teamName: string;
    organizationName: string;
    creatorName: string | null;
    periodStart: string;
    periodEnd: string;
}) => {
    const {
        to,
        recipientName,
        okrTitle,
        okrDescription,
        teamName,
        organizationName,
        creatorName,
        periodStart,
        periodEnd
    } = params;

    const subject = `New OKR Assigned to ${teamName}: ${okrTitle}`;
    const displayName = recipientName || to;
    const createdBy = creatorName || 'An administrator';
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

    const startDate = new Date(periodStart).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
    const endDate = new Date(periodEnd).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">New OKR Ledger</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi ${displayName},</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            ${createdBy} assigned a new OKR to <strong>${teamName}</strong> in <strong>${organizationName}</strong>.
        </p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 20px; margin: 0 0 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #151A23;"><strong>Objective:</strong> ${okrTitle}</p>
            ${okrDescription ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #5F6876;"><strong>Description:</strong> ${okrDescription}</p>` : ''}
            <p style="margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #151A23;"><strong>PERIOD:</strong> ${startDate} - ${endDate}</p>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/dashboard?section=okr" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Open OKR Ledger
            </a>
        </div>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};

export const sendKeyResultNotificationEmail = async (params: {
    to: string;
    recipientName: string | null;
    okrTitle: string;
    keyResultTitle: string;
    organizationName: string;
    creatorName: string | null;
    periodStart: string;
    periodEnd: string;
}) => {
    const {
        to,
        recipientName,
        okrTitle,
        keyResultTitle,
        organizationName,
        creatorName,
        periodStart,
        periodEnd
    } = params;

    const subject = `Key Result Assignment: ${okrTitle}`;
    const displayName = recipientName || to;
    const createdBy = creatorName || 'An administrator';
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');

    const startDate = new Date(periodStart).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
    const endDate = new Date(periodEnd).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const bodyHtml = `
        <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #151A23; margin: 0 0 16px 0;">Key Result Assignment</h2>
        <p style="color: #151A23; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">Hi ${displayName},</p>
        <p style="color: #5F6876; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            ${createdBy} assigned you a Key Result under <strong>${okrTitle}</strong> in <strong>${organizationName}</strong>.
        </p>
        
        <div style="background-color: #EEF0EC; border: 1px solid #151A23; border-radius: 4px; padding: 20px; margin: 0 0 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #151A23;"><strong>Key Result:</strong> ${keyResultTitle}</p>
            <p style="margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #151A23;"><strong>OKR PERIOD:</strong> ${startDate} - ${endDate}</p>
        </div>
        
        <div style="text-align: center; margin: 0 0 24px 0;">
            <a href="${clientBaseUrl}/dashboard?section=okr" style="display: inline-block; padding: 12px 24px; background-color: #151A23; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em;">
                Open OKR Ledger
            </a>
        </div>
    `;

    return sendEmail(to, subject, renderEmailWrapper(subject, bodyHtml, clientBaseUrl));
};
