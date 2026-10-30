// Proceso principal: ventana, permisos de captura y puente con la interfaz.
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeTheme, session, shell } from 'electron';
import { existsSync, rmSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { guardarAjustes, leerAjustes } from './ajustes.ts';
import { actualizar, buscarActualizacion } from './actualizaciones.ts';
import { actualizarItem, crearItem, eliminarItem, listarItems, obtenerItem } from './biblioteca.ts';
import { exportarAudio, exportarItem } from './exportar.ts';
import { descartarGrabacion, escribirFragmento, hayGrabacionActiva, iniciarGrabacion, recuperarGrabaciones, terminarGrabacion } from './grabador.ts';
import { cancelarMedios, carpetaTemporal, limpiarTrabajo, prepararPistas } from './medios.ts';
import { borrarModelo, cancelarDescarga, carpetaModelos, descargarModelo, estadoModelos } from './modelos.ts';
import { permitirAudio, registrarEsquema, registrarProtocolo } from './protocolo.ts';
import type { Ajustes, FormatoExporte, Fuente, Item, Perfil, Tema } from '../shared/tipos.ts';

const ALTO_BARRA = 40;
const COLORES = {
  oscuro: { fondo: '#0D0E10', simbolos: '#A0A5AD' },
  claro: { fondo: '#F7F7F8', simbolos: '#4E535C' },
};

let ventana: BrowserWindow | null = null;

registrarEsquema();
// En notebooks con dos placas, que use la potente.
app.commandLine.appendSwitch('force_high_performance_gpu');

if (!app.requestSingleInstanceLock()) app.quit();

function colores(tema: Tema) {
  const oscuro = tema === 'sistema' ? nativeTheme.shouldUseDarkColors : tema === 'oscuro';
  return oscuro ? COLORES.oscuro : COLORES.claro;
}

function aplicarTema(tema: Tema) {
  nativeTheme.themeSource = tema === 'sistema' ? 'system' : tema === 'oscuro' ? 'dark' : 'light';
  const c = colores(tema);
  ventana?.setBackgroundColor(c.fondo);
  ventana?.setTitleBarOverlay({ color: c.fondo, symbolColor: c.simbolos, height: ALTO_BARRA });
}

function crearVentana() {
  const ajustes = leerAjustes();
  const c = colores(ajustes.tema);
  ventana = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Transcriptor',
    // Instalada, la ventana usa el ícono del .exe.
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    backgroundColor: c.fondo,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: c.fondo, symbolColor: c.simbolos, height: ALTO_BARRA },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      // Una grabación o transcripción tiene que seguir con la ventana minimizada.
      backgroundThrottling: false,
    },
  });
  ventana.once('ready-to-show', () => ventana?.show());

  ventana.on('close', (evento) => {
    if (!hayGrabacionActiva()) return;
    const respuesta = dialog.showMessageBoxSync(ventana!, {
      type: 'warning',
      title: 'Hay una grabación en curso',
      message: 'Hay una grabación en curso',
      detail: 'Si cerrás ahora, lo grabado se conserva y se recupera la próxima vez que abras la app.',
      buttons: ['Seguir grabando', 'Cerrar igual'],
      defaultId: 0,
      cancelId: 0,
    });
    if (respuesta === 0) evento.preventDefault();
  });

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('transcriptor://app') && !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '\0')) evento.preventDefault();
  });

  const dev = !app.isPackaged && process.env.ELECTRON_RENDERER_URL;
  ventana.loadURL(dev || 'transcriptor://app/index.html');
}

function configurarCaptura() {
  const sesion = session.defaultSession;
  // Micrófono y captura de pantalla son lo único que se concede.
  sesion.setPermissionRequestHandler((_c, permiso, responder) => responder(permiso === 'media' || permiso === 'display-capture' || permiso === 'fullscreen'));
  sesion.setPermissionCheckHandler((_c, permiso) => permiso === 'media' || permiso === 'display-capture');
  // getDisplayMedia entrega el sonido del sistema (loopback de Windows) sin mostrar selector.
  sesion.setDisplayMediaRequestHandler(async (_pedido, responder) => {
    const pantallas = await desktopCapturer.getSources({ types: ['screen'] });
    responder({ video: pantallas[0], audio: 'loopback' });
  });
}

function avisar(canal: string, datos: unknown) {
  ventana?.webContents.send(canal, datos);
}

function conAudioPermitido<T extends Item | undefined>(item: T): T {
  permitirAudio(item?.audio);
  return item;
}

