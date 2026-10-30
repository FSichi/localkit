import { useEffect, useMemo, useRef, useState } from 'react';
import { aParrafos, aTxt, contarPalabras, duracionLegible, NOMBRE_HABLANTE, reloj } from '../../../shared/formato.ts';
import type { FormatoExporte, Item } from '../../../shared/tipos.ts';
import { Icono } from '../iconos.tsx';
import { avisar, bibliotecaCambio, ir } from '../nucleo/app.ts';
import { agregarItem, cola } from '../nucleo/cola.ts';

const urlAudio = (ruta: string) => `transcriptor://media/${encodeURIComponent(ruta)}`;

function Reproductor({ audio, duracion }: { audio: HTMLAudioElement; duracion: number }) {
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duracion;

  useEffect(() => {
    const alTiempo = () => setTiempo(audio.currentTime);
    const alEstado = () => setSonando(!audio.paused);
    audio.addEventListener('timeupdate', alTiempo);
    audio.addEventListener('play', alEstado);
    audio.addEventListener('pause', alEstado);
    return () => {
      audio.removeEventListener('timeupdate', alTiempo);
      audio.removeEventListener('play', alEstado);
      audio.removeEventListener('pause', alEstado);
    };
  }, [audio]);

  return (
    <div className="reproductor">
      <button className="play" title={sonando ? 'Pausar' : 'Reproducir'} onClick={() => (audio.paused ? audio.play() : audio.pause())}>
        <Icono nombre={sonando ? 'pausa' : 'play'} tamano={13} />
      </button>
      <span className="num tenue">{reloj(tiempo)}</span>
      <input
        className="posicion"
        type="range"
        aria-label="Posición"
        min={0}
        max={total || 1}
        step={0.1}
        value={Math.min(tiempo, total)}
        onChange={(e) => (audio.currentTime = Number(e.target.value))}
      />
      <span className="num tenue">{reloj(total)}</span>
    </div>
  );
}

