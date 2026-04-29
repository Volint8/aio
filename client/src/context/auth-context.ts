import { createContext } from "react";

export interface User {
  id: string;
  email: string;
  name: string | null;
  jobTitle: string | null;
  role: string;
  orgRole: string | null;
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<void>;
  completeSsoLogin: (ssoToken: string) => Promise<void>;
  adminSignupInit: (
    email: string,
    pass: string,
  ) => Promise<{ suggestions: string[] }>;
  adminSignupComplete: (
    email: string,
    pass: string,
    organizationName: string,
  ) => Promise<void>;
  inviteAcceptInit: (
    token: string,
    pass: string,
    name?: string,
  ) => Promise<{ mode: string; email: string }>;
  inviteAcceptComplete: (token: string, pass: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string) => Promise<{ message: string }>;
  forgotPasswordInit: (email: string) => Promise<{ message: string }>;
  forgotPasswordComplete: (
    email: string,
    otp: string,
    newPassword: string,
  ) => Promise<{ message: string; token: string; user: User }>;
  logout: () => void;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);