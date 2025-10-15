import React, { useEffect, useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest, msalInstance } from "./AuthConfig";
import axios from "axios";
import logo from './LogoRepremar.png';
import { useAuth } from "./AuthContext";
import { ToastContainer, toast } from "react-toastify";
import Swal from "sweetalert2";
import { environment } from '../../environment';
import { useNavigate } from "react-router-dom";
import './LoginForm.css';

export default function LoginMicrosoft() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Maneja la redirección de MSAL al volver de Microsoft
    useEffect(() => {
    async function initMSAL() {
      try {
        // Inicializa MSAL
        await msalInstance.initialize();

        // Maneja la respuesta del redirect
        const response = await msalInstance.handleRedirectPromise();

        if (response) {
          const idToken = response.idToken;

          try {
            const backendRes = await axios.post(
              `${environment.API_URL}auth/microsoft`,
              { token: idToken },
              { withCredentials: true }
            );
            const data = backendRes.data;
            login(data.token, data.user); // guarda token y user
            navigate("/"); // redirige a home después de login
          } catch (err) {
            console.error("Error backend:", err);
            Swal.fire({
              icon: "error",
              title: "Error en backend",
              text: "No se pudo autenticar con el backend",
            });
          }
        }
      } catch (err) {
        console.error("Error MSAL redirect:", err);
        Swal.fire({
          icon: "error",
          title: "Autenticación fallida",
          text: "No se pudo completar el login con Microsoft",
        });
      }
    }

    initMSAL();
  }, [login, navigate]);

  const handleMicrosoftLogin = () => {
    msalInstance.loginRedirect(loginRequest);
  };

  return (
    <div className='formularioschicos'>
	  <div className='Login'>
        <img src={logo} alt="Logo Cielosur" style={{ marginBottom: "20px" }} />
        <button className="btn-estandar" onClick={handleMicrosoftLogin}>
        Acceder
      </button>
        <ToastContainer />
      </div>
    </div>
  );
}
