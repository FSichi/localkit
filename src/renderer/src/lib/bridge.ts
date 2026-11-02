// The UI's only door to the main process.
export const { invoke, send, on, pathForFile } = window.bridge;
