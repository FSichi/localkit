import { useEffect, useState } from 'react';
import { tamano } from '../../../shared/formato.ts';
import { IDIOMAS, MODELOS } from '../../../shared/modelos.ts';
import type { EstadoModelo, ProgresoDescarga, Tema } from '../../../shared/tipos.ts';
import { Icono } from '../iconos.tsx';
import { actualizacion, comprobarActualizacion, notasLocales } from '../nucleo/actualizacion.ts';
import { app, avisar, guardarAjustes, modeloActual } from '../nucleo/app.ts';
import { cola } from '../nucleo/cola.ts';
import { detenerMotor } from '../nucleo/motor.ts';

const TEMAS: { id: Tema; texto: string }[] = [
  { id: 'oscuro', texto: 'Oscuro' },
  { id: 'claro', texto: 'Claro' },
  { id: 'sistema', texto: 'Sistema' },
];

function Modelos() {
  const { perfil, gpuMaxima } = app.usar();
  const { trabajos } = cola.usar();
  const [estado, setEstado] = useState<EstadoModelo[]>([]);
  const [bajando, setBajando] = useState<ProgresoDescarga | null>(null);
  const seleccionado = modeloActual();

  const refrescar = () => window.api.estadoModelos(perfil).then(setEstado);
  useEffect(() => {
    refrescar();
    return window.api.alProgresoDescarga((p) => setBajando(p.hechos < p.total ? p : null));
  }, [perfil, trabajos.length]);

  const descargar = async (id: string) => {
    setBajando({ modelo: id, hechos: 0, total: 1 });
    try {
      await window.api.descargarModelo(id, perfil);
    } catch (err) {
      if (!/abort/i.test(String(err))) avisar('No se pudo descargar el modelo.', { tipo: 'error' });
    }
    setBajando(null);
    refrescar();
  };

  const borrar = async (id: string) => {
    if (trabajos.length) return avisar('Esperá a que termine la transcripción.');
    detenerMotor();
    await window.api.borrarModelo(id);
    refrescar();
    avisar('Modelo borrado');
  };

  return (
    <div className="filas">
      {MODELOS.map((m) => {
        const info = estado.find((e) => e.id === m.id);
        const disponible = !m.soloGpu || gpuMaxima;
        const suBajada = bajando?.modelo === m.id;
        return (
          <div key={m.id} className="fila modelo">
            <label className="radio">
              <input type="radio" name="modelo" disabled={!disponible} checked={seleccionado === m.id} onChange={() => guardarAjustes({ modelo: m.id })} />
              <span />
            </label>
            <span className="fila-cuerpo">
              <span className="fila-titulo">{m.nombre}</span>
              <span className="fila-fragmento">{disponible ? m.descripcion : 'Necesita una placa de video compatible'}</span>
              {suBajada && (
                <div className="barra">
                  <div className="barra-relleno" style={{ width: `${(bajando.hechos / bajando.total) * 100}%` }} />
                </div>
              )}
            </span>
            <span className="fila-meta">{info?.bytes ? tamano(info.bytes) : tamano(m.bytes[perfil])}</span>
            {suBajada ? (
              <button className="btn btn-chico" onClick={() => window.api.cancelarDescarga(m.id)}>
                Cancelar
              </button>
            ) : info?.descargado ? (
              <>
                <span className="etq etq-ok">Descargado</span>
                <button className="btn btn-fantasma btn-chico btn-icono" title="Borrar modelo" onClick={() => borrar(m.id)}>
                  <Icono nombre="basura" tamano={14} />
                </button>
              </>
            ) : (
              disponible && (
                <button className="btn btn-chico" disabled={!!bajando} onClick={() => descargar(m.id)}>
                  <Icono nombre="bajar" tamano={13} /> Descargar
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeccionApp() {
  const { ajustes, version } = app.usar();
  const { info, buscando, error } = actualizacion.usar();
  const hayNueva = info?.hayNueva && info.ultima;

  return (
    <section className="seccion">
      <h2 className="seccion-titulo">App</h2>
      <div className="filas">
        <div className="fila">
          <span className="fila-cuerpo">
            <span className="fila-titulo">Transcriptor {version}</span>
            <span className="fila-fragmento">
              {error ? `No se pudo consultar: ${error}` : hayNueva ? `Hay una versión nueva: ${info.ultima!.version}` : info ? 'Estás en la última versión' : 'Sin consultar todavía'}
            </span>
          </span>
          {hayNueva ? (
            <button className="btn btn-chico btn-primario" onClick={() => actualizacion.poner({ modal: 'version' })}>
              Ver novedades
            </button>
          ) : (
            <button className="btn btn-chico" disabled={buscando} onClick={() => comprobarActualizacion(true)}>
              {buscando ? 'Buscando…' : 'Buscar actualizaciones'}
            </button>
          )}
        </div>
        <label className="fila clicable">
          <span className="fila-titulo">Buscar versiones nuevas al abrir</span>
          <span className="interruptor">
            <input type="checkbox" checked={ajustes.buscarActualizaciones} onChange={(e) => guardarAjustes({ buscarActualizaciones: e.target.checked })} />
            <span />
          </span>
        </label>
        <button className="fila" onClick={() => actualizacion.poner({ modal: 'novedades', novedades: notasLocales().slice(0, 12) })}>
          <span className="fila-titulo">Historial de versiones</span>
          <Icono nombre="flecha" tamano={14} />
        </button>
      </div>
    </section>
  );
}

export function PaginaAjustes() {
  const { ajustes, perfil, nombreGpu } = app.usar();

  const elegirCarpeta = async () => {
    const carpeta = await window.api.elegirCarpeta();
    if (carpeta) guardarAjustes({ carpetaGrabaciones: carpeta });
  };

  return (
    <div className="pagina">
      <div className="contenido">
        <header className="encabezado">
          <h1>Ajustes</h1>
        </header>

        <section className="seccion">
          <h2 className="seccion-titulo">Apariencia</h2>
          <div className="filas">
            <div className="fila">
              <span className="fila-titulo">Tema</span>
              <div className="seg">
                {TEMAS.map((t) => (
                  <button key={t.id} aria-pressed={ajustes.tema === t.id} onClick={() => guardarAjustes({ tema: t.id })}>
                    {t.texto}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="seccion">
          <div className="seccion-cab">
            <h2 className="seccion-titulo">Calidad de transcripción</h2>
            <button className="enlace-btn" onClick={() => window.api.abrirCarpetaModelos()}>
              Abrir carpeta de modelos
            </button>
          </div>
          <Modelos />
          <p className="nota-pie">
            {perfil === 'gpu' ? `Usando la placa de video${nombreGpu ? ` (${nombreGpu})` : ''}.` : 'No se detectó una placa de video compatible: se usa el procesador, que es más lento.'}
          </p>
        </section>

        <section className="seccion">
          <h2 className="seccion-titulo">Transcripción</h2>
          <div className="filas">
            <div className="fila">
              <span className="fila-titulo">Idioma predeterminado</span>
              <select className="selector" value={ajustes.idioma} onChange={(e) => guardarAjustes({ idioma: e.target.value })}>
                {IDIOMAS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="seccion">
          <h2 className="seccion-titulo">Grabaciones</h2>
          <div className="filas">
            <div className="fila">
              <span className="fila-cuerpo">
                <span className="fila-titulo">Carpeta</span>
                <span className="fila-fragmento mono">{ajustes.carpetaGrabaciones}</span>
              </span>
              <button className="btn btn-chico" onClick={() => window.api.abrirCarpeta(ajustes.carpetaGrabaciones)}>
                Abrir
              </button>
              <button className="btn btn-chico" onClick={elegirCarpeta}>
                Cambiar
              </button>
            </div>
          </div>
        </section>

        <SeccionApp />

        <p className="nota-pie">
          <Icono nombre="candado" tamano={13} /> El audio se procesa en tu equipo. Internet solo se usa para descargar los modelos y buscar versiones nuevas.
        </p>
      </div>
    </div>
  );
}
