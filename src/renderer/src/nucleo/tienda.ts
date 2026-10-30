// Estado compartido mínimo: una tienda observable que React lee con un hook.
import { useSyncExternalStore } from 'react';

export interface Tienda<T> {
  leer(): T;
  poner(cambios: Partial<T>): void;
  usar(): T;
}

export function crearTienda<T extends object>(inicial: T): Tienda<T> {
  let valor = inicial;
  const oyentes = new Set<() => void>();
  const suscribir = (fn: () => void) => {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  };
  return {
    leer: () => valor,
    poner(cambios) {
      valor = { ...valor, ...cambios };
      oyentes.forEach((fn) => fn());
    },
    usar: () => useSyncExternalStore(suscribir, () => valor),
  };
}
