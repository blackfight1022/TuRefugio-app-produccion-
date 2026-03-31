let imagenesTemp = [];



// ======================================
// CONFIGURACIÓN BASE
// ======================================
// Hacer la URL de API dinámicamente para funcionar en cualquier dispositivo
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;
const token = localStorage.getItem("token");

// ======================================
// VALIDAR SESIÓN
// ======================================
if (!token) {
  alert("⚠️ Debes iniciar sesión");
  window.location.href = "../login/login.html";
}

// ======================================
// HEADERS
// ======================================
const headers = {
  "Content-Type": "application/json",
  "Authorization": "Bearer " + token
};

function normalizarRutaImagen(rutaOriginal) {
  const limpio = String(rutaOriginal || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^public\//i, "")
    .replace(/^\/+/, "");

  if (!limpio) return "uploads/default.jpg";
  return limpio.startsWith("uploads/") ? limpio : `uploads/${limpio.split("uploads/").pop()}`;
}

function construirUrlImagen(rutaOriginal) {
function construirUrlImagen(rutaOriginal) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/${normalizarRutaImagen(rutaOriginal)}`;
}
}

let graficaOcupacionRef = null;
const misAlojamientosIds = new Set();

function manejarSesionExpirada(respuesta) {
  if (respuesta.status === 401 || respuesta.status === 403) {
    alert("⚠️ Sesión expirada, vuelve a iniciar sesión");
    localStorage.clear();
    window.location.href = "../login/login.html";
    return true;
  }
  return false;
}

// ======================================
// CREAR ALOJAMIENTO
// ======================================
async function crearAlojamiento() {
  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const ciudad = document.getElementById("ciudad").value.trim();
  const region = document.getElementById("region").value.trim();
  const zona = document.getElementById("zona").value;
  const cercania = document.getElementById("cercania").value.trim();
  const direccion = document.getElementById("direccion").value.trim();
  const gpsUbicacion = (document.getElementById("gpsUbicacion") || {}).value || "";
  const vistas = document.getElementById("vistas").value;
  const precio = document.getElementById("precio").value;
  const capacidad = document.getElementById("capacidad").value;
  const politicas = document.getElementById("politicas").value.trim();

  if (!titulo || !precio || !capacidad) {
    alert("⚠️ Título, precio y capacidad son obligatorios");
    return;
  }

  // Construir ubicación: ciudad + región (texto visible)
  // + dirección exacta si la escribió + link GPS si lo obtuvo
  let ubicacion = "";
  if (ciudad) ubicacion += ciudad;
  if (region) ubicacion += (ubicacion ? ", " : "") + region;
  if (direccion) ubicacion += (ubicacion ? ", " : "") + direccion;
  if (gpsUbicacion) ubicacion += (ubicacion ? ", " : "") + gpsUbicacion;
  if (!ubicacion) ubicacion = "";

  try {
    const res = await fetch(`${API_URL}/alojamientos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        titulo, 
        descripcion, 
        ubicacion, 
        direccion,
        zona, 
        cercania, 
        vistas, 
        precio, 
        capacidad_personas: capacidad,
        politicas
      })
    });

    if (res.status === 401 || res.status === 403) {
      alert("⚠️ Sesión expirada, vuelve a iniciar sesión");
      localStorage.clear();
      window.location.href = "../login/login.html";
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ Error al crear alojamiento");
      return;
    }
    window.alojamientoActual = data.id;
    alert("✅ Alojamiento creado correctamente");
    document.getElementById("formAlojamiento").reset();
    const _fc = document.getElementById("formContainer");
    const _tb = document.getElementById("toggleCrear");
    if (_fc && _tb) colapsarSeccion(_tb, _fc);
    cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}





// ======================================
// LISTAR ALOJAMIENTOS
// ======================================
async function cargarAlojamientos() {
  try {
    const res = await fetch(`${API_URL}/anfitrion/alojamientos`, { headers });
    const data = await res.json();
    if (manejarSesionExpirada(res)) return;

    const contenedor = document.getElementById("listaAlojamientos");
    if (!contenedor) return;
    contenedor.innerHTML = "";
    misAlojamientosIds.clear();

    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.error || "No se pudieron cargar alojamientos."}</p>`;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>No tienes alojamientos registrados</p>";
      const inputBuscar = document.getElementById("buscarAlojamiento");
      if (inputBuscar) inputBuscar.value = "";
      return;
    }

    data.forEach((a) => misAlojamientosIds.add(Number(a.id)));

    const inputBuscar = document.getElementById("buscarAlojamiento");
    const actual = Number(inputBuscar?.value || 0);
    if (inputBuscar && (!actual || !misAlojamientosIds.has(actual))) {
      inputBuscar.value = String(data[0].id);
    }

    const idSeleccionado = Number(document.getElementById("buscarAlojamiento")?.value || 0);
    const idParaGrafica = idSeleccionado || Number(data[0]?.id || 0);
    if (idParaGrafica) {
      actualizarGraficaOcupacion(idParaGrafica);
    }

    data.forEach(async (alojamiento) => {
  const card = document.createElement("div");
  card.classList.add("card-item");
  card.dataset.id = alojamiento.id;

  const resumen = await obtenerResumenHabitaciones(alojamiento.id);

  card.innerHTML = `
    <h4>${alojamiento.titulo}</h4>
    <p><strong>ID:</strong> ${alojamiento.id}</p>
    <p>📍 ${alojamiento.ubicacion || "Sin ubicación"}</p>
    <p>💰 $${alojamiento.precio}</p>
    <p>🛏 ${resumen.total} habitaciones</p>
    <p style="color: #4caf50;">✅ ${resumen.disponibles} disponibles</p>
    <p style="color: #f44336;">❌ ${resumen.ocupadas} ocupadas</p>
    <p style="color: #ff9800;">🛠 ${resumen.mantenimiento} en mantenimiento</p>
    <div class="galeria" id="galeria-${alojamiento.id}"></div>
    <button onclick="seleccionarImagen(${alojamiento.id})">📸 Agregar fotos</button>
    <button onclick="eliminarAlojamiento(${alojamiento.id})">🗑️ Eliminar Alojamiento</button>
    <button onclick="abrirCamaraPro(${alojamiento.id})">📷 Usar cámara</button>

    <button onclick="crearServicio(${alojamiento.id})">➕ Crear servicio</button>

    <button onclick="visualizarServicios(${alojamiento.id})">👁️ Visualizar servicios</button>
    <button onclick="eliminarServicioGlobal(${alojamiento.id})">❌ Eliminar servicio</button>
    <button onclick="gestionarReservasAlojamiento(${alojamiento.id})">📅 Gestionar reservas</button>

  `;

  contenedor.appendChild(card);
  cargarGaleria(alojamiento.id);
});

 } catch (error) {
    console.error(error);
    alert("❌ Error cargando alojamientos");
  }
}

async function actualizarGraficaOcupacion(idAlojamiento) {
  const canvas = document.getElementById("graficaOcupacion");
  if (!canvas || typeof Chart === "undefined") return;

  try {
    const res = await fetch(`${API_URL}/reservas/estadisticas/ocupacion-semanal/${idAlojamiento}`, { headers });
    const data = await res.json();
    if (!res.ok) return;

    const labels = Array.isArray(data.labels) ? data.labels : [];
    const valores = Array.isArray(data.ocupacion) ? data.ocupacion : [];

    if (graficaOcupacionRef) {
      graficaOcupacionRef.destroy();
    }

    const ctx = canvas.getContext("2d");
    graficaOcupacionRef = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: valores,
          backgroundColor: "rgba(0, 123, 138, 0.85)",
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          datalabels: { color: "#ffffff", formatter: value => `${value}%` }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100
          }
        }
      },
      plugins: typeof ChartDataLabels !== "undefined" ? [ChartDataLabels] : []
    });
  } catch (error) {
    console.error("Error cargando gráfica de ocupación", error);
  }
}

// ======================================
// ELIMINAR ALOJAMIENTO
// ======================================
async function eliminarAlojamiento(id) {
  if (!confirm("¿Seguro que deseas eliminar este alojamiento?")) return;
  try {
    const res = await fetch(`${API_URL}/alojamientos/${id}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ Error eliminando");
      return;
    }
    alert("🗑️ Alojamiento eliminado");

