import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactPaginate from 'react-paginate';
import './listaservicios.css';
import { environment } from '../../environment';
import { useAuth } from '../login/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../../App.css';

const EscalaListaServicios = ({ id, closeModal }) => {
  const { token, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [serviciomodal, setServicioModal] = useState('');
  const [serviciosfacturas, setServiciosFacturas] = useState([]);
  const [nombre, setSNombre] = useState('');
  const [serviciosmodal, setServiciosModal] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState('');
  const idEscala = id
  const itemsPerPage = 2000;

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login"); // redirige al login si no hay token válido
      return;
    }
    fetchServiciosModal();
  }, [token, isAuthenticated, navigate]);

  const fetchServiciosModal = async () => {
    try {
      console.log(idEscala);
      const response = await axios.get(`${environment.API_URL}obtenerserviciosescala?escalaId=${idEscala}`);
      console.log('log en modal', response.data);
      setServiciosModal(response.data);
      const responsefacturas = await axios.get(`${environment.API_URL}viewescalafacturas/${idEscala}`);
      const responseservicios = await axios.get(`${environment.API_URL}obtenerserviciosfacturas`);

      // Crear un conjunto de IDs de facturas para comparación rápida
      const facturasIds = new Set(responsefacturas.data.map(factura => Number(factura.idfacturas)));

      // Filtrar los servicios cuyo idfactura esté en el conjunto de facturasIds
      const filteredFacturas = responseservicios.data
        .filter(servicio => facturasIds.has(Number(servicio.idfactura)))
        .map(servicio => servicio.nombre);

      // Actualizar el estado con los datos filtrados
      setServiciosFacturas(filteredFacturas);
      console.log('facturas con servicios:', filteredFacturas);
    } catch (error) {
      console.error('Error al obtener servicios:', error);
    }
  }


  const handleAgregarServicio = async (e) => {
    e.preventDefault();
    const servicio = serviciomodal;
    try {
      const response = await axios.post(
        `${environment.API_URL}escalas/agregarservicio`,
        { idEscala, servicio }
      );
      console.log('Servicio agregado:', response.data); // Asegúrate de verificar la respuesta
      setServicioModal('');
      await fetchServiciosModal(); // Espera hasta que se obtengan los nuevos servicios
    } catch (error) {
      setError('Error al agregar el servicio');
      console.error(error);
    }
  };
  const handleEliminarServicio = async (idServicio) => {
    try {
      const response = await axios.delete(`${environment.API_URL}escalas/eliminarservicio/${idServicio}`);
      console.log(response.data);  // Verifica la respuesta del servidor
      fetchServiciosModal();
    } catch (error) {
      console.error('Error al eliminar el servicio:', error);
      setError('Error al eliminar el servicio');
    }
  };

  const filteredData = serviciosmodal.filter((row) =>
    row.nombre.toLowerCase().includes(nombre.toLowerCase())
  );

  const pageCount = Math.ceil(filteredData.length / itemsPerPage);
  const displayedItems = filteredData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  const handlePageClick = (event) => {
    setCurrentPage(event.selected);
  };

  return (
    <div className="modal-servicios">
      <div className='titulo-container'>
	  <h1 className='titulo' >Servicios</h1>
      		<button onClick={closeModal} className='logout-button'>Volver</button>
	  </div>

      <div className='table-container'>
        <form onSubmit={handleAgregarServicio} >
          <div className='div-parametros'>
            <input className='input_buscar'
              type="text"
              placeholder="Agregar Servicio"
              value={serviciomodal}
              onChange={(e) => setServicioModal(e.target.value)}
            />
            <button type='submit' className="add-button">➕</button>
          </div>
        </form>
        <div className="lista-servicios">
          {serviciosmodal.map((row) => {
            const isFacturaServicio = serviciosfacturas.includes(row.nombre);
            return (
              <div
                key={row.idservicio}
                className={`servicio-card ${isFacturaServicio ? 'disabled' : ''}`}
              >
                <span>{row.nombre}</span>
                {!isFacturaServicio && (
                  <button className="action-button" onClick={() => handleEliminarServicio(row.idservicio)}>❌</button>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
export default EscalaListaServicios
