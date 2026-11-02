## Cómo instalar

1. Bajá **LocalKit-Setup-….exe** (abajo, en *Assets*) y abrilo. El archivo Transcriptor-Setup es el mismo instalador, y está para que las versiones anteriores puedan actualizarse solas.
2. Windows puede mostrar "Windows protegió tu PC", porque el instalador no está firmado. Tocá **Más información → Ejecutar de todas formas**.
3. Se instala para tu usuario, sin permisos de administrador, y crea el acceso directo **LocalKit**.
4. La primera transcripción descarga el modelo de IA. Con una placa de video compatible, la calidad Máxima pesa unos 1,5 GB. Se descarga una sola vez.

Si ya tenías la app, este instalador la actualiza. Tu biblioteca, tus grabaciones y tus modelos se conservan.

Para verificar el archivo, compará su SHA-256 con el del `.sha256` (en PowerShell: `Get-FileHash .\LocalKit-Setup-….exe`).
