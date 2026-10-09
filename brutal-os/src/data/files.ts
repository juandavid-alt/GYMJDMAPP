// Almacén de archivos del modo demostración (IndexedDB del navegador).
// En producción: Supabase Storage, bucket privado "empleados/{ID – NOMBRE}/{subcarpeta}/",
// servido con URLs firmadas temporales.

const DB_NAME = "brutal-os-files";
const STORE = "files";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, modo);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarArchivo(id: string, file: Blob) {
  try {
    await tx("readwrite", (s) => s.put(file, id));
  } catch {
    /* almacenamiento no disponible: se conserva solo la metadata */
  }
}

export async function leerArchivo(id: string): Promise<Blob | undefined> {
  try {
    return await tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
  } catch {
    return undefined;
  }
}

export async function borrarArchivo(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* noop */
  }
}
