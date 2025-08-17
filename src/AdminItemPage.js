import React, { useContext } from "react";
import AdminPanel from "./AdminPanel";
import "./AdminPanel.css";
import AuthContext from "./AuthContext";
import { Navigate } from "react-router-dom";

const AdminItemPage = () => {
  const auth = useContext(AuthContext);
  const user = auth ? auth.user : null;

  // Check if user is admin
  const isAdmin = user && (user.isAdmin || user.role === "admin");

  // If not admin, redirect to dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard/assets" replace />;
  }

  return (
    <div className="page-container">
      <h2 className="text-xl font-bold mb-4">아이템이지</h2>
      <div className="bg-white rounded-lg shadow mb-6">
        <AdminPanel />
      </div>
    </div>
  );
};

export default AdminItemPage;
