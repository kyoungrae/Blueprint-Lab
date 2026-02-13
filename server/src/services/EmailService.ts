import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

export const sendVerificationEmail = async (to: string, code: string) => {
    // If no credentials are set, log to console for development
    if (!config.email.user || !config.email.pass) {
        console.log('-----------------------------------------');
        console.log(`📧 Email Verification Code for ${to}: ${code}`);
        console.log('Set EMAIL_USER and EMAIL_PASS in .env to send real emails.');
        console.log('-----------------------------------------');
        return;
    }

    try {
        await transporter.sendMail({
            from: config.email.from,
            to,
            subject: '[ERD System] 회원가입 인증 코드입니다',
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
                    <h2 style="color: #2563eb; margin-bottom: 24px;">인증 코드를 입력해주세요</h2>
                    <p style="color: #475569; line-height: 1.6;">안녕하세요. ERD System 회원가입을 위한 인증 코드입니다.</p>
                    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">본 코드는 5분 후 만료됩니다. 본인이 요청하지 않았다면 이 메일을 무시하셔도 좋습니다.</p>
                    <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">© 2026 ERD System</p>
                </div>
            `,
        });
    } catch (error) {
        console.error('Failed to send verification email:', error);
        throw new Error('이메일 발송에 실패했습니다.');
    }
};

export const sendInvitationEmail = async (to: string, projectName: string, inviterName: string, code: string) => {
    if (!config.email.user || !config.email.pass) {
        console.log('-----------------------------------------');
        console.log(`📧 Project Invitation for ${to}`);
        console.log(`Project: ${projectName}`);
        console.log(`Inviter: ${inviterName}`);
        console.log(`Invitation Code: ${code}`);
        console.log('Set EMAIL_USER and EMAIL_PASS in .env to send real emails.');
        console.log('-----------------------------------------');
        return;
    }

    try {
        await transporter.sendMail({
            from: config.email.from,
            to,
            subject: `[ERD System] '${projectName}' 프로젝트로의 초대장입니다`,
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #2563eb; margin-bottom: 24px;">프로젝트 초대 알림</h2>
                    <p style="color: #475569; line-height: 1.6;">
                        안녕하세요. <strong>${inviterName}</strong>님께서 당신을 <strong>'${projectName}'</strong> 프로젝트에 초대하셨습니다.
                    </p>
                    <p style="color: #475569; line-height: 1.6;">아래의 초대 코드를 시스템에 입력하여 프로젝트에 참여하세요.</p>
                    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b;">${code}</span>
                    </div>
                    <div style="text-align: center; margin-bottom: 24px;">
                        <a href="${config.frontendUrl}${config.basePath}/?invite=${code}&email=${encodeURIComponent(to)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">ERD System 로그인 및 초대 수락하기</a>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">본 코드는 7일간 유효합니다. 계정이 없다면 먼저 회원가입을 진행해주세요.</p>
                    <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">© 2026 ERD System</p>
                </div>
            `,
        });
    } catch (error) {
        console.error('Failed to send invitation email:', error);
        throw new Error('초대 이메일 발송에 실패했습니다.');
    }
};