// 🔥 ACTUALIZAR TODO EN TIEMPO REAL
await cargarAlojamientos();
await cargarGaleriaAlojamientos();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}

// ======================================
// INIT + INPUT IMÁGENES
// ======================================
document.addEventListener("DOMContentLoaded", () => {
  cargarAlojamientos();
  cargarGaleriaAlojamientos();
  cargarSolicitudesCancelacionAnfitrion();

  // ======================================
  // BOTÓN GUARDAR SERVICIOS
  // ======================================
  const btnGuardarServicios = document.getElementById("btnGuardarServicios");

  if (btnGuardarServicios) {
    btnGuardarServicios.addEventListener("click", async (e) => {
      e.preventDefault();

      if (modoEliminandoServicios) {
        // El modo de eliminación gestiona su propio flujo de click para evitar duplicados.
        return;
      }

      const checks = document.querySelectorAll("#formServicios input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const idServicio of seleccionados) {
          await fetch(`${API_URL}/habitaciones/${habitacionServicioActual}/servicios`, {
            method: "POST",
            headers,
            body: JSON.stringify({ id_servicio: idServicio })
          });
        }

        alert("✅ Servicios asignados correctamente");
        cerrarModalServicios();
        cargarHabitaciones();
      } catch (error) {
        console.error(error);
        alert("❌ Error asignando servicios");
      }
    });
  }

  const input = document.getElementById("inputImagen");
  if (!input) return;

  input.addEventListener("change", async function () {
    const alojamientoId = this.dataset.alojamientoId;
    const habitacionId = this.dataset.habitacionId;
    const tipo = this.dataset.tipo;

    if (!alojamientoId && !habitacionId) {
      alert("❌ No se seleccionó alojamiento ni habitación");
      return;
    }

    const files = this.files;
    if (!files.length) return;

    const previewContainer = document.getElementById("previewContainer");
    if (previewContainer) previewContainer.innerHTML = "";

    const formData = new FormData();
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!previewContainer) return;
        const img = document.createElement("img");
        img.src = e.target.result;
        img.classList.add("preview-img");
        previewContainer.appendChild(img);
      };
      reader.readAsDataURL(file);
      formData.append("imagenes", file);
    });

    try {
      let url = "";
      if (tipo === "habitacion") {
        url = `${API_URL}/habitaciones/${habitacionId}/imagenes`;
      } else {
        url = `${API_URL}/alojamientos/${alojamientoId}/imagenes`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData
      });

      if (!res.ok) {
        alert("Error subiendo imágenes");
        return;
      }

      if (tipo === "habitacion") {
        await cargarGaleriaHabitacion(habitacionId);
      } else {
        await cargarGaleria(alojamientoId);
        await cargarGaleriaAlojamientos();
      }
    } catch (error) {
      console.error(error);
      alert("Error conexión");
    }
  });
});

// ======================================
// TOGGLE COLLAPSIBLE FORM (ACORDEÓN)
// ======================================
function colapsarSeccion(btn, container) {
  container.classList.add("collapsed");
  btn.classList.add("collapsed");
}

function expandirSeccion(btn, container) {
  container.classList.remove("collapsed");
  btn.classList.remove("collapsed");
}

function scrollConOffset(elemento, offset = 70) {
  if (!elemento) return;
  const y = elemento.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: Math.max(y, 0), behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn    = document.getElementById("toggleCrear");
  const formContainer = document.getElementById("formContainer");
  const toggleBtnHab  = document.getElementById("toggleHabitaciones");
  const formContainerHab = document.getElementById("formContainerHab");
  const toggleBtnServ = document.getElementById("toggleServiciosAdicionales");
  const formContainerServ = document.getElementById("formContainerServiciosAdicionales");

  if (toggleBtn && formContainer) {
    toggleBtn.addEventListener("click", () => {
      const yaAbierto = !formContainer.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtn, formContainer);
      } else {
        // Cerrar habitaciones si está abierta
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        expandirSeccion(toggleBtn, formContainer);
        // Anclar el scroll a esta sección para evitar saltos de viewport
        setTimeout(() => scrollConOffset(toggleBtn, 70), 50);
      }
    });
  }

  if (toggleBtnHab && formContainerHab) {
    toggleBtnHab.addEventListener("click", () => {
      const yaAbierto = !formContainerHab.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtnHab, formContainerHab);
      } else {
        // Cerrar crear alojamiento si está abierta
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        expandirSeccion(toggleBtnHab, formContainerHab);
        // Anclar el scroll a esta sección para evitar saltos de viewport
        setTimeout(() => scrollConOffset(toggleBtnHab, 70), 50);
      }
    });
  }

  if (toggleBtnServ && formContainerServ) {
    toggleBtnServ.addEventListener("click", () => {
      const yaAbierto = !formContainerServ.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtnServ, formContainerServ);
      } else {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        expandirSeccion(toggleBtnServ, formContainerServ);
        setTimeout(() => scrollConOffset(toggleBtnServ, 70), 50);
      }
    });
  }

  // Navegación del menú Panel: siempre llevar al inicio/título del card
  const panelLinks = Array.from(document.querySelectorAll('.menu li ul a[href^="#"]'))
    .filter((link) => link.getAttribute("href") !== "#");

  const obtenerObjetivoScroll = (hash) => {
    const id = (hash || "").replace("#", "");
    const destino = document.getElementById(id);
    if (!destino) return null;

    if (destino.tagName && destino.tagName.toLowerCase() === "section") {
      return destino.querySelector("h3, .toggle-btn") || destino;
    }

    const card = destino.closest("section");
    if (card) {
      return card.querySelector("h3, .toggle-btn") || card;
    }

    return destino;
  };

  panelLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;

      event.preventDefault();

      // Abrir/cerrar acordeón según el destino del menú
      if (hash === "#tituloCrear" || hash === "#crear") {
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtn && formContainer) {
          expandirSeccion(toggleBtn, formContainer);
        }
      } else if (hash === "#habitaciones") {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        if (toggleBtnHab && formContainerHab) {
          expandirSeccion(toggleBtnHab, formContainerHab);
        }
      } else if (hash === "#serviciosAdicionales") {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnServ && formContainerServ) {
          expandirSeccion(toggleBtnServ, formContainerServ);
        }
      }

      const objetivo = obtenerObjetivoScroll(hash);
      if (!objetivo) return;

      setTimeout(() => {
        scrollConOffset(objetivo, 70);
        history.replaceState(null, "", hash);
      }, 80);
    });
  });
});

// ======================================
// SELECCIONAR IMAGEN
// ======================================
function seleccionarImagen(alojamientoId) {
  const input = document.getElementById("inputImagen");
  input.dataset.alojamientoId = alojamientoId;
  input.click();
}

// ======================================
// GALERÍA
// ======================================
async function cargarGaleria(alojamientoId) {
  const contenedor = document.getElementById(`galeria-${alojamientoId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/imagenes`, { headers });
    if (!res.ok) throw new Error("No se pudieron cargar las imágenes");

    const imagenes = await res.json();

    contenedor.innerHTML = "";
    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      contenedor.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    // Ordenar principal primero
    imagenes.sort((a, b) => b.principal - a.principal);

    imagenes.forEach(img => {
      const div = document.createElement("div");
      div.classList.add("img-box");
      if (img.principal === 1) div.classList.add("imagen-principal");

      const url = construirUrlImagen(img.ruta);

      // Verificar url no vacía
      if (!url) return;

      div.innerHTML = `
        <img src="${url}" 
             onclick="abrirLightbox('${url}')" 
             style="width:100px; border-radius:8px; margin:5px;"
             onerror="this.src='https://via.placeholder.com/100?text=No+Img';">
        <div class="acciones-img" style="text-align:center; margin-top:5px;">
          <button onclick="eliminarImagen(${img.id}, ${alojamientoId})">🗑️</button>
          <button onclick="hacerPrincipal(${img.id}, ${alojamientoId})">⭐</button>
        </div>
      `;

      contenedor.appendChild(div);
    });
  } catch (error) {
    console.error("Error cargando galería", error);
    contenedor.innerHTML = "<p>Error cargando imágenes</p>";
  }
}