export function PaginaDetalle({ id }: { id: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [conTiempos, setConTiempos] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const texto = useRef<HTMLDivElement>(null);
  const { trabajos } = cola.usar();
  const enProceso = item ? trabajos.some((t) => t.itemId === item.id) : false;

  const cargar = () => window.api.obtenerItem(id).then(setItem).catch(() => ir({ pagina: 'biblioteca' }));
  useEffect(() => {
    cargar();
  }, [id]);
  // Al terminar de transcribir una grabación abierta, se muestra el resultado.
  useEffect(() => {
    if (!enProceso && item?.estado === 'pendiente') cargar();
  }, [enProceso]);

  useEffect(() => {
    if (!item?.audio) return;
    let sonido: HTMLAudioElement | null = null;
    window.api.existeArchivo(item.audio).then((existe) => {
      if (!existe) return;
      sonido = new Audio(urlAudio(item.audio!));
      sonido.preload = 'metadata';
      setAudio(sonido);
    });
    return () => {
      sonido?.pause();
      sonido?.removeAttribute('src');
      setAudio(null);
    };
  }, [item?.audio]);

  const parrafos = useMemo(() => aParrafos(item?.segmentos ?? []), [item]);

  // Resaltado del párrafo que suena: toca el DOM directo para no re-renderizar transcripciones largas.
  useEffect(() => {
    if (!audio || !parrafos.length) return;
    let activo = -1;
    const alTiempo = () => {
      const t = audio.currentTime;
      let lo = 0;
      let hi = parrafos.length - 1;
      let indice = -1;
      while (lo <= hi) {
        const medio = (lo + hi) >> 1;
        if (parrafos[medio].inicio <= t + 0.05) {
          indice = medio;
          lo = medio + 1;
        } else hi = medio - 1;
      }
      if (indice === activo) return;
      const hijos = texto.current?.children;
      hijos?.[activo]?.classList.remove('activo');
      hijos?.[indice]?.classList.add('activo');
      if (!audio.paused) hijos?.[indice]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      activo = indice;
    };
    audio.addEventListener('timeupdate', alTiempo);
    return () => audio.removeEventListener('timeupdate', alTiempo);
  }, [audio, parrafos]);

  if (!item) return null;

  const renombrar = async (titulo: string) => {
    const limpio = titulo.trim();
    if (!limpio || limpio === item.titulo) return;
    setItem(await window.api.actualizarItem(item.id, { titulo: limpio }));
    bibliotecaCambio();
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(aTxt(item.segmentos, conTiempos).trim());
    avisar('Texto copiado');
  };

  const exportar = async (formato: FormatoExporte) => {
    const ruta = await window.api.exportarItem(item.id, formato, conTiempos);
    if (ruta) avisar(`Guardado como ${formato.toUpperCase()}`, { accion: { texto: 'Mostrar', hacer: () => window.api.mostrarArchivo(ruta) } });
  };

  const exportarAudio = async () => {
    const ruta = await window.api.exportarAudio(item.id);
    if (ruta) avisar('Audio guardado', { accion: { texto: 'Mostrar', hacer: () => window.api.mostrarArchivo(ruta) } });
  };

  const eliminar = async () => {
    audio?.pause();
    await window.api.eliminarItem(item.id);
    bibliotecaCambio();
    ir({ pagina: 'biblioteca' });
    avisar('Eliminado');
  };

  const saltar = (segundos: number) => {
    if (!audio || getSelection()?.toString()) return;
    audio.currentTime = segundos;
    audio.play();
  };

  const transcripto = item.estado === 'transcripto';

  return (
    <div className="pagina detalle">
      <div className="contenido">
        <div className="migas">
          <button className="enlace-btn sutil" onClick={() => ir({ pagina: 'biblioteca' })}>
            <Icono nombre="volver" tamano={14} /> Biblioteca
          </button>
        </div>

        <header className="detalle-cab">
          <input key={item.titulo} className="titulo-editable" defaultValue={item.titulo} aria-label="Título" onBlur={(e) => renombrar(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <div className="detalle-meta">
            <span>{duracionLegible(item.duracion)}</span>
            {transcripto && <span>{contarPalabras(item.segmentos).toLocaleString('es-AR')} palabras</span>}
            {item.modelo && <span>Calidad {item.modelo.toLowerCase()}</span>}
            <span>{new Date(item.creado).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short', hour12: false })}</span>
          </div>
        </header>

        {audio && <Reproductor audio={audio} duracion={item.duracion} />}

        {transcripto && (
          <div className="acciones">
            <button className="btn btn-primario" onClick={copiar}>
              <Icono nombre="copiar" tamano={14} /> Copiar
            </button>
            <div className="grupo" role="group" aria-label="Exportar">
              {(['txt', 'md', 'pdf', 'srt'] as FormatoExporte[]).map((f) => (
                <button key={f} className="btn" onClick={() => exportar(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="btn btn-icono" title="Mostrar marcas de tiempo" aria-pressed={conTiempos} onClick={() => setConTiempos(!conTiempos)}>
              <Icono nombre="reloj" />
            </button>
            <div className="acciones-fin">
              {item.audio && (
                <button className="btn btn-fantasma" onClick={exportarAudio}>
                  <Icono nombre="bajar" tamano={14} /> Audio
                </button>
              )}
              {item.carpeta && (
                <button className="btn btn-fantasma btn-icono" title="Abrir carpeta" onClick={() => window.api.abrirCarpeta(item.carpeta!)}>
                  <Icono nombre="carpeta" />
                </button>
              )}
              <button className="btn btn-fantasma btn-icono" title="Eliminar" onClick={() => setConfirmando(true)}>
                <Icono nombre="basura" />
              </button>
            </div>
          </div>
        )}

        {transcripto ? (
          parrafos.length ? (
            <div ref={texto} className={`transcripcion ${conTiempos ? 'con-tiempos' : ''} ${audio ? 'saltable' : ''}`}>
              {parrafos.map((p) => (
                <p key={p.inicio} className="parrafo" onClick={() => saltar(p.inicio)}>
                  <span className="t">{reloj(p.inicio)}</span>
                  {p.hablante && <span className={`hablante ${p.hablante}`}>{NOMBRE_HABLANTE[p.hablante]}</span>}
                  {p.texto}
                </p>
              ))}
            </div>
          ) : (
            <div className="vacio">
              <p>No se detectó voz en este audio.</p>
            </div>
          )
        ) : (
          <div className="vacio">
            <p>{enProceso ? 'Transcribiendo…' : 'Esta grabación todavía no tiene transcripción.'}</p>
            {!enProceso && (
              <div className="vacio-acciones">
                <button className="btn btn-primario" onClick={() => agregarItem(item)}>
                  Transcribir ahora
                </button>
                <button className="btn btn-fantasma" onClick={() => setConfirmando(true)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmando && (
        <div className="velo" onClick={() => setConfirmando(false)}>
          <div className="dialogo" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>¿Eliminar «{item.titulo}»?</h2>
            <p>{item.tipo === 'grabacion' ? 'Se borra la transcripción y también el audio de la grabación. No se puede deshacer.' : 'Se borra la transcripción. Tu archivo original no se toca.'}</p>
            <div className="dialogo-acciones">
              <button className="btn" autoFocus onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button className="btn btn-peligro" onClick={eliminar}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
