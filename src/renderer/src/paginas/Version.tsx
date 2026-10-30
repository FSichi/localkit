import { Fragment, type ReactNode } from 'react';
import type { SeccionNotas } from '../../../shared/changelog.ts';
import { tamano } from '../../../shared/formato.ts';
import { Icono } from '../iconos.tsx';
import { actualizacion, instalarVersion, posponerVersion } from '../nucleo/actualizacion.ts';

const CLASE: Record<string, string> = { nuevo: 'nuevo', mejoras: 'mejoras', arreglos: 'arreglos' };
const FASES = { descargando: 'Descargando el instalador', verificando: 'Verificando que sea el original', instalando: 'Instalando' };

/** Texto de las notas: solo interpreta **negrita**, sin HTML. */
function Linea({ texto }: { texto: string }) {
  const partes: ReactNode[] = texto.split(/\*\*(.+?)\*\*/g).map((t, i) => (i % 2 ? <strong key={i}>{t}</strong> : <Fragment key={i}>{t}</Fragment>));
  return <>{partes}</>;
}

function Notas({ secciones }: { secciones: SeccionNotas[] }) {
  if (!secciones.length) return <p className="sutil">Esta versión no trae notas.</p>;
  return (
    <>
      {secciones.map((s) => (
        <div key={s.titulo} className="notas-seccion">
          <h3 className={CLASE[s.titulo.toLowerCase()] ?? ''}>{s.titulo}</h3>
          <ul>
            {s.items.map((item) => (
              <li key={item}>
                <Linea texto={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function ModalVersion() {
  const { modal, info, progreso, errorInstalacion } = actualizacion.usar();
  if (modal !== 'version' || !info?.ultima) return null;
  const u = info.ultima;
  const fraccion = progreso?.fase === 'descargando' && progreso.total ? progreso.bytes / progreso.total : null;

  return (
    <div className="velo">
      <div className="dialogo ancho" role="dialog" aria-modal="true" aria-label="Versión nueva">
        <h2>Hay una versión nueva de Transcriptor</h2>
        <span className="version-chip">
          {info.actual} → {u.version}
        </span>
        {progreso ? (
          <>
            <p>
              {FASES[progreso.fase]}
              {progreso.fase === 'descargando' && progreso.total > 0 && <span className="tenue"> · {tamano(progreso.bytes)} de {tamano(progreso.total)}</span>}
            </p>
            <div className={`barra ${fraccion == null ? 'indeterminada' : ''}`}>
              <div className="barra-relleno" style={{ width: `${(fraccion ?? 0) * 100}%` }} />
            </div>
            <p className="nota">{progreso.fase === 'instalando' ? 'La app se va a cerrar y volver a abrir sola en unos segundos.' : 'No cierres la app mientras se descarga.'}</p>
          </>
        ) : (
          <>
            <div className="notas">
              <Notas secciones={u.secciones} />
            </div>
            {errorInstalacion && <p className="mensaje-error">{errorInstalacion}</p>}
            <p className="nota">
              {info.instalada
                ? `Baja el instalador${u.instalador ? ` (${tamano(u.instalador.tamano)})` : ''}, verifica que sea el original y reinicia la app. Tu biblioteca y tus grabaciones no se tocan.`
                : 'Estás usando la app desde el código: actualizala con git pull, o instalá la versión nueva desde GitHub.'}
            </p>
            <div className="dialogo-acciones">
              <button className="btn" onClick={posponerVersion}>
                Más tarde
              </button>
              {info.instalada ? (
                <button className="btn btn-primario" onClick={instalarVersion}>
                  <Icono nombre="bajar" tamano={14} /> Actualizar ahora
                </button>
              ) : (
                <button className="btn btn-primario" onClick={() => window.api.abrirWeb(u.url)}>
                  Ver en GitHub
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ModalNovedades() {
  const { modal, novedades } = actualizacion.usar();
  if (modal !== 'novedades') return null;
  const cerrar = () => actualizacion.poner({ modal: null });
  return (
    <div className="velo" onClick={cerrar}>
      <div className="dialogo ancho" role="dialog" aria-modal="true" aria-label="Novedades" onClick={(e) => e.stopPropagation()}>
        <h2>{novedades.length === 1 ? `Novedades de Transcriptor ${novedades[0].version}` : 'Historial de versiones'}</h2>
        <div className="notas">
          {novedades.map((v) => (
            <div key={v.version} className="notas-version">
              {novedades.length > 1 && <span className="version-chip">{v.version}{v.fecha ? ` · ${new Date(`${v.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>}
              <Notas secciones={v.secciones} />
            </div>
          ))}
        </div>
        <div className="dialogo-acciones">
          <button className="btn btn-primario" autoFocus onClick={cerrar}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