// ======================================
// ELIMINAR IMAGEN
// ======================================
async function eliminarImagen(idImagen, alojamientoId) {
  if (!confirm("¿Eliminar imagen?")) return;
  try {
    const res = await fetch(`${API_URL}/imagenes/${idImagen}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error eliminando imagen");
      return;
    }
    cargarGaleria(alojamientoId);
cargarGaleriaAlojamientos(); // ✅ REFRESCA COLLAGE
  } catch (error) {
    console.error(error);
    alert("Error eliminando imagen");
  }
}

// ======================================
// HACER IMAGEN PRINCIPAL ALOJAMIENTO
// ======================================
async function hacerPrincipal(idImagen, alojamientoId) {

  try {
    const res = await fetch(`${API_URL}/imagenes/${idImagen}/principal`, {
      method: "PUT",
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error asignando imagen principal");
      return;
    }

    // 🔥 RECARGAR GALERÍA DEL ALOJAMIENTO
    await cargarGaleria(alojamientoId);

    // 🔥 🔥 🔥 ESTA ES LA LÍNEA QUE TE FALTABA 🔥 🔥 🔥
    cargarGaleriaAlojamientos();

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// LIGHTBOX
// ======================================
function abrirLightbox(imgOrSrc) {
  if (!imgOrSrc) return;

  let src = typeof imgOrSrc === "string" ? imgOrSrc : imgOrSrc.src;
  let alojamientoId = imgOrSrc.dataset?.alojamiento || null;

  let lightbox = document.getElementById("lightbox");

  // Crear lightbox si no existe
  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.id = "lightbox";
    Object.assign(lightbox.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.9)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      zIndex: "9999",
    });

    const img = document.createElement("img");
    img.id = "lightbox-img";
    Object.assign(img.style, {
      maxWidth: "90%",
      maxHeight: "80%",
      borderRadius: "10px",
      boxShadow: "0 0 20px #000",
      marginBottom: "15px",
    });
    lightbox.appendChild(img);

    const btn = document.createElement("button");
    btn.id = "lightbox-btn";
    btn.textContent = "➡️ Ver alojamiento";
    Object.assign(btn.style, {
      padding: "10px 20px",
      border: "none",
      backgroundColor: "var(--primary)",
      color: "white",
      fontSize: "16px",
      borderRadius: "8px",
      cursor: "pointer",
      display: "none",
    });
    btn.addEventListener("click", () => {
      if (alojamientoId) {
        const card = document.querySelector(`.card-alojamiento[data-id='${alojamientoId}']`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("resaltar");
          setTimeout(() => card.classList.remove("resaltar"), 3000);
        }
      }
      lightbox.style.display = "none";
    });
    lightbox.addEventListener("click", e => {
      if (e.target === lightbox) lightbox.style.display = "none";
    });

    lightbox.appendChild(btn);
    document.body.appendChild(lightbox);
  }

  const imgElement = document.getElementById("lightbox-img");
  if (!imgElement) return;
  imgElement.src = src || "https://via.placeholder.com/300?text=No+Img";

  const btn = document.getElementById("lightbox-btn");
  if (btn) {
    if (alojamientoId) {
      btn.style.display = "inline-block";
      btn.dataset.alojamiento = alojamientoId;
    } else {
      btn.style.display = "none";
    }
  }

  lightbox.style.display = "flex";
}



function abrirLightboxDesdeGaleria(src, alojamientoId) {
  abrirLightbox(src);

  const btn = document.getElementById("lightbox-btn");

  if (btn) {
    btn.style.display = "inline-block";
    btn.textContent = "➡️ Ir alojamiento";

    btn.onclick = () => {
      const card = document.querySelector(`.card-item[data-id='${alojamientoId}']`);

      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });

        card.classList.add("resaltar");

        setTimeout(() => {
          card.classList.remove("resaltar");
        }, 3000);
      }

      document.getElementById("lightbox").style.display = "none";
    };
  }
}


// ======================================
// CERRAR SESIÓN
// ======================================
function cerrarSesion() {
  localStorage.clear();
  window.location.href = "../index.html";
}

// ======================================
// HABITACIONES
// ======================================
async function crearHabitacion() {
  const alojamientoId = document.getElementById("hab_alojamientoId").value;
  const nombre = document.getElementById("hab_nombre").value.trim();
  const capacidad = document.getElementById("hab_capacidad").value;
  const precio = document.getElementById("hab_precio").value;

  if (!alojamientoId || !nombre || !capacidad || !precio) {
    alert("Todos los campos son obligatorios");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/habitaciones/${alojamientoId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nombre, capacidad, precio })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error creando habitación");
      return;
    }
    alert("Habitación creada correctamente");
    cargarHabitaciones();
    cargarAlojamientos();
    const _fh = document.getElementById("formContainerHab");
    const _th = document.getElementById("toggleHabitaciones");
    if (_fh && _th) colapsarSeccion(_th, _fh);

    document.getElementById("hab_nombre").value = "";
    document.getElementById("hab_capacidad").value = "";
    document.getElementById("hab_precio").value = "";
  } catch (error) {
    console.error(error);
    alert("Error de conexión");
  }
}

async function cargarHabitaciones() {
  const alojamientoId = document.getElementById("buscarAlojamiento").value;
  if (!alojamientoId) {
    alert("Ingresa el ID del alojamiento");
    return;
  }
  if (misAlojamientosIds.size && !misAlojamientosIds.has(Number(alojamientoId))) {
    alert("Ese alojamiento no pertenece a tu cuenta de anfitrión.");
    return;
  }
  try {
    actualizarGraficaOcupacion(alojamientoId);
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    const contenedor = document.getElementById("listaHabitaciones");
    contenedor.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>No hay habitaciones</p>";
      return;
    }

    data.forEach(hab => {
      const div = document.createElement("div");
      div.classList.add("card-item");
      const estadoActual = hab.estado || "disponible";
      const estadoColor = estadoActual === "mantenimiento" ? "#ff9800" : (estadoActual === "ocupada" ? "#f44336" : "#4caf50");
      const isDisponible = estadoActual === "disponible";
      const isOcupada = estadoActual === "ocupada";
      const isMantenimiento = estadoActual === "mantenimiento";
      const chipStyle = (activo, color) => `border:1px solid ${color}; background:${activo ? color : 'transparent'}; color:${activo ? '#fff' : color};`;
      div.innerHTML = `
  <h4>${hab.nombre}</h4>
  <p>👥 ${hab.capacidad}</p>
  <p>💰 $${hab.precio}</p>
  <p><strong>Estado:</strong> <span style="color:${estadoColor}; text-transform: capitalize;">${estadoActual}</span></p>
  

  <div class="galeria" id="galeria-hab-${hab.id}"></div>

  <div class="botones-habitacion" style="margin-bottom:8px;">
    <button style="${chipStyle(isDisponible, '#4caf50')}" onclick="actualizarEstadoHabitacion(${hab.id}, 'disponible')">🟢 Disponible</button>
    <button style="${chipStyle(isOcupada, '#f44336')}" disabled title="Este estado se calcula automáticamente por reservas activas">🔴 No disponible</button>
    <button style="${chipStyle(isMantenimiento, '#ff9800')}${isOcupada ? ' opacity:0.5; cursor:not-allowed;' : ''}" ${isOcupada ? `onclick="alert('⚠️ No puedes poner en mantenimiento esta habitación porque actualmente se encuentra ocupada. Espera a que la reserva finalice.')"` : `onclick="actualizarEstadoHabitacion(${hab.id}, 'mantenimiento')"`}>🛠 Mantenimiento</button>
    <button onclick="toggleResumenReservaHabitacion(${hab.id})">📄 Ver info huésped</button>
  </div>

  <div id="reserva-hab-${hab.id}" style="display:none; margin-bottom: 10px; padding: 8px; border: 1px dashed #ccc; border-radius: 8px; background: #fff;"></div>

  <div class="botones-habitacion">
    <button onclick="verServiciosHabitacion(${hab.id})">👁 Ver servicios</button>
    <button onclick="asignarServicio(${hab.id}, ${alojamientoId})">➕ Asignar servicio</button>
   <button onclick="eliminarServicioMultiple(${hab.id})">❌ Eliminar servicio</button>
    <button onclick="seleccionarImagenHabitacion(${hab.id})">📸 Agregar fotos</button>
    <button onclick="abrirCamaraHabitacion(${hab.id})">📷 Usar cámara</button>
    <button onclick="eliminarHabitacion(${hab.id})">🗑️ Eliminar habitación</button>
  </div>
`;
      contenedor.appendChild(div);
      cargarGaleriaHabitacion(hab.id);
    });
  } catch (error) {
    console.error(error);
    alert("Error cargando habitaciones");
  }
}

async function actualizarEstadoHabitacion(habitacionId, estado) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/estado`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ estado })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo actualizar el estado de la habitación");
      return;
    }
    await cargarHabitaciones();
    await cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("Error de conexión actualizando estado");
  }
}

