import React, { useEffect, useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "./AuthConfig";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { ToastContainer, toast } from "react-toastify";
import Swal from "sweetalert2";

const msalInstance = new PublicClientApplication(msalConfig);

export default function LoginMicrosoft({ onSuccess }) {
    const { login } = useAuth();
    const [initialized, setInitialized] = useState(false);
    useEffect(() => {
        async function init() {
            await msalInstance.initialize();
            setInitialized(true);
        }
        init();
    }, []);

    const handleMicrosoftLogin = async () => {
        if (!initialized) {
            alert("MSAL aún no está inicializado, intenta de nuevo en un momento");
            return;
        }

        try {
            const response = await msalInstance.loginPopup(loginRequest);
            const idToken = response.idToken;

            // Usando axios
            const backendRes = await axios.post(
                "http://localhost:5000/api/auth/microsoft",
                { token: idToken },
                { withCredentials: true } // si tu backend usa cookies
            );

            const data = backendRes.data;
            login(data.token, data.user);
        } catch (err) {
            console.error("Error en login Microsoft:", err);
            Swal.fire({
                icon: "error",
                title: "Autenticación fallida",
                text: "No se pudo autenticar con Microsoft",
            });
        }
    };

    return (
        <div>
            <button className="btn-estandar"
                onClick={handleMicrosoftLogin}

            >
                Acceder
            </button>
        </div>

    );
}