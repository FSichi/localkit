# Transcriptor

App de escritorio para Windows que transcribe audio y graba lo que suena en tu PC, con IA que corre en tu computadora. El audio nunca sale de tu equipo.

**[Descargar la última versión](https://github.com/FSichi/transcriptor-desktop/releases/latest)**

## Qué hace

- **Transcribir** audio y video (MP3, WAV, M4A, OGG, FLAC, MP4, MKV y más), varios a la vez.
- **Grabar** el sonido de la PC (Discord, Meet, Zoom, navegador, lo que sea) y tu micrófono. Las dos fuentes se guardan por separado, así la transcripción distingue lo que dijiste vos de lo que dijeron los demás.
- **Biblioteca** con búsqueda por título o por lo que se dijo. El reproductor sigue el texto y salta a cualquier parte con un clic.
- **Exportar** a TXT, Markdown, PDF y subtítulos SRT, más el audio en MP3.
- **Actualizaciones**: avisa cuando hay una versión nueva y se actualiza con un clic, verificando el SHA-256 del instalador.

Las grabaciones se escriben en disco a medida que avanzan: si la app o la PC se cierran, lo grabado se recupera al volver a abrir.

## Calidades

| Calidad | Modelo Whisper | Descarga | Requisitos |
|---|---|---|---|
| Rápida | tiny | ~120 MB | — |
| Equilibrada | base | ~210 MB | — |
| Precisa | small | ~590 MB | — |
| Máxima | large-v3-turbo | ~1,5 GB | Placa de video con WebGPU y `shader-f16` |

Con placa de video usa WebGPU; sin ella, el procesador, que es más lento.

## Privacidad

Internet se usa solo para bajar los modelos de Hugging Face y para consultar los releases de este repo (se puede apagar en Ajustes). Avisá a las personas antes de grabarlas: es buena práctica y, según el lugar, puede ser obligatorio.

## Desarrollo

```bash
npm install
npm run dev
```

npm no corre los scripts de instalación de todos los paquetes: si falta FFmpeg o Electron, correlos con `node node_modules/ffmpeg-static/install.js` y `node node_modules/electron/install.js`.

| Comando | Qué hace |
|---|---|
| `npm run tipos` | Revisa los tipos |
| `npm test` | Pruebas unitarias |
| `npm run e2e -- <voz1.wav> <voz2.wav>` | Prueba de punta a punta sobre la app real |
| `node test/loopback.mjs <voz.wav>` | Prueba la captura real del sonido de Windows (reproduce la voz a volumen bajo) |
| `node test/actualizacion.mjs` | Prueba el aviso de versión nueva contra los releases reales, con una app armada con una versión vieja |
| `npm run instalador` | Arma `dist/Transcriptor-Setup-<versión>.exe` y su `.sha256` |

### Cómo está armada

| Carpeta | Qué hay |
|---|---|
| `src/main` | Proceso principal: ventana, protocolo propio, grabación a disco, FFmpeg, modelos, biblioteca, exportación y actualizaciones |
| `src/preload` | Puente seguro con la interfaz |
| `src/renderer` | Interfaz en React. `public/motor` tiene el worker de Whisper, que no pasa por el bundler |
| `src/shared` | Tipos, modelos y formatos compartidos |
| `installer` | Armado y prueba del instalador, notas de release |

La grabación usa una sola pista estéreo (izquierda = micrófono, derecha = sistema): comparten reloj, así que quedan sincronizadas, y al transcribir se separan con FFmpeg.

### Publicar una versión

1. Subí `version` en `package.json` y sumá `## [X.Y.Z]` al `CHANGELOG.md`.
2. Mergealo a `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`

El workflow corre las pruebas, arma el instalador, lo instala y prueba, y publica el release con las notas del `CHANGELOG.md`. Las apps instaladas lo ven solas.

## Licencia

[MIT](LICENSE). El instalador incluye FFmpeg (GPL v3) y otros componentes: ver [TERCEROS.md](TERCEROS.md).