async function toggleResumenReservaHabitacion(habitacionId) {
  const contenedor = document.getElementById(`reserva-hab-${habitacionId}`);
  if (!contenedor) return;

  if (contenedor.style.display === "block") {
    contenedor.style.display = "none";
    return;
  }

  try {
    const alojamientoId = document.getElementById("buscarAlojamiento").value;
    const res = await fetch(`${API_URL}/reservas/alojamiento/${alojamientoId}`, { headers });
    const reservas = await res.json();
    if (!res.ok) {
      alert(reservas.error || "No se pudo consultar la información de reservas.");
      return;
    }

    const reserva = Array.isArray(reservas)
      ? reservas.find(r => Number(r.id_habitacion) === Number(habitacionId))
      : null;

    if (!reserva) {
      contenedor.innerHTML = "<p>No hay información de huésped registrada para esta habitación.</p>";
      contenedor.style.display = "block";
      return;
    }

    const inicio = reserva.fecha_entrada ? new Date(`${reserva.fecha_entrada}T00:00:00`) : null;
    const fin = reserva.fecha_salida ? new Date(`${reserva.fecha_salida}T00:00:00`) : null;
    const noches = Number(reserva.noches || (inicio && fin ? Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) : 0));
    const subtotalHospedaje = Number(reserva.subtotal_hospedaje || 0);
    const subtotalServicios = Number(reserva.subtotal_servicios || 0);
    const total = Number(reserva.precio_total || 0);

    let serviciosTexto = "No seleccionó servicios adicionales.";
    if (reserva.detalle_servicios_json) {
      try {
        const lista = JSON.parse(reserva.detalle_servicios_json);
        if (Array.isArray(lista) && lista.length) {
          serviciosTexto = lista
            .map((s) => `${s.nombre || 'Servicio'} ($${Number(s.valor || 0).toLocaleString('es-CO')})`)
            .join(", ");
        }
      } catch (e) {
        console.warn("No se pudo parsear detalle_servicios_json", e);
      }
    }

    contenedor.innerHTML = `
      <p><strong>Reserva #:</strong> ${reserva.id}</p>
      <p><strong>Referencia pago:</strong> ${reserva.referencia_pago || "-"}</p>
      <p><strong>Alojamiento:</strong> ID ${alojamientoId}</p>
      <p><strong>Habitación:</strong> ${reserva.habitacion || "-"}</p>
      <p><strong>Huésped:</strong> ${reserva.titular_nombre || "No registrado"}</p>
      <p><strong>Documento:</strong> ${(reserva.titular_documento_tipo || "") + " " + (reserva.titular_documento_numero || "")}</p>
      <p><strong>Correo:</strong> ${reserva.titular_correo || "No registrado"}</p>
      <p><strong>Teléfono:</strong> ${reserva.titular_telefono || "No registrado"}</p>
      <p><strong>Fecha inicio:</strong> ${reserva.fecha_entrada || "-"}</p>
      <p><strong>Fecha fin:</strong> ${reserva.fecha_salida || "-"}</p>
      <p><strong>Noches seleccionadas:</strong> ${noches > 0 ? noches : "-"}</p>
      <p><strong>Valor por estadía:</strong> $${subtotalHospedaje.toLocaleString("es-CO")}</p>
      <p><strong>Servicios adicionales:</strong> ${serviciosTexto}</p>
      <p><strong>Total servicios:</strong> $${subtotalServicios.toLocaleString("es-CO")}</p>
      <p><strong>Total acumulado:</strong> $${total.toLocaleString("es-CO")}</p>
      <p><strong>Estado:</strong> ${reserva.estado || "-"}</p>
    `;
    contenedor.style.display = "block";
  } catch (error) {
    console.error(error);
    alert("Error consultando el detalle de reserva.");
  }
}

async function gestionarReservasAlojamiento(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/reservas/alojamiento/${alojamientoId}`, { headers });
    const reservas = await res.json();
    if (!res.ok) {
      alert(reservas.error || "No se pudieron cargar reservas del alojamiento.");
      return;
    }

    const activas = (reservas || []).filter(r => ["pendiente", "confirmada", "en_curso"].includes(r.estado));
    if (!activas.length) {
      alert("No hay reservas activas para gestionar en este alojamiento.");
      return;
    }

    const lista = activas.map(r => `#${r.id} | Hab: ${r.habitacion} | ${r.fecha_entrada} a ${r.fecha_salida} | ${r.titular_nombre || r.titular_correo || 'Sin titular'}`).join("\n");
    const idReserva = prompt(`Reservas activas:\n\n${lista}\n\nEscribe el ID de la reserva a cancelar/liberar:`);
    if (!idReserva) return;

    const motivo = prompt("Motivo de cancelación (obligatorio):");
    if (!motivo || !motivo.trim()) {
      alert("El motivo es obligatorio.");
      return;
    }

    const porcentajeRaw = prompt("Porcentaje de reembolso (0 a 100):", "100");
    const porcentaje = Number(porcentajeRaw);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      alert("Porcentaje inválido.");
      return;
    }

    await cancelarReservaComoAnfitrion(idReserva, motivo, porcentaje);
  } catch (error) {
    console.error(error);
    alert("Error gestionando reservas del alojamiento.");
  }
}

async function cancelarReservaComoAnfitrion(idReserva, motivo, porcentajeReembolso) {
  try {
    const res = await fetch(`${API_URL}/reservas/${idReserva}/cancelar-anfitrion`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ motivo, porcentajeReembolso })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo cancelar la reserva.");
      return;
    }
    alert(`Reserva cancelada. Reembolso definido: ${porcentajeReembolso}%`);
    await cargarHabitaciones();
    await cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("Error de conexión al cancelar reserva.");
  }
}

