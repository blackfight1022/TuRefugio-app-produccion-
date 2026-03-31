(async () => {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const loginRes = await (await fetch('http://localhost:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:'testhost@example.com', contraseña:'123456'})})).json();
  console.log('loginRes', loginRes);
  const token = loginRes.token;
  const delRes = await (await fetch('http://localhost:3000/api/alojamientos/3',{method:'DELETE',headers:{Authorization:'Bearer ' + token}})).json();
  console.log('delRes', delRes);
})();