# Forgot Password Feature Implementation

## Overview
A complete forgot password feature has been implemented using an OTP-based reset flow, consistent with the existing authentication patterns in the application.

## User Flow

1. **Request Reset** → User clicks "Forgot Password?" on login page
2. **Enter Email** → User enters their verified email address
3. **Receive OTP** → System sends a 6-digit reset code via email (15-minute expiry)
4. **Reset Password** → User enters OTP + new password
5. **Auto-login** → User is automatically logged in and redirected to dashboard

## Changes Made

### Backend

#### 1. Database Schema (`server/prisma/schema.prisma`)
- Added `passwordResetOtp` (String?) field to User model
- Added `passwordResetOtpExpiresAt` (DateTime?) field to User model

#### 2. Auth Controller (`server/src/controllers/auth.controller.ts`)
- `forgotPasswordInit()` - Validates email, generates OTP, sends reset email
- `forgotPasswordComplete()` - Verifies OTP, validates new password, updates password, auto-login

#### 3. Auth Routes (`server/src/routes/auth.routes.ts`)
- `POST /auth/forgot-password/init` - Initiate password reset
- `POST /auth/forgot-password/complete` - Complete password reset

#### 4. Email Service (`server/src/services/email.service.ts`)
- `sendPasswordResetEmail()` - Sends branded password reset email with OTP

### Frontend

#### 1. Auth Context (`client/src/context/AuthContext.tsx`)
- `forgotPasswordInit(email)` - API call to initiate reset
- `forgotPasswordComplete(email, otp, newPassword)` - API call to complete reset

#### 2. New Page (`client/src/pages/ForgotPasswordPage.tsx`)
- Two-step flow: email entry → OTP + new password entry
- Resend code functionality
- Success/error handling
- Responsive design matching existing pages

#### 3. Login Page (`client/src/pages/LoginPage.tsx`)
- Added "Forgot Password?" link below password field (login mode only)

#### 4. App Routes (`client/src/App.tsx`)
- Added `/forgot-password` route

#### 5. Database Migration
- Migration `20260312085403_add_password_reset_otp` applied successfully

## Security Features

- **Email Enumeration Prevention**: Always returns generic success message even if email doesn't exist
- **OTP Expiry**: 15-minute expiration window
- **Rate Limiting**: Can be added at middleware level if needed
- **Secure Password Storage**: Uses bcrypt with salt rounds
- **Auto-cleanup**: Expired/reset OTPs are cleared from database
- **Verified Users Only**: Only verified users can reset passwords

## API Endpoints

### POST `/auth/forgot-password/init`
**Request:**
```json
{
  "email": "user@company.com"
}
```

**Response (Success):**
```json
{
  "message": "If the email exists and is verified, a password reset code has been sent."
}
```

### POST `/auth/forgot-password/complete`
**Request:**
```json
{
  "email": "user@company.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Response (Success):**
```json
{
  "message": "Password reset successful",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@company.com",
    "name": "User Name",
    "role": "USER"
  }
}
```

## Testing Checklist

- [ ] Request password reset with valid email
- [ ] Verify reset email is received
- [ ] Enter correct OTP and new password
- [ ] Verify auto-login works
- [ ] Test with invalid email (should show generic success)
- [ ] Test with unverified email (should show generic success)
- [ ] Test with expired OTP
- [ ] Test with incorrect OTP
- [ ] Test password validation (< 6 characters)
- [ ] Test resend code functionality
- [ ] Test "Use Different Email" flow

## Files Modified

1. `server/prisma/schema.prisma`
2. `server/src/controllers/auth.controller.ts`
3. `server/src/routes/auth.routes.ts`
4. `server/src/services/email.service.ts`
5. `client/src/context/AuthContext.tsx`
6. `client/src/pages/LoginPage.tsx`
7. `client/src/App.tsx`

## Files Created

1. `client/src/pages/ForgotPasswordPage.tsx`
2. `server/prisma/migrations/20260312085403_add_password_reset_otp/migration.sql`

## Next Steps (Optional Enhancements)

1. Add rate limiting to prevent abuse
2. Add email template customization options
3. Add password strength requirements
4. Add "Reset link" option as alternative to OTP
5. Add audit logging for password resets
6. Add notification email when password is successfully changed
