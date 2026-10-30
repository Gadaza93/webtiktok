const http = require('http');

async function runTests() {
  // Start server on port 3001 for testing
  process.env.PORT = 3001;
  require('../server.js');

  // Allow server to boot
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- Iniciando Pruebas de Endpoints ---');

  // Test 1: GET / (Static file serving)
  await makeRequest({
    name: 'GET / (Servir estáticos /public)',
    path: '/',
    method: 'GET',
    expectedStatus: 200
  });

  // Test 2: POST /api/info sin body
  await makeRequest({
    name: 'POST /api/info (Sin body - Error 400)',
    path: '/api/info',
    method: 'POST',
    body: {},
    expectedStatus: 400
  });

  // Test 3: POST /api/info con URL no válida
  await makeRequest({
    name: 'POST /api/info (URL no TikTok - Error 400)',
    path: '/api/info',
    method: 'POST',
    body: { url: 'https://youtube.com/watch?v=12345' },
    expectedStatus: 400
  });

  // Test 4: GET /api/download sin url query param
  await makeRequest({
    name: 'GET /api/download (Sin param url - Error 400)',
    path: '/api/download',
    method: 'GET',
    expectedStatus: 400
  });

  // Test 5: GET /api/download con url inválida
  await makeRequest({
    name: 'GET /api/download (URL malformada - Error 400)',
    path: '/api/download?url=not_a_valid_url',
    method: 'GET',
    expectedStatus: 400
  });

  // Test 6: GET /api/download con URL codificada con caracteres especiales inválidos
  await makeRequest({
    name: 'GET /api/download (URL encoded malformada - Error 400)',
    path: '/api/download?url=' + encodeURIComponent('invalid_url://broken'),
    method: 'GET',
    expectedStatus: 400
  });

  // Test 7: GET /api/download-audio sin url query param
  await makeRequest({
    name: 'GET /api/download-audio (Sin param url - Error 400)',
    path: '/api/download-audio',
    method: 'GET',
    expectedStatus: 400
  });

  // Test 8: GET /api/download-audio con url inválida
  await makeRequest({
    name: 'GET /api/download-audio (URL malformada - Error 400)',
    path: '/api/download-audio?url=not_a_valid_url',
    method: 'GET',
    expectedStatus: 400
  });

  // Test 9: Ruta inexistente (404)
  await makeRequest({
    name: 'GET /ruta-inexistente (Ruta desconocida - Error 404)',
    path: '/ruta-inexistente',
    method: 'GET',
    expectedStatus: 404
  });

  console.log('--- Todas las pruebas de endpoints completadas exitosamente ---');
  process.exit(0);
}

function makeRequest({ name, path, method, body, expectedStatus }) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === expectedStatus) {
          console.log(`[PASS] ${name} -> Status: ${res.statusCode}`);
          resolve(data);
        } else {
          console.error(`[FAIL] ${name} -> Esperaba ${expectedStatus}, obtuvo ${res.statusCode}. Respuesta: ${data}`);
          reject(new Error(`Test failed for ${name}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[ERROR] ${name}:`, err.message);
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

runTests().catch(err => {
  console.error('Fallo en la suite de pruebas:', err);
  process.exit(1);
});
