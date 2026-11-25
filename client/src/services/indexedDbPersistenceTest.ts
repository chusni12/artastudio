/**
 * ArtaStudio - Tes Persistensi IndexedDB
 *
 * Fitur tes yang memverifikasi apakah sesi browser ini dapat menulis dan
 * membaca-balik data ke IndexedDB secara persisten (tidak hilang saat
 * koneksi dibuka ulang / simulasi reload halaman).
 *
 * Prosedur tes:
 *  1. Deteksi dukungan IndexedDB di lingkungan ini.
 *  2. Buka database tes (buat jika belum ada) & object store.
 *  3. Tulis N record dengan payload deterministik, lalu baca-balik & verifikasi.
 *  4. Tulis record besar (payload-size check).
 *  5. Tutup koneksi, buka ulang database (simulasi reload), baca record lagi.
 *  6. Bersihkan record tes agar tabel tetap bersih.
 */

const TEST_DB_NAME = 'ArtaStudio_PersistenceTestDB';
const TEST_DB_VERSION = 1;
const TEST_STORE_NAME = 'artastudio_persistence_test';
const RECORDS_TO_WRITE = 5;
const LARGE_PAYLOAD_CHARS = 128 * 1024;

export interface PersistenceStep {
  name: string;
  ok: boolean;
  detail?: string;
  durationMs?: number;
}

export interface PersistenceTestStorageInfo {
  dbName: string;
  storeName: string;
  recordsWritten: number;
}

export interface PersistenceTestReport {
  success: boolean;
  startedAt: string;
  durationMs: number;
  steps: PersistenceStep[];
  storage?: PersistenceTestStorageInfo;
  error?: string;
}

