

const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');
const mysql2 = require('mysql2/promise');
const Busboy = require('busboy');
const argon2 = require('argon2');
const jwksClient = require('jwks-rsa');
const app = express();
const JWT_SECRET = "mi_clave_secreta";


const client = jwksClient({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys"
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

async function validarTokenMicrosoft(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        audience: "a04c669c-4ec8-4906-8916-f49e885fea1f",  // El Client ID de tu app en Azure
        issuer: "https://login.microsoftonline.com/93dfc24c-f409-43b0-92c9-f9e397506dcb/v2.0" // o tu tenant
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      }
    );
  });
}


const multer = require('multer'); // Middleware para manejar la carga de archivos
const { BlobServiceClient } = require('@azure/storage-blob');


//Constantes para manejar las caratulas con pdflib
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const fs = require('fs');


const corsOptions = {
  origin: "http://localhost:80", // tu frontend
  credentials: true,               // permitir cookies
};
app.use(cors(corsOptions));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`Solicitud recibida: ${req.method} ${req.url}`);
  next();
});
// Crear un pool para la base de datos `buquesinvoice`
const poolBuquesInvoice = mysql2.createPool({
  host: 'itinerarios.mysql.database.azure.com',
  user: 'itinerariosdba',
  password: '!Masterkey_22',
  database: 'buquesinvoice',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 20, // Número máximo de conexiones en el pool
  queueLimit: 0,       // Sin límite en la cola de espera
  connectTimeout: 60000, // Tiempo máximo para conectar
  idleTimeout: 30000,   // Cerrar conexiones inactivas después de 30 segundos
});

// Crear un pool para la base de datos `itinerarios_prod`
const poolItinerarios = mysql2.createPool({
  host: 'itinerarios.mysql.database.azure.com',
  user: 'itinerariosdba',
  password: '!Masterkey_22',
  database: 'itinerarios_prod',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  connectTimeout: 60000, // Tiempo máximo para conectar
  idleTimeout: 30000,   // Cerrar conexiones inactivas después de 30 segundos
});

// Función para verificar el estado de cada pool
const monitorPool = (pool, name) => {
  setInterval(async () => {
    try {
      // Realiza una consulta simple para mantener la conexión activa
      const [rows] = await pool.query('SELECT 1');
      console.log(`${name} Pool está activo:`, {
        // Aquí podrías agregar detalles del estado según lo que quieras rastrear
        // Ejemplo: cantidad de conexiones activas, si es necesario
        message: 'Conexión activa.',
      });
    } catch (err) {
      console.error(`${name} Pool error:`, err.message);
    }
  }, 900000); // Monitorear cada 10 segundos
};

// Monitorear ambos pools
monitorPool(poolBuquesInvoice, 'buquesinvoice');
monitorPool(poolItinerarios, 'Itinerarios');
// Monitorear conexiones activas y liberadas
poolBuquesInvoice.on('acquire', (connection) => {
  console.log('Conexión adquirida para buquesinvoice:', connection.threadId);
});

poolBuquesInvoice.on('release', (connection) => {
  console.log('Conexión liberada de buquesinvoice:', connection.threadId);
});

poolItinerarios.on('acquire', (connection) => {
  console.log('Conexión adquirida para Itinerarios:', connection.threadId);
});

poolItinerarios.on('release', (connection) => {
  console.log('Conexión liberada de Itinerarios:', connection.threadId);
});

const upload = multer({ storage: multer.memoryStorage() });

