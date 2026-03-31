const run = async () => {
  const fetch = global.fetch;
  const usuario = { nombre:'testhost', correo:'testhost@example.com', contraseña:'123456', rol:'anfitrion' };
  let res = await fetch('http://localhost:3000/api/auth/register',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(usuario)});
  console.log('register status', res.status); console.log(await res.json());
  res = await fetch('http://localhost:3000/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({correo:usuario.correo, contraseña:usuario.contraseña})});
  console.log('login status', res.status); const loginData = await res.json(); console.log(loginData);
  if (!loginData.token) return;
  const token = loginData.token;
  res = await fetch('http://localhost:3000/api/alojamientos',{method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer '+token}, body:JSON.stringify({titulo:'testzz', descripcion:'xxxxx', ubicacion:'bogota', precio:11111, capacidad_personas:2, zona:'rural', cercania:'cerca', vistas:'mar', politicas:'no fumadores'})});
  console.log('create status', res.status); console.log(await res.json());
  res = await fetch('http://localhost:3000/api/alojamientos');
  const rows = await res.json();
  console.log(rows.filter(r=>r.titulo==='testzz'));
};

run();