import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import InputField from "../components/InputField";
import { PrimaryButton } from "../components/Button";
import api from "../utils/api";
import { validateEmail } from "../utils/auth";

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) return setError("Email is required.");
    if (!validateEmail(email)) return setError("Enter a valid email.");

    setLoading(true);
    setError("");

    try {
      await api.post("/auth/forgot-password", { email });

      setSuccess("Reset link sent to your email.");

      
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to send reset email. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
        Forgot Password
      </h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <InputField
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />

        <PrimaryButton type="submit" loading={loading}>
          Send Reset Link
        </PrimaryButton>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Remember your password?{" "}
        <Link
          to="/login"
          className="text-purple-600 font-semibold hover:text-purple-800"
        >
          Back to login
        </Link>
      </p>
    </AuthCard>
  );
};

export default ForgotPassword;