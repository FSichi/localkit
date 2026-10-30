import { useEffect } from 'react';
import { reloj } from '../../shared/formato.ts';
import { Icono } from './iconos.tsx';
import { actualizacion, iniciarActualizaciones } from './nucleo/actualizacion.ts';
import { app, avisos, avisar, bibliotecaCambio, ir, type Ruta } from './nucleo/app.ts';
import { cola } from './nucleo/cola.ts';
import { grabadora } from './nucleo/grabadora.ts';
import { PaginaAjustes } from './paginas/Ajustes.tsx';
import { PaginaBiblioteca } from './paginas/Biblioteca.tsx';
import { PaginaDetalle } from './paginas/Detalle.tsx';
import { PaginaGrabar } from './paginas/Grabar.tsx';
import { PaginaTranscribir } from './paginas/Transcribir.tsx';
import { ModalNovedades, ModalVersion } from './paginas/Version.tsx';

const SECCIONES: { pagina: Ruta['pagina']; texto: string; icono: string }[] = [
  { pagina: 'transcribir', texto: 'Transcribir', icono: 'texto' },
  { pagina: 'grabar', texto: 'Grabar', icono: 'grabar' },
  { pagina: 'biblioteca', texto: 'Biblioteca', icono: 'biblioteca' },
];

function EstadoRail() {
  const { estado, segundos } = grabadora.usar();
  const { trabajos } = cola.usar();
  const activo = trabajos.find((t) => t.etapa !== 'espera') ?? trabajos[0];
  const grabando = estado === 'grabando' || estado === 'pausada';
  if (!grabando && !activo) return null;
  return (
    <div className="rail-estado">
      {grabando && (
        <button className="tarjeta-estado" onClick={() => ir({ pagina: 'grabar' })}>
          <span className={`punto-rec ${estado === 'grabando' ? 'vivo' : ''}`} />
          <span>{estado === 'grabando' ? 'Grabando' : 'En pausa'}</span>
          <span className="tenue num">{reloj(segundos)}</span>
        </button>
      )}
      {activo && (
        <button className="tarjeta-estado columna" onClick={() => ir({ pagina: 'transcribir' })}>
          <span className="fila-estado">
            <span>Transcribiendo</span>
            {trabajos.length > 1 && <span className="tenue">+{trabajos.length - 1}</span>}
          </span>
          <div className={`barra ${activo.fraccion == null ? 'indeterminada' : ''}`}>
            <div className="barra-relleno" style={{ width: `${(activo.fraccion ?? 0) * 100}%` }} />
          </div>
        </button>
      )}
    </div>
  );
}

function AvisoVersion() {
  const { info } = actualizacion.usar();
  if (!info?.hayNueva || !info.ultima) return null;
  return (
    <button className="pastilla-version" onClick={() => actualizacion.poner({ modal: 'version' })}>
      <span className="punto" />
      Versión {info.ultima.version} disponible
    </button>
  );
}

function Rail() {
  const { ruta } = app.usar();
  const actual = ruta.pagina === 'detalle' ? 'biblioteca' : ruta.pagina;
  return (
    <nav className="rail" aria-label="Secciones">
      <div className="marca">
        <span className="marca-logo">
          <Icono nombre="onda" tamano={17} />
        </span>
        Transcriptor
      </div>
      {SECCIONES.map((s) => (
        <button key={s.pagina} className="rail-link" aria-current={actual === s.pagina ? 'page' : undefined} onClick={() => ir({ pagina: s.pagina } as Ruta)}>
          <Icono nombre={s.icono} />
          {s.texto}
        </button>
      ))}
      <div className="rail-pie">
        <AvisoVersion />
        <EstadoRail />
        <button className="rail-link" aria-current={actual === 'ajustes' ? 'page' : undefined} onClick={() => ir({ pagina: 'ajustes' })}>
          <Icono nombre="ajustes" />
          Ajustes
        </button>
      </div>
    </nav>
  );
}

function Avisos() {
  const { lista } = avisos.usar();
  return (
    <div className="toasts" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`toast ${a.tipo === 'error' ? 'error' : ''}`}>
          <span>{a.texto}</span>
          {a.accion && (
            <button className="toast-accion" onClick={a.accion.hacer}>
              {a.accion.texto}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const { ruta, listo } = app.usar();

  useEffect(() => {
    if (listo) iniciarActualizaciones();
  }, [listo]);

  useEffect(() => {
    window.api.recuperarGrabaciones().then((n) => {
      if (!n) return;
      bibliotecaCambio();
      avisar(n === 1 ? 'Recuperé una grabación que había quedado sin cerrar.' : `Recuperé ${n} grabaciones que habían quedado sin cerrar.`, {
        accion: { texto: 'Ver', hacer: () => ir({ pagina: 'biblioteca' }) },
      });
    });
  }, []);

  if (!listo) return <div className="arrastre" />;

  return (
    <div className="app">
      <div className="arrastre" />
      <Rail />
      <main className="vista">
        {ruta.pagina === 'transcribir' && <PaginaTranscribir />}
        {ruta.pagina === 'grabar' && <PaginaGrabar />}
        {ruta.pagina === 'biblioteca' && <PaginaBiblioteca />}
        {ruta.pagina === 'ajustes' && <PaginaAjustes />}
        {ruta.pagina === 'detalle' && <PaginaDetalle key={ruta.id} id={ruta.id} />}
      </main>
      <ModalVersion />
      <ModalNovedades />
      <Avisos />
    </div>
  );
}
