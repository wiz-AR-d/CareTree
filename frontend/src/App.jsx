import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

// A simple protective wrapper for authenticated routes
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div className="p-8 text-center text-red-500">Access Denied: You do not have permission to view this page.</div>;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Default root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
