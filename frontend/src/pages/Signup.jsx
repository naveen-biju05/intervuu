import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import InputField from "../components/InputField";
import { PrimaryButton, GoogleButton } from "../components/Button";
import api from "../utils/api";
import { saveAuth, validateEmail } from "../utils/auth";

const Signup = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Full name is required.";
    else if (form.name.trim().length < 2)
      e.name = "Name must be at least 2 characters.";
    if (!form.email) e.email = "Email is required.";
    else if (!validateEmail(form.email))
      e.email = "Enter a valid email address.";
    if (!form.password) e.password = "Password is required.";
    else if (form.password.length < 6)
      e.password = "Password must be at least 6 characters.";
    if (!form.confirmPassword)
      e.confirmPassword = "Please confirm your password.";
    else if (form.password !== form.confirmPassword)
      e.confirmPassword = "Passwords do not match.";
    if (!agreed)
      e.terms = "You must agree to the Terms of Service to continue.";
    return e;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", {
        name: form.name.trim(),
        email: form.email,
        password: form.password,
      });
      navigate("/login");
    } catch (err) {
      setServerError(
        err.response?.data?.message || "Signup failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
        Create your account
      </h1>

      {serverError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
          <svg
            className="w-4 h-4 shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <InputField
          label="Full Name"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Manu"
          error={errors.name}
          autoComplete="name"
        />

        <InputField
          label="Email Address"
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="manu@example.com"
          error={errors.email}
          autoComplete="email"
        />

        <InputField
          label="Password"
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          error={errors.password}
          autoComplete="new-password"
        />

        <InputField
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          placeholder="••••••••"
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <div>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setErrors({ ...errors, terms: "" });
              }}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-purple-600 shrink-0"
            />
            <span className="text-sm text-gray-600">
              By creating an account, I agree to the{" "}
              <a
                href="#"
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {errors.terms && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {errors.terms}
            </p>
          )}
        </div>

        <PrimaryButton type="submit" loading={loading}>
          Create Account →
        </PrimaryButton>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          Or sign up with
        </span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <GoogleButton
        onClick={() =>
          (window.location.href = "http://localhost:5000/api/auth/google")
        }
      >
        Google
      </GoogleButton>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-purple-600 font-semibold hover:text-purple-800 transition-colors"
        >
          Log in
        </Link>
      </p>
    </AuthCard>
  );
};

export default Signup;