function registrarIpc() {
  ipcMain.handle('app:inicio', () => {
    const ajustes = leerAjustes();
    return { ajustes, datos: app.getPath('userData'), version: app.getVersion() };
  });
  ipcMain.handle('ajustes:guardar', (_e, cambios: Partial<Ajustes>) => {
    const ajustes = guardarAjustes(cambios);
    if (cambios.tema) aplicarTema(cambios.tema);
    return ajustes;
  });
  ipcMain.handle('ajustes:elegirCarpeta', async () => {
    const r = await dialog.showOpenDialog(ventana!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('actualizacion:buscar', (_e, forzar: boolean) => buscarActualizacion(forzar));
  ipcMain.handle('actualizacion:instalar', () => actualizar((estado) => avisar('actualizacion:progreso', estado)));
  ipcMain.handle('app:abrirWeb', (_e, url: string) => {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
  });

  ipcMain.handle('archivos:elegir', async () => {
    const r = await dialog.showOpenDialog(ventana!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio y video', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'webm', 'mp4', 'mkv', 'mov', 'avi'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('archivos:mostrar', (_e, ruta: string) => shell.showItemInFolder(normalize(ruta)));
  ipcMain.handle('archivos:abrirCarpeta', (_e, ruta: string) => shell.openPath(normalize(ruta)));
  ipcMain.handle('archivos:existe', (_e, ruta: string) => existsSync(ruta));

  ipcMain.handle('modelos:estado', (_e, perfil: Perfil) => estadoModelos(perfil));
  ipcMain.handle('modelos:descargar', (_e, id: string, perfil: Perfil) => descargarModelo(id, perfil, (p) => avisar('modelos:progreso', p)));
  ipcMain.handle('modelos:cancelar', (_e, id: string) => cancelarDescarga(id));
  ipcMain.handle('modelos:borrar', (_e, id: string) => borrarModelo(id));
  ipcMain.handle('modelos:carpeta', () => shell.openPath(carpetaModelos()));

  ipcMain.handle('medios:preparar', (_e, trabajo: string, ruta: string, fuente: Fuente | undefined) =>
    prepararPistas(trabajo, ruta, fuente, (fraccion) => avisar('medios:progreso', { trabajo, fraccion })),
  );
  ipcMain.handle('medios:cancelar', (_e, trabajo: string) => cancelarMedios(trabajo));
  ipcMain.handle('medios:limpiar', (_e, trabajo: string) => limpiarTrabajo(trabajo));

  ipcMain.handle('biblioteca:listar', (_e, busqueda: string) => listarItems(busqueda));
  ipcMain.handle('biblioteca:obtener', (_e, id: string) => conAudioPermitido(obtenerItem(id)));
  ipcMain.handle('biblioteca:crear', (_e, datos: Omit<Item, 'id'>) => crearItem(datos));
  ipcMain.handle('biblioteca:actualizar', (_e, id: string, cambios: Partial<Item>) => actualizarItem(id, cambios));
  ipcMain.handle('biblioteca:eliminar', (_e, id: string) => eliminarItem(id));
  ipcMain.handle('biblioteca:exportar', (_e, id: string, formato: FormatoExporte, conTiempos: boolean) => exportarItem(ventana!, id, formato, conTiempos));
  ipcMain.handle('biblioteca:exportarAudio', (_e, id: string) => exportarAudio(ventana!, id));

  ipcMain.handle('grabacion:iniciar', (_e, fuente: Fuente) => iniciarGrabacion(fuente));
  ipcMain.on('grabacion:fragmento', (_e, id: string, datos: Uint8Array) => escribirFragmento(id, datos));
  ipcMain.handle('grabacion:terminar', async (_e, id: string, duracion: number) => conAudioPermitido(await terminarGrabacion(id, duracion)));
  ipcMain.handle('grabacion:descartar', (_e, id: string) => descartarGrabacion(id));
  ipcMain.handle('grabacion:recuperar', () => recuperarGrabaciones());
}

app.on('second-instance', () => {
  if (ventana?.isMinimized()) ventana.restore();
  ventana?.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = { sistema: 'system', oscuro: 'dark', claro: 'light' }[leerAjustes().tema] as 'system' | 'dark' | 'light';
  registrarProtocolo(join(__dirname, '../renderer'));
  configurarCaptura();
  registrarIpc();
  crearVentana();
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  // Audio decodificado de los trabajos: es temporal y puede pesar cientos de MB.
  rmSync(carpetaTemporal(), { recursive: true, force: true });
});
