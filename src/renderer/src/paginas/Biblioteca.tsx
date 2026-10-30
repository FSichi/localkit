import { useEffect, useState } from 'react';
import { duracionLegible } from '../../../shared/formato.ts';
import type { ResumenItem } from '../../../shared/tipos.ts';
import { Icono } from '../iconos.tsx';
import { app, ir } from '../nucleo/app.ts';

export function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (fecha.toDateString() === hoy.toDateString()) return `Hoy, ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`;
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: fecha.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
}

export function FilaItem({ item }: { item: ResumenItem }) {
  return (
    <button className="fila" onClick={() => ir({ pagina: 'detalle', id: item.id })}>
      <span className="fila-icono">
        <Icono nombre={item.tipo === 'grabacion' ? 'grabar' : 'texto'} />
      </span>
      <span className="fila-cuerpo">
        <span className="fila-titulo">{item.titulo}</span>
        {item.fragmento && <span className="fila-fragmento">{item.fragmento}</span>}
      </span>
      {item.estado === 'pendiente' && <span className="etq etq-alerta">Sin transcribir</span>}
      <span className="fila-meta">{duracionLegible(item.duracion)}</span>
      <span className="fila-meta fecha">{fechaCorta(item.creado)}</span>
    </button>
  );
}

export function PaginaBiblioteca() {
  const { versionBiblioteca } = app.usar();
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState<ResumenItem[] | null>(null);

  useEffect(() => {
    const espera = setTimeout(() => window.api.listarItems(busqueda).then(setItems), busqueda ? 150 : 0);
    return () => clearTimeout(espera);
  }, [busqueda, versionBiblioteca]);

  return (
    <div className="pagina">
      <div className="contenido">
        <header className="encabezado">
          <h1>Biblioteca</h1>
          <p>Tus transcripciones y grabaciones.</p>
        </header>

        <label className="campo">
          <Icono nombre="buscar" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por título o por lo que se dijo" />
        </label>

        {items && items.length > 0 && (
          <div className="filas">
            {items.map((item) => (
              <FilaItem key={item.id} item={item} />
            ))}
          </div>
        )}

        {items && !items.length && (
          <div className="vacio">
            {busqueda ? (
              <p>No encontré nada con «{busqueda}».</p>
            ) : (
              <>
                <p>Todavía no hay nada acá.</p>
                <div className="vacio-acciones">
                  <button className="btn" onClick={() => ir({ pagina: 'transcribir' })}>
                    Transcribir un archivo
                  </button>
                  <button className="btn" onClick={() => ir({ pagina: 'grabar' })}>
                    Grabar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