// ======================================
// CHATBOT CANCELACIONES - ANFITRION
// ======================================
async function cargarSolicitudesCancelacionAnfitrion() {
  const contenedor = document.getElementById("listaCancelacionesPendientes");
  if (!contenedor) return;

  contenedor.innerHTML = "<p>Cargando solicitudes...</p>";

  try {
    const res = await fetch(`${API_URL}/cancelaciones/pendientes-anfitrion`, { headers });
    const data = await res.json();

    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.mensaje || data.error || "No se pudieron cargar solicitudes."}</p>`;
      return;
    }

    const solicitudes = Array.isArray(data.cancelaciones) ? data.cancelaciones : [];
    if (!solicitudes.length) {
      contenedor.innerHTML = "<p>No hay solicitudes de cancelacion pendientes.</p>";
      return;
    }

    contenedor.innerHTML = "";

    solicitudes.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card-item cancelacion-item";

      card.innerHTML = `
        <h4>Solicitud #${item.cancelacion_id} - Reserva #${item.reserva_id}</h4>
        <p><strong>Alojamiento:</strong> ${item.alojamiento_titulo || "-"}</p>
        <p><strong>Habitacion:</strong> ${item.habitacion_nombre || "-"}</p>
        <p><strong>Turista:</strong> ${item.turista_nombre || "-"} (${item.email_turista || "sin correo"})</p>
        <p><strong>Fechas:</strong> ${item.fecha_entrada || "-"} a ${item.fecha_salida || "-"}</p>
        <p><strong>Total reserva:</strong> $${Number(item.precio_total || 0).toLocaleString("es-CO")}</p>
        <p><strong>Motivo turista:</strong> ${item.motivo || "-"}</p>

        <div class="fila">
          <div>
            <label for="pct-${item.cancelacion_id}">Porcentaje devolucion (0-100)</label>
            <input id="pct-${item.cancelacion_id}" type="number" min="0" max="100" value="100" />
          </div>
          <div>
            <label for="motivo-${item.cancelacion_id}">Motivo descuento / observacion</label>
            <textarea id="motivo-${item.cancelacion_id}" placeholder="Ej: politicas, no-show parcial, gastos administrativos"></textarea>
          </div>
        </div>

        <div class="acciones">
          <button onclick="aplicarRefundCancelacion(${item.cancelacion_id})">✅ Confirmar cancelacion y notificar</button>
        </div>
      `;

      contenedor.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error de conexion cargando solicitudes.</p>";
  }
}

async function aplicarRefundCancelacion(cancelacionId) {
  const pctInput = document.getElementById(`pct-${cancelacionId}`);
  const motivoInput = document.getElementById(`motivo-${cancelacionId}`);

  const porcentaje = Number(pctInput?.value ?? 100);
  const motivo = String(motivoInput?.value || "").trim() || "Sin observaciones";

  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    alert("El porcentaje de devolucion debe estar entre 0 y 100.");
    return;
  }

  if (!confirm(`Se confirmara la cancelacion con ${porcentaje}% de devolucion. Continuar?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/cancelaciones/aplicar-refund`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cancelacion_id: cancelacionId,
        porcentaje_devolucion: porcentaje,
        motivo_descuento: motivo
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.mensaje || data.error || "No se pudo confirmar la cancelacion.");
      return;
    }

    alert(data.mensaje || "Cancelacion confirmada correctamente.");
    await cargarSolicitudesCancelacionAnfitrion();
    await cargarAlojamientos();
    await cargarHabitaciones();
  } catch (error) {
    console.error(error);
    alert("Error de conexion al confirmar cancelacion.");
  }
}

// ======================================
// ELIMINAR HABITACIÓN
// ======================================
async function eliminarHabitacion(habitacionId) {
  if (!confirm("¿Seguro que quieres eliminar esta habitación?")) return;
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error eliminando habitación");
      return;
    }
    alert("🗑️ Habitación eliminada correctamente");
    cargarHabitaciones();
    cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("Error de conexión");
  }
}

// ======================================
// ASIGNAR SERVICIO A HABITACIÓN
// ======================================
// ======================================
// ASIGNAR SERVICIOS (MULTI SELECCIÓN)
// ======================================

let habitacionServicioActual = null; // VARIABLE GLOBAL
let modoEliminandoServicios = false; // variable compartida para el flujo de eliminación

async function asignarServicio(habitacionId) {
  habitacionServicioActual = habitacionId;

  try {
    // Obtener todos los servicios disponibles
    // ===============================
// 1️⃣ Obtener datos de la habitación
// ===============================
async function asignarServicio(habitacionId, alojamientoId) {
  habitacionServicioActual = habitacionId;

  try {
    // 🔥 USAR DIRECTAMENTE el alojamientoId (SIN fetch)
    


const res = await fetch(
  `${API_URL}/alojamientos/${alojamientoId}/servicios`,
  { headers }
);

const servicios = await res.json();


    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("No hay servicios disponibles");
      return;
    }

    const resHab = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const actuales = await resHab.json();
    const actualesIds = actuales.map(s => s.id);

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    document.getElementById("modalServicios").style.display = "flex";

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios");
  }
}


// ===============================
// 2️⃣ Obtener TODOS los servicios del sistema
// ===============================
const res = await fetch(
  `${API_URL}/services`,
  { headers }
);

const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("No hay servicios disponibles");
      return;
    }

    // Obtener los servicios actuales de la habitación
    const resHab = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const actuales = await resHab.json();
    const actualesIds = actuales.map(s => s.id);

    // Limpiar y crear checkboxes
    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    // Abrir modal
    document.getElementById("modalServicios").style.display = "flex";

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios");
  }
}

// ======================================
// ELIMINAR SERVICIO DE HABITACIÓN
// ======================================
async function eliminarServicioPrompt(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Esta habitación no tiene servicios");
      return;
    }

    let lista = "";
    servicios.forEach((s, index) => lista += `${index + 1} - ${s.nombre}\n`);

    const servicioSeleccion = prompt("Servicios actuales:\n\n" + lista + "\nIngrese el número del servicio a eliminar:");
    if (!servicioSeleccion) return;

    const index = Number(servicioSeleccion) - 1;
    if (index < 0 || index >= servicios.length) {
      alert("⚠️ Número de servicio inválido");
      return;
    }

    const servicioId = servicios[index].id;
    const resDelete = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios/${servicioId}`, { method: "DELETE", headers });
    const data = await resDelete.json();
    if (!resDelete.ok) {
      alert(data.error || "❌ Error eliminando servicio");
      return;
    }
    alert("🗑️ Servicio eliminado correctamente");
    cargarHabitaciones();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}

// ======================================
// CÁMARA PRO
// ======================================
let streamCamara = null;

async function abrirCamaraPro(alojamientoId) {
  window.alojamientoActual = alojamientoId;
  window.tipoSubida = "alojamiento";
  const modal = document.getElementById("camaraModal");
  const video = document.getElementById("videoCamara");
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = streamCamara;
    video.onloadedmetadata = () => video.play();
    modal.style.display = "flex";
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo acceder a la cámara");
  }
}

function tomarFoto() {
  const video = document.getElementById("videoCamara");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  canvas.toBlob(async blob => {
    if (!blob) return;
    cerrarCamara();
    const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
    mostrarPreview(file);
    await subirImagenCamara(file);
  }, "image/jpeg");
}

function mostrarPreview(file) {
  const previewContainer = document.getElementById("previewContainer");
  if (!previewContainer) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.createElement("img");
    img.src = e.target.result;
    img.style.width = "120px";
    previewContainer.appendChild(img);
  };
  reader.readAsDataURL(file);
}



function cerrarCamara() {
  if (streamCamara) {
    streamCamara.getTracks().forEach(track => track.stop());
    streamCamara = null;
  }

  const modal = document.getElementById("camaraModal");
  if (modal) modal.style.display = "none";
}




async function subirImagenCamara(file) {
  const formData = new FormData();
  formData.append("imagenes", file);

  let url = "";

  if (window.tipoSubida === "habitacion") {
    url = `${API_URL}/habitaciones/${window.habitacionActual}/imagenes`;
  } else {
    url = `${API_URL}/alojamientos/${window.alojamientoActual}/imagenes`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData
  });

  if (!res.ok) {
    alert("❌ Error subiendo imagen desde cámara");
    return;
  }

  // ✅ REFRESCAR BIEN
  if (window.tipoSubida === "habitacion") {
    await cargarGaleriaHabitacion(window.habitacionActual);
  } else {
    await cargarGaleria(window.alojamientoActual);
    await cargarGaleriaAlojamientos(); // 🔥 IMPORTANTE
  }
}

// ======================================
// CONTAR HABITACIONES POR ALOJAMIENTO
// ======================================
async function obtenerCantidadHabitaciones(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    if (!Array.isArray(data)) return 0;
    return data.length;
  } catch (error) {
    console.error("Error obteniendo habitaciones", error);
    return 0;
  }
}

// ======================================
// RESUMEN DE HABITACIONES
// ======================================
async function obtenerResumenHabitaciones(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    if (!Array.isArray(data)) {
      return { total: 0, disponibles: 0, ocupadas: 0, mantenimiento: 0 };
    }
    let disponibles = 0;
    let ocupadas = 0;
    let mantenimiento = 0;
    data.forEach(hab => {
      if (hab.estado === "ocupada") {
        ocupadas++;
      } else if (hab.estado === "mantenimiento") {
        mantenimiento++;
      } else {
        disponibles++;
      }
    });
    return { total: data.length, disponibles, ocupadas, mantenimiento };
  } catch (error) {
    console.error("Error obteniendo resumen", error);
    return { total: 0, disponibles: 0, ocupadas: 0, mantenimiento: 0 };
  }
}

