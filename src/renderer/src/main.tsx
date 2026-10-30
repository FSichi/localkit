import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { iniciarApp } from './nucleo/app.ts';
import './estilos.css';

iniciarApp();
createRoot(document.getElementById('raiz')!).render(<App />);
