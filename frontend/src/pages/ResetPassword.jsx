import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import InputField from "../components/InputField";
import { PrimaryButton } from "../components/Button";
import api from "../utils/api";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const validate = () => {
    const e = {};

    if (!form.password)
      e.password = "Password is required.";
    else if (form.password.length < 6)
      e.password = "Password must be at least 6 characters.";

    if (!form.confirmPassword)
      e.confirmPassword = "Please confirm your password.";
    else if (form.password !== form.confirmPassword)
      e.confirmPassword = "Passwords do not match.";

    return e;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);

    setLoading(true);

    try {
      await api.post(`/auth/reset-password/${token}`, {
        password: form.password,
      });

      setSuccess("Password updated successfully.");

      setTimeout(() => {
        navigate("/login");
      }, 2000);

    } catch (err) {
      setErrors({
        server:
          err.response?.data?.message ||
          "Reset failed. Please request a new reset link.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
        Reset Password
      </h1>

      {errors.server && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {errors.server}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <InputField
          label="New Password"
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          error={errors.password}
        />

        <InputField
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          placeholder="••••••••"
          error={errors.confirmPassword}
        />

        <PrimaryButton type="submit" loading={loading}>
          Reset Password
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
}

export default ResetPassword;