export interface PersistenceTestRecord {
  id: string;
  value: string;
  createdAt: string;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Payload deterministik: berbeda di tiap record, tapi tetap dapat diverifikasi setelah baca-balik. */
function buildPayload(i: number): string {
  const parts: string[] = [];
  for (let n = 0; n < i + 1; n++) {
    parts.push(`artastudio-tes-${n}-payload-${'x'.repeat((n % 8) + 1)}`);
  }
  return parts.join('|') + ` [check-${i}]`;
}

function makeRecord(id: string): PersistenceTestRecord {
  return { id, value: buildPayload(Number(id.split('_').pop()) || 0), createdAt: new Date().toISOString() };
}

function isSameRecord(stored: unknown, expected: PersistenceTestRecord): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const s = stored as PersistenceTestRecord;
  return s.id === expected.id && s.value === expected.value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openTestDB(upgradeNeeded = true): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TEST_DB_NAME, upgradeNeeded ? TEST_DB_VERSION : undefined);
    request.onupgradeneeded = () => {
      if (!upgradeNeeded) return;
      const db = request.result;
      if (!db.objectStoreNames.contains(TEST_STORE_NAME)) {
        db.createObjectStore(TEST_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db: IDBDatabase, record: PersistenceTestRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEST_STORE_NAME, 'readwrite');
    tx.objectStore(TEST_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getRecord(db: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEST_STORE_NAME, 'readonly');
    const request = tx.objectStore(TEST_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putLargeRecord(db: IDBDatabase, id: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = 'L'.repeat(LARGE_PAYLOAD_CHARS);
    const tx = db.transaction(TEST_STORE_NAME, 'readwrite');
    const store = tx.objectStore(TEST_STORE_NAME);
    store.put({ id, value: payload, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(LARGE_PAYLOAD_CHARS);
    tx.onerror = () => reject(tx.error);
  });
}

function deleteRecords(db: IDBDatabase, ids: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ids.length === 0) {
      resolve();
      return;
    }
    const tx = db.transaction(TEST_STORE_NAME, 'readwrite');
    const store = tx.objectStore(TEST_STORE_NAME);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Menjalankan tes persistensi IndexedDB:
 *  - deteksi dukungan
 *  - buka DB tes & buat store
 *  - tulis record & baca-balik (verifikasi nilai terpenuhkan)
 *  - tulis record besar (payload-size check)
 *  - tutup & buka ulang DB (simulasi reload), baca ulang record
 *  - bersihkan record tes yang ditulis
 *
 * Mengembalikan laporan langkah demi langkah; `success` true jika semua langkah lolos.
 */
export async function runPersistenceTest(): Promise<PersistenceTestReport> {
  const startedAt = new Date().toISOString();
  const steps: PersistenceStep[] = [];
  const writtenIds: string[] = [];
  let storage: PersistenceTestStorageInfo | undefined;

  const recordStep = (name: string, ok: boolean, detail?: string, durationMs?: number) => {
    steps.push({ name, ok, detail, durationMs: durationMs !== undefined ? Math.round(durationMs) : undefined });
  };

  // --- Langkah 1: Deteksi dukungan IndexedDB ---
  let t = nowMs();
  const supported = typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';
  recordStep('deteksi_dukungan', supported, supported ? 'IndexedDB tersedia' : 'IndexedDB tidak tersedia di lingkungan ini');
  if (!supported) {
    return { success: false, startedAt, durationMs: Math.round(nowMs() - t), steps, error: 'IndexedDB tidak tersedia' };
  }

  let db: IDBDatabase | null = null;
  try {
    // --- Langkah 2: Buka database tes & object store ---
    t = nowMs();
    db = await openTestDB();
    recordStep('buka_database', true, `Database terbuka: ${TEST_DB_NAME}`, nowMs() - t);

    storage = { dbName: TEST_DB_NAME, storeName: TEST_STORE_NAME, recordsWritten: 0 };

    // --- Langkah 3: Tulis N record & baca-balik (verifikasi) ---
    t = nowMs();
    let verifyOk = true;
    const failures: string[] = [];
    for (let i = 0; i < RECORDS_TO_WRITE; i++) {
      const id = `artastudio_test_${i + 1}_${Date.now()}`;
      const record = makeRecord(id);
      try {
        await putRecord(db, record);
        writtenIds.push(id);
        const stored = await getRecord(db, id);
        if (!isSameRecord(stored, record)) {
          verifyOk = false;
          failures.push(`record ${id} nilainya tidak cocok setelah baca`);
        }
      } catch (err) {
        verifyOk = false;
        failures.push(`record ${i + 1}: ${(err as Error)?.message || String(err)}`);
      }
    }
    storage.recordsWritten = writtenIds.length;
    const roundTripMs = nowMs() - t;
    recordStep(
      'tulis_baca_balik',
      verifyOk,
      verifyOk
        ? `${writtenIds.length}/${RECORDS_TO_WRITE} record lolos verifikasi nilai`
        : failures.slice(0, 3).join('; '),
      roundTripMs
    );

    // --- Langkah 4: Record besar (payload-size check) ---
    t = nowMs();
    const largeId = `artastudio_test_large_${Date.now()}`;
    let largeOk = true;
    let largeBytes = 0;
    try {
      largeBytes = await putLargeRecord(db, largeId);
      writtenIds.push(largeId);
      const stored = await getRecord(db, largeId);
      const storedValue = (stored as PersistenceTestRecord)?.value || '';
      if (storedValue.length !== LARGE_PAYLOAD_CHARS) {
        largeOk = false;
      }
    } catch (err) {
      largeOk = false;
    }
    recordStep(
      'payload_besar',
      largeOk,
      largeOk ? `Payload ${formatBytes(largeBytes)} terbaca utuh` : `Payload besar gagal (${formatBytes(largeBytes)})`,
      nowMs() - t
    );

    // --- Langkah 5: Simulasi reload (tutup & buka ulang DB) ---
    t = nowMs();
    let reopenOk = true;
    try {
      db.close();
      db = await openTestDB(false); // buka ulang tanpa upgrade (data harus tetap ada)
      const stored = (await getRecord(db, writtenIds[0])) as PersistenceTestRecord | null;
      if (!stored) {
        reopenOk = false;
      }
    } catch (err) {
      reopenOk = false;
    }
    recordStep(
      'simulasi_reload',
      reopenOk,
      reopenOk
        ? 'Data terbaca setelah buka ulang koneksi (tetap tersimpan di storage)'
        : 'Data hilang setelah buka ulang koneksi',
      nowMs() - t
    );

    // --- Langkah 6: Bersihkan record tes ---
    t = nowMs();
    try {
      db.close();
      db = null;
      const cleanupDb = await openTestDB(false);
      await deleteRecords(cleanupDb, writtenIds);
      cleanupDb.close();
      db = null;
      recordStep('bersihkan_record', true, `${writtenIds.length} record tes dihapus`);
    } catch (err) {
      recordStep('bersihkan_record', false, `Gagal bersihkan: ${(err as Error)?.message || String(err)}`);
    }

    return {
      success: steps.every((s) => s.ok),
      startedAt,
      durationMs: Math.round(nowMs() - Date.parse(startedAt)),
      steps,
      storage,
    };
  } catch (err) {
    recordStep('error', false, (err as Error)?.message || String(err));
    if (db) db.close();
    return {
      success: false,
      startedAt,
      durationMs: Math.round(nowMs() - Date.parse(startedAt)),
      steps,
      storage,
      error: (err as Error)?.message || String(err),
    };
  }
}

export { TEST_DB_NAME, TEST_STORE_NAME, formatBytes };
