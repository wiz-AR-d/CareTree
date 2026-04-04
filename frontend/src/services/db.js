import { openDB } from 'idb';

const DB_NAME = 'caretree-offline-db';
const DB_VERSION = 1;

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // Store for caching the full list of protocols + versions
            if (!db.objectStoreNames.contains('protocols')) {
                db.createObjectStore('protocols', { keyPath: '_id' });
            }

            // Store for pending triage session submissions when offline
            if (!db.objectStoreNames.contains('syncQueue')) {
                // Use autoIncrement since these are new sessions not yet in MongoDB
                db.createObjectStore('syncQueue', { keyPath: 'localId', autoIncrement: true });
            }
        },
    });
};

// --- Protocols Cache Operations ---
export const saveProtocolsLocally = async (protocols) => {
    const db = await initDB();
    const tx = db.transaction('protocols', 'readwrite');
    const store = tx.objectStore('protocols');

    // Clear old cache before saving new list to prevent stale data
    await store.clear();

    for (const protocol of protocols) {
        // Assume API returns fully populated protocol (with active version details if needed)
        await store.put(protocol);
    }
    await tx.done;
};

export const getLocalProtocols = async () => {
    const db = await initDB();
    return await db.getAll('protocols');
};

export const getLocalProtocolById = async (id) => {
    const db = await initDB();
    return await db.get('protocols', id);
};

// --- Sync Queue Operations (For Nurse Triage Sessions) ---
export const addToSyncQueue = async (sessionPayload) => {
    const db = await initDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const timestamp = new Date().toISOString();

    await tx.store.add({
        ...sessionPayload,
        offlineSavedAt: timestamp
    });

    await tx.done;
    console.log('Session saved locally to syncQueue');
};

export const getSyncQueue = async () => {
    const db = await initDB();
    return await db.getAll('syncQueue');
};

export const clearSyncQueueItem = async (localId) => {
    const db = await initDB();
    await db.delete('syncQueue', localId);
};

export const clearEntireSyncQueue = async () => {
    const db = await initDB();
    await db.clear('syncQueue');
};
