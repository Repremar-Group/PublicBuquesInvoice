import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginForm from "../login/LoginForm";
import { useAuth } from "../login/AuthContext";
import PreviewEscalas from "../escalas/PreviewEscalas";

function Layout() {
  const { isAuthenticated } = useAuth();
  const loggedIn = isAuthenticated();
  return (
    <Routes>
      {/* Ruta raíz: siempre manda al login si no está logueado */}
       <Route
        path="/"
        element={loggedIn ? <Navigate to="/escalas" /> : <Navigate to="/login" />}
      />

     {/* Login */}
      <Route path="/login" element={loggedIn ? <Navigate to="/escalas" /> : <LoginForm />} />

      {/* Página principal del portal */}
      <Route
        path="/escalas"
        element={loggedIn ? <PreviewEscalas /> : <Navigate to="/login" />}
      />

      {/* Ruta catch-all */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default Layout;