// ======================================
// CREAR SERVICIO PARA UN ALOJAMIENTO
// ======================================


// ======================================
// BOTÓN PARA CREAR SERVICIO
// ======================================
// ======================================
// VER SERVICIOS DE UNA HABITACIÓN
// ======================================
async function verServiciosHabitacion(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("❌ Esta habitación no tiene servicios asignados");
      return;
    }

    let lista = "🛎️ Servicios de la habitación:\n\n";
    servicios.forEach((s, i) => { lista += `${i + 1}. ${s.nombre}\n`; });
    alert(lista);
  } catch (error) {
    console.error(error);
    alert("Error obteniendo servicios");
  }
}

// ======================================
// SELECCIONAR IMAGEN HABITACIÓN
// ======================================
function seleccionarImagenHabitacion(habitacionId) {
  const input = document.getElementById("inputImagen");

  input.dataset.habitacionId = habitacionId;
  input.dataset.tipo = "habitacion";

  // 🔥 LIMPIAR alojamiento
  delete input.dataset.alojamientoId;

  input.click();
}
// ======================================
// CÁMARA HABITACIÓN
// ======================================
async function abrirCamaraHabitacion(habitacionId) {
  window.habitacionActual = habitacionId;
  window.tipoSubida = "habitacion";
  const modal = document.getElementById("camaraModal");
  const video = document.getElementById("videoCamara");
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = streamCamara;
    video.play();
    modal.style.display = "flex";
  } catch (error) {
    alert("No se pudo acceder a la cámara");
  }
}

// ======================================
// GALERÍA HABITACIÓN
// ======================================
async function cargarGaleriaHabitacion(habitacionId) {
  const contenedor = document.getElementById(`galeria-hab-${habitacionId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/imagenes`, { headers });
    const imagenes = await res.json();

    contenedor.innerHTML = "";

    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      contenedor.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    // 🔥 ORDENAR: principal primero
    imagenes.sort((a, b) => b.principal - a.principal);

    imagenes.forEach(img => {
      const url = construirUrlImagen(img.ruta);

      const div = document.createElement("div");
      div.classList.add("img-box");

      div.innerHTML = `
  <img src="${url}" onclick="abrirLightbox('${url}')"
    ${img.principal ? 'style="border: 3px solid gold;"' : ''}>
  
  <div class="acciones-img">
    <button onclick="eliminarImagenHabitacion(${img.id}, ${habitacionId})">🗑️</button>
    <button onclick="hacerPrincipalHabitacion(${img.id}, ${habitacionId})">⭐</button>
  </div>
`;

      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error cargando imágenes</p>";
  }
}


// ======================================
// ELIMINAR IMAGEN HABITACIÓN
// ======================================
async function eliminarImagenHabitacion(idImagen, habitacionId) {
  if (!confirm("¿Eliminar imagen?")) return;
  await fetch(`${API_URL}/imagenes/${idImagen}`, { method: "DELETE", headers });
  cargarGaleriaHabitacion(habitacionId);
}

// ======================================
// HACER IMAGEN PRINCIPAL HABITACIÓN
// ======================================
async function hacerPrincipalHabitacion(idImagen, habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/imagenes/${idImagen}/principal`, {
      method: "PUT",
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error");
      return;
    }

    cargarGaleriaHabitacion(habitacionId);

  } catch (error) {
    console.error(error);
  }
}





// ======================================
// GALERIA ALOJAMIENTOS PRINCIPALES
// ======================================

async function cargarGaleriaAlojamientos() {

  const contenedor = document.querySelector(".collage");
  if (!contenedor) return;

  try {
    // 🔥 1. TRAER SOLO ALOJAMIENTOS DEL ANFITRION
    const resAlojamientos = await fetch(`${API_URL}/anfitrion/alojamientos`, { headers });
    const alojamientos = await resAlojamientos.json();
    if (manejarSesionExpirada(resAlojamientos)) return;

    contenedor.innerHTML = "<h3>🖼️ Galería de Alojamientos</h3>";

    if (!resAlojamientos.ok || !Array.isArray(alojamientos)) {
      contenedor.innerHTML += `<p>${alojamientos?.error || "No se pudo cargar la galeria."}</p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "grid-galeria";

    // 🔥 2. RECORRER CADA ALOJAMIENTO
    for (const alojamiento of alojamientos) {

      // 🔥 3. TRAER SUS IMÁGENES
      const resImgs = await fetch(`${API_URL}/alojamientos/${alojamiento.id}/imagenes`, { headers });
      const imagenes = await resImgs.json();

      if (!Array.isArray(imagenes) || imagenes.length === 0) continue;

      // 🔥 4. BUSCAR PRINCIPAL
      let imagenPrincipal = null;

// 🔥 1. SI SOLO HAY UNA IMAGEN → ES PRINCIPAL AUTOMÁTICAMENTE
if (imagenes.length === 1) {
  imagenPrincipal = imagenes[0];
}

// 🔥 2. SI HAY VARIAS → BUSCAR LA PRINCIPAL
else {
  imagenPrincipal = imagenes.find(img => img.principal === 1);

  // 🔥 SI NO HAY PRINCIPAL → USAR LA PRIMERA
  if (!imagenPrincipal) {
    imagenPrincipal = imagenes[0];
  }
}

      // 🔥 LIMPIAR RUTA
      const url = construirUrlImagen(imagenPrincipal.ruta);

      // 🔥 CREAR CARD
      const card = document.createElement("div");
      card.className = "card-alojamiento";

      card.innerHTML = `
  <img src="${url}" 
       onclick="abrirLightboxDesdeGaleria('${url}', ${alojamiento.id})">

  <div class="card-info">
    ${alojamiento.titulo}
  </div>
`;

      grid.appendChild(card);
    }

    contenedor.appendChild(grid);

  } catch (error) {
    console.error("Error cargando galería", error);
  }
}


// ===============================
// GALERÍA DE ALOJAMIENTOS
// ===============================
document.addEventListener('DOMContentLoaded', () => {

  async function cargarGaleriaPublica() {
    const grid = document.getElementById('galeria-alojamientos'); // ID correcto
    if (!grid) return console.error('No se encontró el contenedor de la galería');

    grid.innerHTML = ''; // limpiar galería

    try {
      // 1. Traer solo alojamientos del anfitrión
      const alojamientosRes = await fetch(`${API_URL}/anfitrion/alojamientos`, { headers });
      const alojamientos = await alojamientosRes.json();
      if (manejarSesionExpirada(alojamientosRes)) return;

      if (!alojamientosRes.ok || !Array.isArray(alojamientos)) {
        grid.innerHTML = `<p>${alojamientos?.error || 'No se pudieron cargar alojamientos.'}</p>`;
        return;
      }

      // 2. Por cada alojamiento, traer sus imágenes
      for (const alojamiento of alojamientos) {
        const res = await fetch(`${API_URL}/imagenes/alojamientos/${alojamiento.id}/imagenes`, { headers });
        const imagenes = await res.json();

        if (imagenes.length > 0) {
          const card = document.createElement('div');
          card.className = 'card-alojamiento';

          const rutaPublica = normalizarRutaImagen(imagenes[0].ruta);

          const img = document.createElement('img');
          img.src = construirUrlImagen(rutaPublica);
          img.alt = alojamiento.nombre;
          img.onclick = () => abrirLightbox(construirUrlImagen(rutaPublica));

          const info = document.createElement('div');
          info.className = 'card-info';
          info.textContent = alojamiento.nombre;

          card.appendChild(img);
          card.appendChild(info);
          grid.appendChild(card);
        }
      }

    } catch (error) {
      console.error('Error cargando galería:', error);
    }
  }

  cargarGaleriaPublica();

  

  // 🔄 Si deseas actualizar automáticamente cada cierto tiempo (opcional)
  // setInterval(cargarGaleria, 5000); // actualiza cada 5 segundos
});



