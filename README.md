# LocalKit

Tu caja de herramientas local para Windows: imágenes, video, audio, PDF, transcripción, contraseñas y códigos QR. Todo se procesa en tu computadora y nada se sube a internet.

**[Descargar la última versión](https://github.com/FSichi/transcriptor-desktop/releases/latest)**

> LocalKit es un nombre provisional. El repositorio, el instalador (`Transcriptor-Setup-…`) y la carpeta de datos conservan el nombre anterior hasta definir el definitivo, para que las copias instaladas sigan actualizándose.

## Qué hace

| Herramienta | Funciones |
|---|---|
| **Inicio** | Soltá cualquier archivo y te ofrece qué hacer con él |
| **Imágenes** | Optimizar, convertir (WebP, AVIF, JPG, PNG), redimensionar y quitar metadatos, por lotes, con comparación antes/después. Lee HEIC |
| **Video y audio** | Comprimir por calidad o a un tamaño final, convertir, extraer audio y cortar. Usa la placa de video (NVIDIA, AMD o Intel) si hay una |
| **PDF** | Unir, separar, comprimir y crear desde imágenes |
| **Transcribir** | Audio y video a texto con Whisper, con cuatro calidades |
| **Grabar** | El sonido de la PC y el micrófono por separado, para distinguir quién habló. Se guarda en disco mientras graba y se recupera si la app se cierra |
| **Biblioteca** | Búsqueda por lo que se dijo, reproductor que sigue el texto y exportación a TXT, Markdown, PDF y SRT |
| **Contraseñas** | Generador criptográfico con medidor de fuerza. Nada se guarda en disco |
| **Códigos QR** | Texto, Wi-Fi, contacto, WhatsApp y email, con colores y logo, o en lote desde una lista o un rango |

## Privacidad

Internet se usa solo para bajar los modelos de IA de Hugging Face y para consultar los releases de este repo (se puede apagar en Ajustes). Avisá a las personas antes de grabarlas: es buena práctica y, según el lugar, puede ser obligatorio.

## Desarrollo

```bash
npm install
npm run dev
```

npm no corre los scripts de instalación de todos los paquetes: si falta FFmpeg o Electron, correlos con `node node_modules/ffmpeg-static/install.js` y `node node_modules/electron/install.js`.

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | Revisa los tipos |
| `npm test` | Pruebas unitarias |
| `npm run test:tools` | Prueba de punta a punta de las herramientas, verificando los archivos generados |
| `npm run test:transcription -- <voz1.wav> <voz2.wav>` | Prueba de punta a punta de transcripción, grabación y biblioteca |
| `node test/e2e/migration.mjs` | Abre la app sobre datos de la 0.1.0 |
| `node test/e2e/loopback.mjs <voz.wav>` | Captura real del sonido de Windows (reproduce la voz a volumen bajo) |
| `node test/e2e/update.mjs` | Aviso de versión nueva contra los releases reales, con una app armada con una versión vieja |
| `npm run installer` | Arma `dist/Transcriptor-Setup-<versión>.exe` y su `.sha256` |

Para correr las pruebas de herramientas sobre la app empaquetada: `E2E_EXE=dist/win-unpacked/Transcriptor.exe node test/e2e/tools.mjs`.

## Arquitectura

El código está en inglés y organizado por funcionalidad. Los textos que ve el usuario viven todos en `src/shared/i18n/es.ts`.

```
src/
  shared/      Lógica pura y contratos, sin Electron ni DOM
    ipc.ts       Contrato único entre el proceso principal y la interfaz
    jobs.ts      Trabajos de archivos: pedidos y resultados
    i18n/        Catálogo de textos
  main/        Proceso principal
    index.ts     Raíz de composición: conecta todo
    app/         Ventana, protocolo, ajustes, migraciones, actualizaciones
    core/        Servicios compartidos: FFmpeg, trabajos, archivos de salida
    features/    Un módulo por área: images, media, pdf, transcription, library, recording, files
  preload/     Puente genérico y tipado
  renderer/
    public/engine/  Worker de Whisper, fuera del bundler
    src/
      app/       Estructura: tienda global, barra lateral, registro de herramientas
      lib/       Utilidades sin UI
      ui/        Componentes reutilizables
      styles/    Tokens de diseño, base, componentes y layout
      features/  Un módulo por herramienta
```

### Patrones

- **Contrato IPC tipado** (`shared/ipc.ts`): cada canal se declara una sola vez con sus argumentos y su resultado. El preload es genérico, así que sumar un canal no toca nada más, y el compilador valida ambos lados.
- **Procesadores de trabajos** (`main/core/jobs.ts`): cada tipo de trabajo tiene su procesador. `JobProcessors` exige uno por tipo, así que un trabajo nuevo sin implementar no compila.
- **Registro de herramientas** (`renderer/src/app/tools.ts`): cada herramienta declara su nombre, ícono, página y acciones sobre archivos. La barra lateral y el Inicio se construyen solos desde ahí.
- **Lotes reutilizables** (`features/file-batch`): `createBatch` y `BatchTool` resuelven la lista, la concurrencia, el progreso, la cancelación y el resumen. Cada herramienta solo aporta sus opciones y cómo armar el pedido.
- **Estrategias**: codificadores de video por hardware con caída automática al procesador (`video-encoders.ts`), codificadores de imagen y exportadores por formato.
- **Errores tipados** (`shared/errors.ts`): el proceso principal lanza un código y la interfaz lo convierte en mensaje desde el catálogo.
- **Salidas seguras** (`core/output-files.ts`): nada se escribe sobre un archivo existente, y un trabajo fallido o cancelado no deja archivos a medias.
- **Migraciones** (`app/migrations.ts`): los datos de versiones anteriores se traducen al abrir, con funciones puras y probadas (`app/legacy-schema.ts`).

### Sumar una herramienta

1. Si procesa archivos, agregá el pedido a `JobRequest` en `shared/jobs.ts` y su procesador en `main/index.ts`.
2. Creá `renderer/src/features/<herramienta>/` con su página y un `tool.ts`.
3. Sumala a `TOOLS` en `renderer/src/app/tools.ts` y sus textos a `shared/i18n/es.ts`.

### Publicar una versión

1. Subí `version` en `package.json` y sumá `## [X.Y.Z]` al `CHANGELOG.md`.
2. Mergealo a `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`

El workflow corre las pruebas, arma el instalador, lo instala y prueba, y publica el release con las notas del `CHANGELOG.md`. Las apps instaladas lo ven solas.

## Licencia

[MIT](LICENSE). El instalador incluye FFmpeg (GPL v3) y otros componentes: ver [THIRD_PARTY.md](THIRD_PARTY.md).
