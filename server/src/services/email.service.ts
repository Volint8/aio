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
            from: `"AIO Platform" <${process.env.EMAIL_USER || 'no-reply@aio.com'}>`, // sender address
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

export const sendOtpEmail = async (to: string, otp: string) => {
    const subject = "Your Verification Code - AIO Platform";
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #333; text-align: center;">Verify Your Email</h2>
            <p style="color: #666; font-size: 16px;">Hello,</p>
            <p style="color: #666; font-size: 16px;">Thank you for signing up with AIO Platform. Please use the following One-Time Password (OTP) to verify your email address:</p>
            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you did not request this verification, please ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="text-align: center; color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} AIO Platform. All rights reserved.</p>
        </div>
    `;

    return sendEmail(to, subject, html);
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
    const assignedBy = assignerName || 'A team member';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #333; text-align: center;">You Have a New Task</h2>
            <p style="color: #666; font-size: 16px;">Hi ${displayName},</p>
            <p style="color: #666; font-size: 16px;">
                ${assignedBy} assigned you a task in <strong>${organizationName}</strong>.
            </p>
            <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Task:</strong> ${taskTitle}</p>
                <p style="margin: 0 0 8px 0;"><strong>Priority:</strong> ${priorityText}</p>
                <p style="margin: 0;"><strong>Due Date:</strong> ${dueDateText}</p>
            </div>
            <p style="color: #666; font-size: 14px;">Please log in to the AIO platform to review and update this task.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="text-align: center; color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} AIO Platform. All rights reserved.</p>
        </div>
    `;

    return sendEmail(to, subject, html);
};

export const sendInviteEmail = async (params: {
    to: string;
    organizationName: string;
    role: string;
    inviteUrl: string;
    inviterName?: string | null;
}) => {
    const { to, organizationName, role, inviteUrl, inviterName } = params;
    const subject = `Invitation to join ${organizationName} on AIO`;
    const inviter = inviterName || 'An administrator';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #333; text-align: center;">You're Invited</h2>
            <p style="color: #666; font-size: 16px;">
                ${inviter} invited you to join <strong>${organizationName}</strong> as <strong>${role}</strong>.
            </p>
            <p style="color: #666; font-size: 16px;">Use the link below to accept this invite:</p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
                    Accept Invite
                </a>
            </p>
            <p style="color: #666; font-size: 14px;">If the button does not work, open: ${inviteUrl}</p>
            <p style="color: #666; font-size: 14px;">This invite expires in 72 hours.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="text-align: center; color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} AIO Platform. All rights reserved.</p>
        </div>
    `;

    return sendEmail(to, subject, html);
};
