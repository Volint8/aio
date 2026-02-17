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
