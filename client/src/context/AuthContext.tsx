import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import api from "../services/api";
import { AuthContext, type User } from "./auth-context";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initialToken = localStorage.getItem("token");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(initialToken));

  useEffect(() => {
    // Check if user is already logged in
    if (!initialToken) {
      return;
    }

    api.defaults.headers.common["Authorization"] = `Bearer ${initialToken}`;
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [initialToken]);

  const login = async (email: string, pass: string) => {
    const res = await api.post("/auth/login", { email, password: pass });
    setUser(res.data.user);
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;

    // Clear stale org selection on fresh login
    localStorage.removeItem("selectedOrgId");
    localStorage.removeItem("selectedOrgRole");
    localStorage.removeItem("selectedOrgName");
  };

  const completeSsoLogin = async (ssoToken: string) => {
    const res = await api.post("/auth/sso/exchange", { token: ssoToken });
    setUser(res.data.user);
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
    localStorage.removeItem("selectedOrgId");
    localStorage.removeItem("selectedOrgRole");
    localStorage.removeItem("selectedOrgName");
  };

  const adminSignupInit = async (email: string, pass: string) => {
    const res = await api.post("/auth/admin-signup/init", {
      email,
      password: pass,
    });
    return { suggestions: res.data.suggestions || [] };
  };

  const adminSignupComplete = async (
    email: string,
    pass: string,
    organizationName: string,
  ) => {
    await api.post("/auth/admin-signup/complete", {
      email,
      password: pass,
      organizationName,
    });
  };

  const inviteAcceptInit = async (
    token: string,
    pass: string,
    name?: string,
  ) => {
    const res = await api.post("/auth/invites/accept/init", {
      token,
      password: pass,
      name,
    });
    return res.data;
  };

  const inviteAcceptComplete = async (token: string, pass: string) => {
    const res = await api.post("/auth/invites/accept/complete", {
      token,
      password: pass,
    });
    setUser(res.data.user);
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
  };

  const verifyOtp = async (email: string, otp: string) => {
    const res = await api.post("/auth/verify-otp", { email, otp });
    setUser(res.data.user);
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
  };

  const resendOtp = async (email: string) => {
    const res = await api.post("/auth/resend-otp", { email });
    return res.data;
  };

  const forgotPasswordInit = async (email: string) => {
    const res = await api.post("/auth/forgot-password/init", { email });
    return { message: res.data.message };
  };

  const forgotPasswordComplete = async (
    email: string,
    otp: string,
    newPassword: string,
  ) => {
    const res = await api.post("/auth/forgot-password/complete", {
      email,
      otp,
      newPassword,
    });
    setUser(res.data.user);
    localStorage.setItem("token", res.data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
    return {
      message: res.data.message,
      token: res.data.token,
      user: res.data.user,
    };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("token");
    delete api.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        completeSsoLogin,
        adminSignupInit,
        adminSignupComplete,
        inviteAcceptInit,
        inviteAcceptComplete,
        verifyOtp,
        resendOtp,
        forgotPasswordInit,
        forgotPasswordComplete,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
