import React, { useState } from 'react';
import './LoginForm.css';
import logo from './LogoRepremar.png';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { environment } from '../../environment';
import LoginMicrosoft from './LoginMicrosoft';


const LoginForm = ({ onLoginSuccess }) => {
  return (
    <div className='formularioschicos'>
      <div className='Login'>
        <img src={logo} alt="Logo Cielosur" style={{ marginBottom: "20px" }} />
        <LoginMicrosoft onSuccess={onLoginSuccess} />
        <ToastContainer />
      </div>
    </div>
  );
}

export default LoginForm;