// Login de usuario (verifica hash con argon2)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    // 🧩 Validación básica
    if (!usuario?.trim() || !password?.trim()) {
      return res.status(400).json({ success: false, message: 'Faltan datos' });
    }

    // 🔎 Buscar usuario
    const [rows] = await poolBuquesInvoice.query(
      'SELECT usuario, password_hash, idoperador, rol FROM users WHERE usuario = ? LIMIT 1',
      [usuario]
    );

    if (rows.length === 0) {
      // No decimos si el error fue usuario o pass — por seguridad
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

    const user = rows[0];

    // 🔐 Verificar hash
    const validPassword = await argon2.verify(user.password_hash, password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

    // 💬 Si todo ok, devolvés los datos que precise el frontend
    res.json({
      success: true,
      user: {
        usuario: user.usuario,
        idoperador: user.idoperador || null,
        rol: user.rol || null,
      },
    });

  } catch (err) {
    console.error('💥 Error al hacer login:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});


//---------------------------------------------------------------------------------------------------------------------------------------------
//Endpoint para obtener una sola factura.
// Endpoint para obtener los detalles de una factura
app.get('/api/obtenerfactura/:id', async (req, res) => {
  console.log('Solicitud recibida en el endpoint /api/obtenerfactura/:id');
  const { id } = req.params;
  console.log(`ID recibido en el endpoint: ${id}`);
  const query = `
    SELECT idfacturas, numero, DATE(fecha) AS fecha, moneda, monto, escala_asociada, proveedor, 
           url_factura, url_notacredito, estado, gia, pre_aprobado, comentarios
    FROM facturas
    WHERE idfacturas = ?
  `;


  try {
    // Realiza la consulta utilizando el pool
    const [results] = await poolBuquesInvoice.query(query, [id]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json({ factura: results[0] });
  } catch (err) {
    console.error('Error al obtener los detalles de la factura:', err);
    return res.status(500).json({ error: 'Error al obtener los detalles de la factura' });
  }
});
//Consumo de la bd de buquesinvoice

// Endpoint para insertar datos de la factura
// Endpoint para insertar datos de la factura
app.post('/api/insertardatosfactura', async (req, res) => {
  console.log("Datos recibidos:", req.body);  // Verificar los datos que llegan

  const { numero, fecha, moneda, monto, escala_asociada, proveedor, url_factura, url_notacredito, estado, gia, pre_aprobado, servicios } = req.body;

  // Verificar si se proporcionan servicios
  if (!servicios || !Array.isArray(servicios) || servicios.length === 0) {
    return res.status(400).send("Error: Se deben proporcionar servicios asociados a la factura.");
  }

  // Verificar si al menos una de las URLs (factura o nota de crédito) está presente
  if ((!url_factura && !url_notacredito) && url_factura != 'NaN') {
    return res.status(400).send("Error: Se debe proporcionar al menos una URL (factura o nota de crédito).");
  }

  // Obtener la conexión del pool de buquesinvoice
  const connectionBuques = await poolBuquesInvoice.getConnection();

  try {
    // Iniciar la transacción
    await connectionBuques.beginTransaction();

    // Insertar la factura
    const sqlFactura = `
      INSERT INTO facturas 
      (numero, fecha, moneda, monto, escala_asociada, proveedor, url_factura, url_notacredito, estado, gia, pre_aprobado) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const valuesFactura = [numero, fecha, moneda, monto, escala_asociada, proveedor, url_factura, url_notacredito, estado, gia, pre_aprobado];

    const [resultFactura] = await connectionBuques.query(sqlFactura, valuesFactura);
    const facturaId = resultFactura.insertId;  // Obtener el ID de la factura insertada

    // Insertar los servicios asociados
    const sqlServicios = `
      INSERT INTO serviciosfacturas (nombre, estado, idfactura) 
      VALUES ?
    `;
    const serviciosValues = servicios.map(servicio => [
      servicio.nombre,
      servicio.estado,
      facturaId  // Usamos el ID de la factura insertada
    ]);

    await connectionBuques.query(sqlServicios, [serviciosValues]);

    // Commit de la transacción si ambos inserts fueron exitosos
    await connectionBuques.commit();

    return res.json({ message: "Factura y servicios insertados exitosamente", id: facturaId });

  } catch (err) {
    // Si hay algún error, hacer rollback de la transacción
    console.error("Error al insertar los datos:", err);
    await connectionBuques.rollback();
    return res.status(500).send("Error al insertar los datos", err);
  } finally {
    // Liberar la conexión del pool
    connectionBuques.release();
  }
});


//Endpoint para buscar servicios asociados a una escala
app.get('/api/obtenerserviciosescala', async (req, res) => {
  const escalaId = req.query.escalaId; // Obtiene el id de la escala desde los parámetros de la query
  console.log('Received request for /api/obtenerserviciosescala');
  console.log('escalaId recibido:', escalaId); // Asegúrate de que el ID es correcto

  // Verificar si el escalaId es válido
  if (!escalaId) {
    return res.status(400).json({ error: 'El parámetro escalaId es obligatorio.' });
  }

  try {
    // Obtener la conexión del pool de buquesinvoice
    const connectionBuques = await poolBuquesInvoice.getConnection();

    // Realiza la consulta para obtener los servicios asociados a la escala
    const query = 'SELECT * FROM serviciosescalas WHERE idescala = ?';
    const [results] = await connectionBuques.query(query, [escalaId]);

    // Si no se encuentran servicios asociados
    if (results.length === 0) {
      return res.json([]);
    }

    // Devuelve los servicios encontrados
    res.json(results);
    connectionBuques.release();
  } catch (err) {
    console.error('Error en la consulta de servicios:', err);
    return res.status(500).json({ error: 'Error al obtener los servicios asociados a la escala.' });
  }
});

// Endpoint para buscar proveedores
app.get('/api/obtenerproveedor', async (req, res) => {
  const search = req.query.search;

  // Verificar si se ha proporcionado un término de búsqueda
  if (!search) {
    return res.status(400).json({ error: 'El parámetro "search" es obligatorio.' });
  }

  try {
    // Obtener la conexión del pool de buquesinvoice
    const connectionBuques = await poolBuquesInvoice.getConnection();

    // Realiza la consulta para buscar proveedores
    const query = 'SELECT * FROM proveedores WHERE nombre LIKE ?';
    const [results] = await connectionBuques.query(query, [`%${search}%`]);

    // Si no se encuentran proveedores
    if (results.length === 0) {
      return res.status(404).json({ message: 'No se encontraron proveedores.' });
    }

    // Devuelve los proveedores encontrados
    res.json(results);
    connectionBuques.release();
  } catch (err) {
    console.error('Error en la consulta de proveedores:', err);
    return res.status(500).json({ error: 'Error al obtener los proveedores.' });
  }
});


//Endpoint para obtener el listado de facturas 
app.get('/api/previewfacturas', async (req, res) => {
  // Consulta SQL para obtener las facturas y sus datos relacionados
  const query = `
  SELECT 
    idfacturas, 
    numero, 
    DATE_FORMAT(fecha, '%d-%m-%Y') AS fecha, 
    moneda, 
    monto, 
    escala_asociada, 
    proveedor, 
    estado, 
    gia,
    url_factura,
    url_notacredito
  FROM facturas
`;

  try {
    // Ejecutar la consulta usando el pool
    const [results] = await poolBuquesInvoice.query(query);

    // Enviar los datos de las facturas como respuesta
    res.json(results);
  } catch (err) {
    console.error('Error al consultar los datos de las facturas:', err);
    res.status(500).json({ error: 'Error al consultar los datos de las facturas' });
  }
});

// Endpoint para obtener servicios de facturas
app.get('/api/obtenerserviciosfacturas', async (req, res) => {
  try {
    // Obtener la conexión del pool de buquesinvoice
    const connectionBuques = await poolBuquesInvoice.getConnection();

    // Consulta para obtener los servicios de facturas
    const query = `
      SELECT 
        idserviciosfacturas, 
        nombre, 
        estado, 
        idfactura
      FROM serviciosfacturas
    `;

    // Ejecutar la consulta
    const [results] = await connectionBuques.query(query);

    // Devolver los resultados
    res.json(results);
    connectionBuques.release();
  } catch (err) {
    console.error('Error al consultar los datos:', err);
    return res.status(500).json({ error: 'Error al consultar los datos' });
  }
});

//---------------------------------------------------------------------------------------------------------------------------------
//Consumo de la bd itinerarios:


// Endpoint para obtener todas las escalas que coincidan con lo buscado en agragar factura
app.get('/api/buscarescalaasociada', async (req, res) => {
  const searchTerm = req.query.searchTermEscalaAsociada || ''; // Obtenemos el término de búsqueda desde la query string

  // Consulta SQL con JOINs para obtener todos los datos de cada tabla relacionada, filtrado por buque
  const query = `
    SELECT 
  itinerarios.id,
  itinerarios.id_puerto,
  DATE_FORMAT(itinerarios.eta, '%d-%m-%Y') AS eta,
  lineas.nombre AS linea,
  buques.nombre AS buque,
  puertos.nombre AS puerto,
  operadores.nombre AS operador
FROM itinerarios
LEFT JOIN lineas ON itinerarios.id_linea = lineas.id
LEFT JOIN buques ON itinerarios.id_buque = buques.id
LEFT JOIN puertos ON itinerarios.id_puerto = puertos.id
LEFT JOIN operadores ON itinerarios.id_operador1 = operadores.id
JOIN buquesinvoice.parametros p ON p.idparametros = 1
    WHERE itinerarios.eta BETWEEN
      STR_TO_DATE(CONCAT(p.fecha_temporada - 1, '-10-01'), '%Y-%m-%d')
      AND STR_TO_DATE(CONCAT(p.fecha_temporada, '-04-30'), '%Y-%m-%d')
  AND buques.nombre LIKE ?  -- Filtro por buque usando el término de búsqueda
  AND (itinerarios.id_puerto = 1 OR itinerarios.id_puerto = 4)
ORDER BY itinerarios.eta DESC;
  `;
  // Preparamos el término de búsqueda para el operador LIKE
  const searchTermWithWildcards = `%${searchTerm}%`;

  try {
    // Obtener la conexión del pool de itinerarios
    const connectionItinerarios = await poolItinerarios.getConnection();

    // Ejecutar la consulta con el término de búsqueda como parámetro
    const [results] = await connectionItinerarios.query(query, [searchTermWithWildcards]);

    // Devolver los resultados
    res.json(results);
    connectionItinerarios.release();
  } catch (err) {
    console.error('Error al consultar los datos de los itinerarios:', err);
    return res.status(500).json({ error: 'Error al consultar los datos de los itinerarios' });
  }
});


// Endpoint para obtener todos los itinerarios con sus datos relacionados
app.get('/api/previewescalas', async (req, res) => {
  // Consulta SQL con JOINs para obtener todos los datos de cada tabla relacionada
  const query = `
    SELECT 
      itinerarios.id,
      DATE_FORMAT(itinerarios.eta, '%d-%m-%Y') AS eta,
      lineas.nombre AS linea,
      buques.nombre AS buque,
      puertos.nombre AS puerto,
      operadores.nombre AS operador,
      itinerarios.id_puerto
    FROM itinerarios
    LEFT JOIN lineas ON itinerarios.id_linea = lineas.id
    LEFT JOIN buques ON itinerarios.id_buque = buques.id
    LEFT JOIN puertos ON itinerarios.id_puerto = puertos.id
    LEFT JOIN operadores ON itinerarios.id_operador1 = operadores.id
    JOIN buquesinvoice.parametros p ON p.idparametros = 1
    WHERE itinerarios.eta BETWEEN
      STR_TO_DATE(CONCAT(p.fecha_temporada - 1, '-10-01'), '%Y-%m-%d')
      AND STR_TO_DATE(CONCAT(p.fecha_temporada, '-04-30'), '%Y-%m-%d')
    AND (itinerarios.id_puerto = 1 OR itinerarios.id_puerto = 4)
    ORDER BY itinerarios.eta DESC
  `;
  try {
    const [results] = await poolItinerarios.query(query);
    res.json(results);
  } catch (err) {
    console.error('Error al consultar los datos de los itinerarios:', err);
    res.status(500).json({ error: 'Error al consultar los datos de los itinerarios' });
  }
});
//-------------------------------------------------------------------------------------------------------------------------------------


app.listen(5000, () => {
  console.log('Servidor corriendo en el puerto 5000');
});

app.get('/', (req, res) => {
  res.send('Servidor funcionando');
});

// Endpoint para obtener todos los itinerarios con sus datos relacionados
app.get('/api/previewescalas', async (req, res) => {
  // Consulta SQL con JOINs para obtener todos los datos de cada tabla relacionada
  const query = `
    SELECT
      itinerarios.id,
      DATE_FORMAT(itinerarios.eta, '%d-%m-%Y') AS eta,
      lineas.nombre AS linea,
      buques.nombre AS buque,
      puertos.nombre AS puerto,
      operadores.nombre AS operador,
      itinerarios.id_puerto
    FROM itinerarios
    LEFT JOIN lineas ON itinerarios.id_linea = lineas.id
    LEFT JOIN buques ON itinerarios.id_buque = buques.id
    LEFT JOIN puertos ON itinerarios.id_puerto = puertos.id
    LEFT JOIN operadores ON itinerarios.id_operador1 = operadores.id
    JOIN buquesinvoice.parametros p ON p.idparametros = 1
    WHERE itinerarios.eta BETWEEN
      STR_TO_DATE(CONCAT(p.fecha_temporada - 1, '-10-01'), '%Y-%m-%d')
      AND STR_TO_DATE(CONCAT(p.fecha_temporada, '-04-30'), '%Y-%m-%d')
    AND (itinerarios.id_puerto = 1 OR itinerarios.id_puerto = 4)
    ORDER BY itinerarios.eta DESC
  `;
  try {
    const [results] = await poolItinerarios.query(query);
    res.json(results);
  } catch (err) {
    console.error('Error al consultar los datos de los itinerarios:', err);
    res.status(500).json({ error: 'Error al consultar los datos de los itinerarios' });
  }
});

//Endpoint para buscar servicios asociados a una escala
app.get('/api/obtenerserviciosescala', async (req, res) => {
  const escalaId = req.query.escalaId; // Obtiene el id de la escala desde los parámetros de la query
  console.log('Received request for /api/obtenerserviciosescala');
  console.log('escalaId recibido:', escalaId); // Asegúrate de que el ID es correcto

  // Verificar si el escalaId es válido
  if (!escalaId) {
    return res.status(400).json({ error: 'El parámetro escalaId es obligatorio.' });
  }

  try {
    // Obtener la conexión del pool de buquesinvoice
    const connectionBuques = await poolBuquesInvoice.getConnection();

    // Realiza la consulta para obtener los servicios asociados a la escala
    const query = 'SELECT * FROM serviciosescalas WHERE idescala = ?';
    const [results] = await connectionBuques.query(query, [escalaId]);

    // Si no se encuentran servicios asociados
    if (results.length === 0) {
      return res.json([]);
    }

    // Devuelve los servicios encontrados
    res.json(results);
    connectionBuques.release();
  } catch (err) {
    console.error('Error en la consulta de servicios:', err);
    return res.status(500).json({ error: 'Error al obtener los servicios asociados a la escala.' });
  }
});

app.get('/api/obtenerserviciospuertos/:puertos', async (req, res) => {
  const puertoId = req.params.puertos;
  console.log('Puerto ID recibido:', puertoId); // Asegúrate de que se imprime el valor correcto
  const query = `
    SELECT *
    FROM servicios
    WHERE servicios.puertos = ?;
  `;
  try {
    // Obtener una conexión del pool
    const connection = await poolBuquesInvoice.getConnection();

    // Ejecutar la consulta
    const [results] = await connection.query(query, [puertoId]);

    // Liberar la conexión del pool
    connection.release();

    if (results.length === 0) {
      console.log('No se encontraron servicios para este puerto');
      return res.status(404).json({ error: 'No se encontraron servicios para el puerto especificado' });
    }

    console.log('Servicios Puertos:', results);
    res.json(results); // Envía los resultados encontrados

  } catch (err) {
    console.error('Error al consultar los servicios puertos:', err);
    return res.status(500).json({ error: 'Error interno del servidor al consultar los servicios puertos' });
  }
});

app.post('/api/insertserviciospuertos', async (req, res) => {
  console.log('Cuerpo de la solicitud:', req.body);  // Verificar el contenido
  const servicios = req.body.servicios;

  if (!servicios || !Array.isArray(servicios)) {
    return res.status(400).json({ error: 'La lista de servicios es requerida' });
  }

  const query = 'INSERT INTO serviciosescalas (nombre, idescala) VALUES (?, ?)';

  // Usamos una transacción para insertar múltiples servicios de forma atómica
  const connection = await poolBuquesInvoice.getConnection();
  try {
    // Iniciamos la transacción
    await connection.beginTransaction();

    // Insertamos todos los servicios en la base de datos
    const serviciosIds = [];

    for (const servicio of servicios) {
      const { idescala, nombre } = servicio;
      const [result] = await connection.query(query, [nombre, idescala]);
      serviciosIds.push(result.insertId);
    }

    // Confirmamos la transacción
    await connection.commit();

    res.json({ message: 'Servicios agregados con éxito', serviciosIds });

  } catch (err) {
    // Si ocurre un error, deshacemos la transacción
    await connection.rollback();
    console.error('Error al agregar los servicios:', err);
    res.status(500).json({ error: 'Error al agregar los servicios' });
  } finally {
    // Liberamos la conexión del pool
    connection.release();
  }
});

app.get('/api/viewescalafacturas/:id', async (req, res) => {
  const escalaId = req.params.id;
  console.log(`Escala ID recibido: ${escalaId}`); // Verifica el ID recibido

  if (!escalaId) {
    return res.status(400).json({ error: 'ID de escala no proporcionado' });
  }

  const query = `
    SELECT
    idfacturas,
    numero,
    DATE_FORMAT(fecha, '%d-%m-%Y') AS fecha,
    moneda,
    monto,
    escala_asociada,
    proveedor,
    estado,
    gia,
    url_factura
    FROM facturas
    WHERE facturas.escala_asociada = ?;
  `;

  try {
    // Obtener una conexión del pool
    const connection = await poolBuquesInvoice.getConnection();

    // Ejecutar la consulta
    const [results] = await connection.query(query, [escalaId]);

    // Liberar la conexión del pool
    connection.release();

    if (results.length === 0) {
      return res.json([]);
    }

    console.log('Facturas encontradas:', results); // Muestra los resultados obtenidos
    res.json(results); // Envía las facturas encontradas

  } catch (err) {
    console.error('Error al consultar las facturas:', err); // Muestra el error específico
    return res.status(500).json({ error: 'Error interno del servidor al consultar las facturas' });
  }
});

// Endpoint para obtener servicios de facturas
app.get('/api/obtenerserviciosfacturas', async (req, res) => {
  try {
    // Obtener la conexión del pool de buquesinvoice
    const connectionBuques = await poolBuquesInvoice.getConnection();

    // Consulta para obtener los servicios de facturas
    const query = `
      SELECT
        idserviciosfacturas,
        nombre,
        estado,
        idfactura
      FROM serviciosfacturas
    `;

    // Ejecutar la consulta
    const [results] = await connectionBuques.query(query);

    // Devolver los resultados
    res.json(results);
    connectionBuques.release();
  } catch (err) {
    console.error('Error al consultar los datos:', err);
    return res.status(500).json({ error: 'Error al consultar los datos' });
  }
});

// Endpoint para agregar un servicio a una escala
app.post('/api/escalas/agregarservicio', async (req, res) => {
  const { idEscala, servicio } = req.body;  // Obtiene id de la escala y el servicio desde el cuerpo de la solicitud
  console.log('Datos recibidos en el backend:', req.body); // Inspecciona los datos


  if (!idEscala || !servicio) {
    return res.status(400).json({ error: 'ID de escala y nombre del servicio son requeridos' });
  }
  try {
    // Obtener una conexión del pool
    const connection = await poolBuquesInvoice.getConnection();

    // Consulta SQL para insertar el servicio en la escala
    const query = 'INSERT INTO serviciosescalas (idescala, nombre) VALUES (?, ?)';
    const [results] = await connection.query(query, [idEscala, servicio]);

    // Liberar la conexión del pool
    connection.release();

    // Respuesta indicando éxito en la adición del servicio
    res.status(200).json({
      message: 'Servicio agregado con éxito',
      servicioId: results.insertId,
    });
    console.log({ message: 'Servicio agregado con éxito', servicioId: results.insertId });

  } catch (err) {
    console.error('Error al agregar el servicio a la escala:', err);
    return res.status(500).json({ error: 'Error al agregar el servicio' });
  }
});

app.post("/api/auth/microsoft", async (req, res) => {
  let connection;
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token faltante" });

    const decoded = await validarTokenMicrosoft(token);
    const email = decoded.preferred_username;

    connection = await poolBuquesInvoice.getConnection();
    const [rows] = await connection.query(
      "SELECT id, usuario, idoperador, rol, Mail FROM users WHERE Mail = ?",
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: "Usuario no registrado" });
    }
    const user = rows[0];
    const appToken = jwt.sign(
      { usuario: user.usuario, rol: user.rol, idoperador: user.idoperador },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token: appToken, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error validando token Microsoft" });
  } finally {
    if (connection) connection.release();
  }
});
// Endpoint para eliminar servicio en escala
app.delete('/api/escalas/eliminarservicio/:idservicio', async (req, res) => {
  const { idservicio } = req.params; // Usando req.params para obtener el parámetro de la ruta

  if (!idservicio) {
    return res.status(400).json({ error: 'El parámetro idservicio es obligatorio' });
  }

  let connection;
  try {
    // Obtener la conexión del pool
    connection = await poolBuquesInvoice.getConnection();

    const query = 'DELETE FROM serviciosescalas WHERE idservicio = ?';
    const [results] = await connection.query(query, [idservicio]);

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    // Enviar una respuesta indicando que la eliminación fue exitosa
    res.json({ message: 'Servicio eliminado con éxito' });
  } catch (err) {
    console.error('Error al eliminar el servicio de la escala:', err);
    res.status(500).json({ error: 'Error al eliminar el servicio' });
  } finally {
    // Asegurar que la conexión se libere
    if (connection) connection.release();
  }
});
