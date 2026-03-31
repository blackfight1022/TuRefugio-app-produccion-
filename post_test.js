const fetch = require('node-fetch');

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/alojamientos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + 'TEST_TOKEN'
      },
      body: JSON.stringify({
        titulo: 'Post test',
        descripcion: 'Modal test',
        ubicacion: 'Bogota, Cundinamarca',
        precio: 12345,
        capacidad_personas: 4,
        zona: 'urbana',
        cercania: 'Cerca del centro',
        vistas: 'ciudad',
        politicas: 'No fumadores'
      })
    });

    console.log('Status', res.status);
    const data = await res.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
})();