function cerrarModalServicios() {
  const modal = document.getElementById("modalServicios");
  if (modal) modal.style.display = "none";
}


function cerrarModalServicios() {
  document.getElementById("modalServicios").style.display = "none";
}

// ======================================
// SERVICIOS ADICIONALES CON VALOR
// ======================================
async function guardarServicioAdicional() {
  const idAlojamiento = Number(document.getElementById("sa_alojamientoId")?.value || 0);
  const nombre = (document.getElementById("sa_nombre")?.value || "").trim();
  const categoria = (document.getElementById("sa_categoria")?.value || "").trim();
  const valorRaw = (document.getElementById("sa_valor")?.value || "").trim();

  if (!idAlojamiento || !nombre) {
    alert("⚠️ Debes ingresar ID del alojamiento y nombre del servicio.");
    return;
  }

  const valor = valorRaw === "" ? null : Number(valorRaw);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    alert("⚠️ El valor del servicio debe ser un número válido mayor o igual a 0.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${idAlojamiento}/servicios-adicionales`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        nombre,
        categoria,
        valor
      })
    });

    if (manejarSesionExpirada(res)) {
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ No se pudo guardar el servicio adicional.");
      return;
    }

    alert("✅ Servicio adicional guardado correctamente.");
    document.getElementById("sa_nombre").value = "";
    document.getElementById("sa_valor").value = "";
    if (document.getElementById("sa_buscarAlojamiento")) {
      document.getElementById("sa_buscarAlojamiento").value = idAlojamiento;
    }
    await cargarServiciosAdicionales(idAlojamiento);
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión guardando servicio adicional.");
  }
}

async function cargarServiciosAdicionales(idManual = null) {
  const idAlojamiento = Number(
    idManual ||
    document.getElementById("sa_buscarAlojamiento")?.value ||
    document.getElementById("sa_alojamientoId")?.value ||
    0
  );

  const contenedor = document.getElementById("sa_lista");
  if (!contenedor) return;

  if (!idAlojamiento) {
    contenedor.innerHTML = "<p>Ingresa un ID de alojamiento para cargar los servicios adicionales.</p>";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${idAlojamiento}/servicios-adicionales`, { headers });

    if (manejarSesionExpirada(res)) {
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.error || "No fue posible cargar servicios."}</p>`;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>Este alojamiento aún no tiene servicios adicionales.</p>";
      return;
    }

    contenedor.innerHTML = data.map((item) => {
      const valor = item.valor_adicional === null || item.valor_adicional === undefined
        ? "Valor a consultar"
        : `$${Number(item.valor_adicional).toLocaleString("es-CO")}`;

      return `
        <div class="card-item">
          <h4>${item.nombre}</h4>
          <p>📂 ${item.categoria || "General"}</p>
          <p>💰 ${valor}</p>
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error de conexión al cargar servicios adicionales.</p>";
  }
}








function cerrarModalEliminarServicios() {
  document.getElementById("modalEliminarServicios").style.display = "none";
}

let habitacionEliminarServiciosActual = null;

async function eliminarServicioMultiple(habitacionId) {
  modoEliminandoServicios = true;
  try {
    // Obtener servicios actuales de la habitación
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("Esta habitación no tiene servicios");
      return;
    }

    // Crear contenido de modal
    const modal = document.getElementById("modalServicios");
    modal.style.display = "flex";

    const form = document.getElementById("formServicios");
    form.innerHTML = ""; // limpiar

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.innerHTML = `
        <input type="checkbox" value="${servicio.id}"> ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    // Cambiar texto del botón para eliminar
    const btnGuardar = document.getElementById("btnGuardarServicios");
    btnGuardar.textContent = "Eliminar servicios seleccionados";

    // Listener temporal para eliminar servicios seleccionados
    const handler = async (e) => {
      e.preventDefault();
      const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const idServicio of seleccionados) {
          await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios/${idServicio}`, {
            method: "DELETE",
            headers
          });
        }
        alert("🗑️ Servicios eliminados correctamente");
        cerrarModalServicios();
        cargarHabitaciones();
      } catch (error) {
        console.error(error);
        alert("❌ Error eliminando servicios");
      } finally {
        modoEliminandoServicios = false;
      }

      // Remover listener para evitar duplicados
      btnGuardar.removeEventListener("click", handler);
      btnGuardar.textContent = "Guardar servicios";
    };

    btnGuardar.addEventListener("click", handler);

  } catch (error) {
    console.error(error);
    alert("❌ Error obteniendo servicios");
  }
}







function eliminarServicioGlobal() {
  const select = document.getElementById('servicioSelect');
  
  if (!select) {
    alert('❌ No se encontró el select de servicios.');
    return;
  }

  const servicioId = select.value;
  if (!servicioId) {
    alert('⚠️ Debes seleccionar un servicio para eliminar.');
    return;
  }

  fetch(`/api/servicios/${servicioId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
  })
  .then(res => {
    if (!res.ok) return res.json().then(data => { throw new Error(data.error || 'Error eliminando servicio'); });
    return res.json();
  })
  .then(data => {
    alert(data.mensaje);
    select.value = ''; // reset
  })
  .catch(err => alert('❌ ' + err.message));
}



function eliminarServicioAlojamiento(alojamientoId) {
  const select = document.getElementById(`servicioSelect-${alojamientoId}`);
  if (!select || !select.value) {
    alert('Debes seleccionar un servicio para eliminar');
    return;
  }

  const servicioId = select.value;

  fetch(`/api/alojamientos/${alojamientoId}/servicios/${servicioId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
  })
  .then(res => {
    if (!res.ok) return res.json().then(data => { throw new Error(data.error || 'Error eliminando servicio'); });
    return res.json();
  })
  .then(data => {
    alert(data.mensaje);
    select.value = ''; // resetear
  })
  .catch(err => alert(err.message));
}













async function visualizarServicios(idAlojamiento) {

  try {

    const token = localStorage.getItem("token");

    const res = await fetch(
      `${API_URL}/alojamientos/${idAlojamiento}/servicios`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      alert("❌ Error obteniendo servicios");
      return;
    }

    const servicios = await res.json();

    if (!servicios.length) {
      alert("ℹ️ Este alojamiento no tiene servicios.");
      return;
    }

    // mostrar servicios
    const lista = servicios
      .map(s => `• ${s.nombre}`)
      .join("\n");

    alert(`Servicios del alojamiento:\n\n${lista}`);

  } catch (error) {
    console.error(error);
    alert("❌ Error cargando servicios");
  }
}




// ======================================
// VER SERVICIOS DE UN ALOJAMIENTO
// ======================================
async function visualizarServicios(alojamientoId) {
  try {

    const res = await fetch(
      `${API_URL}/alojamientos/${alojamientoId}/servicios`,
      { headers }
    );

    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Este alojamiento no tiene servicios.");
      return;
    }

    let lista = "🛎️ Servicios del alojamiento:\n\n";

    servicios.forEach((s, i) => {
      lista += `${i + 1}. ${s.nombre}\n`;
    });

    alert(lista);

  } catch (error) {
    console.error(error);
    alert("❌ Error cargando servicios");
  }
}




// ======================================
// ELIMINAR SERVICIOS DE UN ALOJAMIENTO
// ======================================

let alojamientoEliminarServiciosActual = null;

async function eliminarServicioGlobal(alojamientoId) {
  if (!alojamientoId) return alert("❌ No se recibió el ID del alojamiento");

  try {
    // Guardar el alojamiento actual
    alojamientoEliminarServiciosActual = alojamientoId;

    // Obtener servicios del alojamiento
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Este alojamiento no tiene servicios");
      return;
    }

    // Limpiar modal
    const modal = document.getElementById("modalServicios");
    modal.style.display = "flex";

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    // Crear checkboxes para todos los servicios
    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.innerHTML = `<input type="checkbox" value="${servicio.id}"> ${servicio.nombre}`;
      form.appendChild(label);
    });

    // Cambiar texto del botón
    const btnGuardar = document.getElementById("btnGuardarServicios");
    btnGuardar.textContent = "Eliminar servicios seleccionados";

    // Remover listeners antiguos
    const oldBtn = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(oldBtn, btnGuardar);

    // Listener para eliminar los seleccionados
    oldBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  // 🔥 CERRAR MODAL INMEDIATAMENTE
  cerrarModalServicios();

  const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const servicioId of seleccionados) {
          const resDelete = await fetch(`${API_URL}/alojamientos/${alojamientoEliminarServiciosActual}/servicios/${servicioId}`, {
            method: "DELETE",
            headers
          });
          const data = await resDelete.json();
          if (!resDelete.ok) {
            alert(data.error || "❌ Error eliminando servicio");
          }
        }

        alert("🗑️ Servicios eliminados correctamente");
        cerrarModalServicios();
        cargarAlojamientos(); // refresca la lista

      } catch (error) {
        console.error(error);
        alert("Error eliminando servicios");
      }
    });

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios del alojamiento");
  }
}




async function crearServicio(alojamientoId) {

  const nombre = prompt("Ingresa el nombre del nuevo servicio:");
  if (!nombre || !nombre.trim()) {
    alert("⚠️ Operación cancelada: ingresa un nombre válido");
    return;
  }

  const nombreLimpio = nombre.trim(); // mantenemos mayúsculas mínimas para mostrar

  try {

    const res = await fetch(`${API_URL}/services/${alojamientoId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nombre: nombreLimpio })
    });

    const data = await res.json();

    if (res.ok) {
      if (data.mensaje && data.mensaje.toLowerCase().includes('ya se encuentra incluido')) {
        alert('⚠️ este servico ya se encuentra incluido en este alojamiento');
        return;
      }
      alert("✅ Servicio creado/ligado al alojamiento correctamente");
      cargarAlojamientos();
      return;
    }

    if (data.error && (data.error.toLowerCase().includes('ya existe') || data.error.toLowerCase().includes('ya se encuentra incluido'))) {
      alert('⚠️ este servico ya se encuentra incluido en este alojamiento');
      return;
    }

    throw new Error(data.error || "Error agregando servicio");

  } catch (error) {
    console.error(error);
    alert(error.message || "❌ Error de conexión");
  }
}






