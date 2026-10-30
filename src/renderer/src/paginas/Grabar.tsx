import { useEffect, useRef, useState } from 'react';
import { reloj } from '../../../shared/formato.ts';
import type { Fuente } from '../../../shared/tipos.ts';
import { Icono } from '../iconos.tsx';
import { app, guardarAjustes } from '../nucleo/app.ts';
import { descartarGrabacion, detenerGrabacion, grabadora, historial, iniciarGrabacion, pausarGrabacion } from '../nucleo/grabadora.ts';

const FUENTES: { id: Fuente; texto: string; detalle: string; icono: string }[] = [
  { id: 'ambos', texto: 'PC y micrófono', detalle: 'Reuniones y llamadas. Separa lo que decís vos de lo que dicen los demás.', icono: 'auriculares' },
  { id: 'sistema', texto: 'Solo la PC', detalle: 'Todo lo que suena: Discord, Meet, Zoom, videos, navegador.', icono: 'pc' },
  { id: 'mic', texto: 'Solo micrófono', detalle: 'Notas de voz o una charla presencial.', icono: 'micro' },
];

/** Onda en vivo. Lee los niveles directo del historial, sin pasar por React. */
function Onda({ fuente }: { fuente: Fuente }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = lienzo.current!;
    const ctx = canvas.getContext('2d')!;
    const estilos = getComputedStyle(document.documentElement);
    const colorSistema = estilos.getPropertyValue('--acento').trim();
    const colorMic = estilos.getPropertyValue('--ok').trim();
    let cuadro = 0;

    const dibujar = () => {
      const escala = devicePixelRatio;
      const ancho = canvas.clientWidth * escala;
      const alto = canvas.clientHeight * escala;
      if (canvas.width !== ancho) canvas.width = ancho;
      if (canvas.height !== alto) canvas.height = alto;
      ctx.clearRect(0, 0, ancho, alto);

      const pintar = (datos: Float32Array, color: string, arriba: boolean) => {
        const paso = ancho / datos.length;
        const grosor = Math.max(1.5 * escala, paso * 0.55);
        ctx.fillStyle = color;
        for (let i = 0; i < datos.length; i++) {
          const h = Math.max(1.5 * escala, datos[i] * (alto / 2 - 2 * escala));
          ctx.fillRect(i * paso, arriba ? alto / 2 - h - escala : alto / 2 + escala, grosor, h);
        }
      };
      if (fuente !== 'mic') pintar(historial.sistema, colorSistema, true);
      if (fuente !== 'sistema') pintar(historial.mic, colorMic, fuente === 'mic');
      cuadro = requestAnimationFrame(dibujar);
    };
    dibujar();
    return () => cancelAnimationFrame(cuadro);
  }, [fuente]);

  return <canvas ref={lienzo} className="onda" />;
}

function Panel() {
  const { estado, segundos, fuente } = grabadora.usar();
  const pausada = estado === 'pausada';
  return (
    <div className="grabando">
      <div className="grabando-cab">
        <span className={`punto-rec ${pausada ? '' : 'vivo'}`} />
        <span>{pausada ? 'En pausa' : estado === 'guardando' ? 'Guardando…' : 'Grabando'}</span>
      </div>
      <div className="contador">{reloj(segundos)}</div>
      <Onda fuente={fuente} />
      {fuente === 'ambos' && (
        <div className="leyenda">
          <span>
            <i className="muestra sistema" /> PC
          </span>
          <span>
            <i className="muestra mic" /> Micrófono
          </span>
        </div>
      )}
      <div className="grabando-acciones">
        <button className="btn btn-grande" disabled={estado === 'guardando'} onClick={descartarGrabacion}>
          Descartar
        </button>
        <button className="btn btn-grande" disabled={estado === 'guardando'} onClick={pausarGrabacion}>
          <Icono nombre={pausada ? 'play' : 'pausa'} tamano={14} />
          {pausada ? 'Seguir' : 'Pausar'}
        </button>
        <button className="btn btn-grande btn-primario" disabled={estado === 'guardando'} onClick={detenerGrabacion}>
          <Icono nombre="detener" tamano={14} />
          Terminar
        </button>
      </div>
      <p className="nota-pie centro">Podés minimizar la ventana: sigue grabando. Se guarda en disco a medida que avanza.</p>
    </div>
  );
}

export function PaginaGrabar() {
  const { ajustes } = app.usar();
  const { estado } = grabadora.usar();
  const [micros, setMicros] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const cargar = async () => {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      setMicros(dispositivos.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'));
    };
    cargar();
    navigator.mediaDevices.addEventListener('devicechange', cargar);
    return () => navigator.mediaDevices.removeEventListener('devicechange', cargar);
  }, []);

  const activa = estado !== 'inactiva' && estado !== 'iniciando';

  return (
    <div className="pagina">
      <div className="contenido">
        <header className="encabezado">
          <h1>Grabar</h1>
          <p>Grabá lo que suena en tu PC: reuniones, Discord, llamadas o lo que sea.</p>
        </header>

        {activa ? (
          <Panel />
        ) : (
          <>
            <div className="fuentes" role="radiogroup" aria-label="Qué grabar">
              {FUENTES.map((f) => (
                <button key={f.id} className="fuente" role="radio" aria-checked={ajustes.fuente === f.id} onClick={() => guardarAjustes({ fuente: f.id })}>
                  <Icono nombre={f.icono} tamano={20} />
                  <strong>{f.texto}</strong>
                  <span>{f.detalle}</span>
                </button>
              ))}
            </div>

            <div className="fila-ajustes">
              {ajustes.fuente !== 'sistema' && (
                <label className="opcion ancha">
                  <span>Micrófono</span>
                  <select className="selector" value={ajustes.micId} onChange={(e) => guardarAjustes({ micId: e.target.value })}>
                    <option value="default">El predeterminado de Windows</option>
                    {micros
                      .filter((m) => m.deviceId !== 'default')
                      .map((m) => (
                        <option key={m.deviceId} value={m.deviceId}>
                          {m.label || 'Micrófono'}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="interruptor-fila">
                <span>Transcribir al terminar</span>
                <span className="interruptor">
                  <input type="checkbox" checked={ajustes.transcribirAlTerminar} onChange={(e) => guardarAjustes({ transcribirAlTerminar: e.target.checked })} />
                  <span />
                </span>
              </label>
            </div>

            <button className="btn-grabar" disabled={estado === 'iniciando'} onClick={iniciarGrabacion}>
              <span className="btn-grabar-punto" />
              {estado === 'iniciando' ? 'Iniciando…' : 'Empezar a grabar'}
            </button>

            <div className="consejos">
              {ajustes.fuente === 'ambos' && (
                <p>
                  <Icono nombre="auriculares" tamano={14} /> Usá auriculares: si la llamada sale por parlantes, el micrófono también la escucha y puede repetirse en la transcripción.
                </p>
              )}
              <p>
                <Icono nombre="aviso" tamano={14} /> Avisá a las personas que vas a grabar: es buena práctica y, según el lugar, puede ser obligatorio.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
