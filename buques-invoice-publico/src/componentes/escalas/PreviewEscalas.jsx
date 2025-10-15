import React, { useState, useEffect } from 'react';
import './listaescalas.css';
import axios from 'axios';
import EscalaListaServicios from './EscalaListaServicios';
import { environment } from '../../environment';
import { useAuth } from '../login/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../../App.css';


const PreviewEscalas = () => {
  const { token, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [escalas, setEscalas] = useState([]);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [idAModificar, setIDAModificar] = useState(null);
  const [escalaAModificar, setEscalaAModificar] = useState(null);

  const handleLogout = () => {
    logout();           // limpia token y usuario
    navigate("/login"); // redirige al login
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login"); // redirige al login si no hay token válido
      return;
    }
    const fetchEscalas = async () => {
      try {
        const response = await axios.get(`${environment.API_URL}previewescalas`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        setEscalas(response.data);
      } catch (err) {
        console.error('Error al obtener las escalas:', err);
        setError('Error al obtener las escalas');
      } finally {
        setLoading(false);
      }
    };
    fetchEscalas();
  }, [token, isAuthenticated, navigate]);

  const handleSearch = (event) => setSearchTerm(event.target.value);

  const handleAgregarServiciosEscala = (buque, escalaId, idPuerto) => {
    setIsLoadingModal(true);
    setIDAModificar(escalaId);
    setEscalaAModificar(buque);

    const fetchServicios = async () => {
      try {
        const response = await axios.get(
          `${environment.API_URL}obtenerserviciosescala?escalaId=${escalaId}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        if (response.data.length === 0) {
          const response1 = await axios.get(
            `${environment.API_URL}obtenerserviciospuertos/${idPuerto}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );
          const serviciosTransformados = response1.data.map(servicio => ({
            nombre: servicio.nombre,
            idescala: escalaId
          }));
          await axios.post(
            `${environment.API_URL}insertserviciospuertos`,
            { servicios: serviciosTransformados },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );
        }
      } catch (error) {
        console.error('Error al obtener servicios:', error);
      } finally {
        setIsLoadingModal(false);
        setIsModalOpen(true);
      }
    };

    fetchServicios();
  };

  const closeModalAgregarServiciosEscala = () => setIsModalOpen(false);

  const filteredData = escalas.filter((row) =>
    row.buque.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="loading-spinner"></div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="preview-escalas">
      <div className="titulo-container">
        <h1 className="titulo">Escalas</h1>
        <button onClick={handleLogout} className='logout-button'>Salir</button>
      </div>
      <input
        className="input-buscar"
        type="text"
        placeholder="🔍 Buscar buque..."
        value={searchTerm}
        onChange={handleSearch}
      />

      <div className="lista-escalas">
        {filteredData.map((row) => (
          <div key={row.id} className="escala-card">
            <div><strong>Buque:</strong> {row.buque}</div>
            <div><strong>Línea:</strong> {row.linea}</div>
            <div><strong>ETA:</strong> {row.eta}</div>
            <div><strong>Puerto:</strong> {row.puerto}</div>
            <div><strong>Operador:</strong> {row.operador}</div>
            <button
              className="btn-servicios"
              onClick={() => handleAgregarServiciosEscala(row.buque, row.id, row.id_puerto)}
            >
              📋 Servicios
            </button>
          </div>
        ))}
      </div>

      {isLoadingModal && (
        <div className="modal-overlay-spinner active">
          <div className="loading-spinner"></div>
        </div>
      )}

      {isModalOpen && !isLoadingModal && (
        <div className="modal-overlay active" onClick={closeModalAgregarServiciosEscala}>
          <div className="modal-container active" onClick={(e) => e.stopPropagation()}>
            <EscalaListaServicios id={idAModificar} closeModal={closeModalAgregarServiciosEscala} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewEscalas;
