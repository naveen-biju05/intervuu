import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import JobDescription from "./pages/JobDescription";
import Interview from "./pages/Interview";
import Profile from "./pages/Profile";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAnalytics from "./pages/AdminAnalytics";
import Analytics from "./pages/Analytics";
import InterviewReport from "./pages/InterviewReport";
import InterviewReview from "./pages/InterviewReview";
import InterviewTerminated from "./pages/InterviewTerminated";

import { isAuthenticated, getUser } from "./utils/auth";

//  Private Route (only logged-in users)
const PrivateRoute = ({ children }) =>
  isAuthenticated() ? children : <Navigate to="/login" replace />;

// 🌐 Public Route (prevent logged-in users from accessing login/signup)
const PublicRoute = ({ children }) =>
  isAuthenticated() ? <Navigate to="/dashboard" replace /> : children;

// 🛡️ Admin Route (only logged-in admins)
const AdminRoute = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const user = getUser();
  return user?.role === 'admin' ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />

        {/* Private routes */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <PrivateRoute>
              <Analytics />
            </PrivateRoute>
          }
        />

        <Route
          path="/admin/performance"
          element={
            <PrivateRoute>
              <AdminAnalytics />
            </PrivateRoute>
          }
        />

        <Route
          path="/report/:sessionId"
          element={
            <PrivateRoute>
              <InterviewReport />
            </PrivateRoute>
          }
        />

        <Route
          path="/interview/review/:sessionId"
          element={
            <PrivateRoute>
              <InterviewReview />
            </PrivateRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />

        <Route
          path="/job/:jobId"
          element={
            <PrivateRoute>
              <JobDescription />
            </PrivateRoute>
          }
        />

        <Route
          path="/interview/:jobId"
          element={
            <PrivateRoute>
              <Interview />
            </PrivateRoute>
          }
        />

        <Route
          path="/interview/terminated"
          element={
            <PrivateRoute>
              <InterviewTerminated />
            </PrivateRoute>
          }
        />

        {/* Google OAuth callback */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Reset Password */}
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Admin Dashboard */}
        <Route
          path="/admin/jobs"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
