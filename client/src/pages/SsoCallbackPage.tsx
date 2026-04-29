import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeSsoLogin } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function exchangeToken() {
      const token = searchParams.get("token");

      if (!token) {
        if (isMounted) {
          setError("Missing SSO token.");
        }
        return;
      }

      try {
        await completeSsoLogin(token);
        navigate("/dashboard", { replace: true });
      } catch (exchangeError: any) {
        if (!isMounted) {
          return;
        }

        setError(
          exchangeError?.response?.data?.error ||
            exchangeError?.message ||
            "Unable to complete SSO sign in.",
        );
      }
    }

    void exchangeToken();

    return () => {
      isMounted = false;
    };
  }, [completeSsoLogin, navigate, searchParams]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f7fb",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "20px",
          padding: "32px",
          textAlign: "center",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#0f172a" }}>
          Signing you in
        </h1>
        <p
          style={{ margin: "12px 0 0", color: "#64748b", fontSize: "0.95rem" }}
        >
          We&apos;re connecting your Volint Suite session to Apraizal.
        </p>
        <div
          style={{
            marginTop: "24px",
            borderRadius: "12px",
            padding: "14px 16px",
            background: error ? "#fef2f2" : "#f8fafc",
            border: error ? "1px solid #fecaca" : "1px solid #e2e8f0",
            color: error ? "#b91c1c" : "#475569",
            fontSize: "0.95rem",
          }}
        >
          {error || "Please wait..."}
        </div>
      </div>
    </div>
  );
}
