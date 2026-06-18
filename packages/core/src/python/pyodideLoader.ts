/* eslint-disable @typescript-eslint/no-explicit-any */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";

export interface PyodideInterface {
  runPython(code: string): any;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  version: string;
}

let pyodideInstance: PyodideInterface | null = null;
let loadPromise: Promise<PyodideInterface> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function getPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await loadScript(`${PYODIDE_CDN}pyodide.js`);
    const loadPyodide = (globalThis as any).loadPyodide;
    if (!loadPyodide) {
      throw new Error("Pyodide script loaded but loadPyodide not found");
    }
    const pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });
    pyodideInstance = pyodide as PyodideInterface;
    return pyodideInstance;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function isPyodideLoaded(): boolean {
  return pyodideInstance !== null;
}
