import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Tu Refugio</h1>
      <p>Frontend migrado a React sin tocar la logica del backend ni sus endpoints.</p>

      <section className="card">
        <h2>Accesos React</h2>
        <div className="actions">
          <Link to="/explorar" className="btn primary">Explorar alojamientos</Link>
          <Link to="/login" className="btn primary">Iniciar sesion</Link>
          <Link to="/registro-turista" className="btn">Registro turista</Link>
          <Link to="/panel/turista" className="btn">Panel turista</Link>
          <Link to="/panel/anfitrion" className="btn">Panel anfitrion</Link>
        </div>
      </section>

      <section className="card">
        <h2>Accesos legacy</h2>
        <p>Se conservan para mantener compatibilidad total mientras terminas la migracion.</p>
        <div className="actions">
          <a className="btn" href="/index.html">Inicio legacy</a>
          <a className="btn" href="/login/login.html">Login legacy</a>
          <a className="btn" href="/registro_turista/turista.html">Registro legacy</a>
        </div>
      </section>
    </main>
  );
}
