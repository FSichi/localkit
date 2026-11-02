import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { bootstrapApp } from './app/app-store.ts';
import './styles/index.css';

bootstrapApp();
createRoot(document.getElementById('root')!).render(<App />);