async function asignarServicioAlojamiento(alojamientoId) {

  try {

    const resServicios = await fetch(`${API_URL}/services`, { headers });
    const servicios = await resServicios.json();

    const resActuales = await fetch(
      `${API_URL}/alojamientos/${alojamientoId}/servicios`,
      { headers }
    );

    const actuales = await resActuales.json();
    const actualesIds = actuales.map(s => s.id);

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    document.getElementById("modalServicios").style.display = "flex";

    const btn = document.getElementById("btnGuardarServicios");

    const nuevoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevoBtn, btn);

    nuevoBtn.addEventListener("click", async (e) => {

      e.preventDefault();

      const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      for (const idServicio of seleccionados) {
        await fetch(
          `${API_URL}/alojamientos/${alojamientoId}/servicios`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ id_servicio: idServicio })
          }
        );
      }

      alert("✅ Servicios actualizados");

      cerrarModalServicios();

    });

  } catch (error) {
    console.error(error);
  }
}





let alojamientoServicioActual = null;

function abrirModalServicio(alojamientoId) {
  alojamientoServicioActual = alojamientoId;

  document.getElementById("modalNuevoServicio").style.display = "flex";
  document.getElementById("inputNuevoServicio").value = "";
}

function cerrarModalNuevoServicio() {
  document.getElementById("modalNuevoServicio").style.display = "none";
}

// ======================================
// GEOLOCALIZACIÓN OPCIONAL
// ======================================
async function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    alert('La geolocalización requiere HTTPS o localhost.');
    return;
  }

  const renderAviso = (texto, color = '#007b8a') => {
    let aviso = document.getElementById('avisoUbicacion');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'avisoUbicacion';
      aviso.style.fontSize = '0.9rem';
      const formContainer = document.getElementById('formContainer');
      if (formContainer) formContainer.appendChild(aviso);
    }
    if (aviso) {
      aviso.style.color = color;
      aviso.innerHTML = texto;
    }
  };

  const onSuccess = (position) => {
    const { latitude, longitude } = position.coords;
    const linkCompartir = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const gpsInput = document.getElementById('gpsUbicacion');
    if (gpsInput) gpsInput.value = linkCompartir;

    renderAviso(`📍 Ubicación GPS cargada. <a href="${linkCompartir}" target="_blank">Abrir en Google Maps</a>`);
  };

  const optionsEstandar = { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 };
  const optionsAltaPrecision = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

  const usarFallbackIP = async () => {
    renderAviso('No se pudo usar GPS. Intentando ubicación aproximada por red...', '#b36b00');

    const proveedores = [
      async () => {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('ipapi no disponible');
        const data = await res.json();
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      },
      async () => {
        const res = await fetch('https://ipwho.is/');
        if (!res.ok) throw new Error('ipwho no disponible');
        const data = await res.json();
        if (data.success === false) throw new Error('ipwho sin resultado');
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      },
      async () => {
        const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
        if (!res.ok) throw new Error('bigdatacloud no disponible');
        const data = await res.json();
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      }
    ];

    for (const proveedor of proveedores) {
      try {
        const { lat, lng } = await proveedor();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error('Coordenadas inválidas');
        }

        const linkCompartir = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
        const gpsInput = document.getElementById('gpsUbicacion');
        if (gpsInput) gpsInput.value = linkCompartir;

        renderAviso(`📍 Ubicación aproximada cargada. <a href="${linkCompartir}" target="_blank">Abrir en Google Maps</a>`, '#007b8a');
        return true;
      } catch (e) {
        console.warn('Proveedor de ubicación por IP falló:', e);
      }
    }

    return false;
  };

  const solicitarUbicacion = (options) => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  };

  const describirError = (error) => {
    let mensaje = 'No se pudo obtener la ubicación. ';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        mensaje += 'Debes permitir el acceso a la ubicación en tu navegador.';
        break;
      case error.POSITION_UNAVAILABLE:
        mensaje += 'La información de ubicación no está disponible en este dispositivo o red.';
        break;
      case error.TIMEOUT:
        mensaje += 'La solicitud de ubicación tardó demasiado.';
        break;
      default:
        mensaje += 'Error desconocido.';
    }
    return mensaje;
  };

  if (navigator.permissions && navigator.permissions.query) {
    try {
      const permiso = await navigator.permissions.query({ name: 'geolocation' });
      if (permiso.state === 'denied') {
        const msg = 'El navegador tiene bloqueado el permiso de ubicación para este sitio. Activa el permiso en el icono de candado de la barra de direcciones y vuelve a intentar.';
        renderAviso(msg, '#c0392b');
        alert(msg);
        return;
      }
    } catch (_) {
      // Algunos navegadores no exponen este permiso; se continúa con la solicitud directa.
    }
  }

  renderAviso('Solicitando acceso a tu ubicación...', '#007b8a');

  try {
    const pos = await solicitarUbicacion(optionsEstandar);
    onSuccess(pos);
    return;
  } catch (errorEstandar) {
    console.warn('No se obtuvo geolocalización estándar', errorEstandar);

    if (errorEstandar.code === errorEstandar.PERMISSION_DENIED) {
      const msg = describirError(errorEstandar);
      renderAviso(msg, '#c0392b');
      alert(msg);
      return;
    }
  }

  try {
    renderAviso('No se obtuvo ubicación estándar. Reintentando con alta precisión...', '#b36b00');
    const posPrecisa = await solicitarUbicacion(optionsAltaPrecision);
    onSuccess(posPrecisa);
    return;
  } catch (errorPreciso) {
    console.warn('No se obtuvo geolocalización de alta precisión', errorPreciso);

    const okIP = await usarFallbackIP();
    if (okIP) return;

    const msg = describirError(errorPreciso);
    console.error('Error final al obtener geolocalización', errorPreciso);
    renderAviso(msg, '#c0392b');
    alert(msg);
  }
}
