import { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import Layout from './componentes/layout/Layout';
import './App.css';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

function App() {
  // Recuperar el estado de autenticación desde localStorage
  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem('isLoggedIn') === 'true'
  );

  // Cada vez que cambie el estado de login, lo guardamos
  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn);
  }, [isLoggedIn]);

  // Cuando el login es exitoso
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // Si quisieras manejar logout más adelante:
  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.clear(); // borra token, usuario, etc.
  };

  return (
    <BrowserRouter>
      <Layout isLoggedIn={isLoggedIn} handleLogin={handleLogin} handleLogout={handleLogout} />
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
