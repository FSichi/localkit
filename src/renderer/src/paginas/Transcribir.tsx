import { useEffect, useState, type DragEvent } from 'react';
import { IDIOMAS, MODELOS, modeloPorId } from '../../../shared/modelos.ts';
import type { ResumenItem } from '../../../shared/tipos.ts';
import { Icono } from '../iconos.tsx';
import { app, guardarAjustes, ir, modeloActual } from '../nucleo/app.ts';
import { agregarArchivos, cancelarTrabajo, cola, type Trabajo } from '../nucleo/cola.ts';
import { FilaItem } from './Biblioteca.tsx';

function TarjetaTrabajo({ t }: { t: Trabajo }) {
  return (
    <div className="trabajo">
      <div className="trabajo-cab">
        <div className="trabajo-info">
          <strong>{t.titulo}</strong>
          <span>{t.detalle}</span>
        </div>
        <button className="btn btn-fantasma btn-chico btn-icono" title="Cancelar" onClick={() => cancelarTrabajo(t.id)}>
          <Icono nombre="cerrar" tamano={14} />
        </button>
      </div>
      {t.etapa !== 'espera' && (
        <div className={`barra ${t.fraccion == null ? 'indeterminada' : ''}`}>
          <div className="barra-relleno" style={{ width: `${(t.fraccion ?? 0) * 100}%` }} />
        </div>
      )}
      {t.parcial && <p className="trabajo-parcial">{t.parcial}</p>}
    </div>
  );
}

export function PaginaTranscribir() {
  const { ajustes, gpuMaxima, versionBiblioteca } = app.usar();
  const { trabajos } = cola.usar();
  const [encima, setEncima] = useState(false);
  const [recientes, setRecientes] = useState<ResumenItem[]>([]);
  const modelo = modeloActual();

  useEffect(() => {
    window.api.listarItems().then((items) => setRecientes(items.slice(0, 5)));
  }, [versionBiblioteca]);

  const elegir = async () => {
    const rutas = await window.api.elegirArchivos();
    if (rutas.length) agregarArchivos(rutas);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    const rutas = [...e.dataTransfer.files].map((f) => window.api.rutaDeArchivo(f)).filter(Boolean);
    if (rutas.length) agregarArchivos(rutas);
  };

  return (
    <div className="pagina">
      <div className="contenido">
        <header className="encabezado">
          <h1>Transcribir</h1>
          <p>Convertí cualquier audio o video en texto, sin que salga de tu computadora.</p>
        </header>

        <button
          className={`zona ${encima ? 'encima' : ''}`}
          onClick={elegir}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
        >
          <span className="zona-icono">
            <Icono nombre="subir" tamano={20} />
          </span>
          <strong>Soltá acá tus archivos</strong>
          <span className="sutil">
            o <span className="enlace">elegilos de tu PC</span>
          </span>
          <span className="tenue chico">MP3, WAV, M4A, OGG, FLAC, MP4, MKV y más</span>
        </button>

        <div className="opciones">
          <label className="opcion">
            <span>Idioma</span>
            <select className="selector" value={ajustes.idioma} onChange={(e) => guardarAjustes({ idioma: e.target.value })}>
              {IDIOMAS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="opcion">
            <span>Calidad</span>
            <select className="selector" value={modelo} onChange={(e) => guardarAjustes({ modelo: e.target.value })}>
              {MODELOS.filter((m) => !m.soloGpu || gpuMaxima).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <p className="opcion-nota">{modeloPorId(modelo).descripcion}</p>
        </div>

        {trabajos.length > 0 && (
          <section className="seccion">
            <h2 className="seccion-titulo">En proceso</h2>
            <div className="pila">
              {trabajos.map((t) => (
                <TarjetaTrabajo key={t.id} t={t} />
              ))}
            </div>
          </section>
        )}

        {recientes.length > 0 && (
          <section className="seccion">
            <div className="seccion-cab">
              <h2 className="seccion-titulo">Recientes</h2>
              <button className="enlace-btn" onClick={() => ir({ pagina: 'biblioteca' })}>
                Ver todo
              </button>
            </div>
            <div className="filas">
              {recientes.map((item) => (
                <FilaItem key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {!recientes.length && !trabajos.length && (
          <p className="nota-pie">
            <Icono nombre="candado" tamano={13} /> Todo se procesa en tu equipo. El modelo de IA se descarga una sola vez.
          </p>
        )}
      </div>
    </div>
  );
}
