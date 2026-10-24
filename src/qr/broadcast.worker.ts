/// <reference lib="webworker" />
/**
 * Воркер-передатчик: держит кодер и отдаёт готовые матрицы QR по запросу.
 *
 * Генерация вынесена из главного потока не ради самой кодировки (2–4 мс), а
 * ради стабильности такта: на телефоне рендер React и раскладка легко съедают
 * кадровый бюджет, и поток начинает дёргаться — а рваный такт сканер не любит.
 */
import { encodeMatrix } from './encode';
import type { ErrorCorrectionLevel } from './capacity';
import { FountainEncoder } from '../protocol/encoder';
import type { FileMeta } from '../protocol/types';

export interface BroadcastStartMessage {
  type: 'start';
  session: number;
  source: ArrayBuffer;
  meta: FileMeta;
  version: number;
  level: ErrorCorrectionLevel;
}

export interface BroadcastPullMessage {
  type: 'pull';
  count: number;
}

export interface BroadcastStopMessage {
  type: 'stop';
}

export type BroadcastRequest = BroadcastStartMessage | BroadcastPullMessage | BroadcastStopMessage;

export interface BroadcastFrame {
  index: number;
  seq: number | null;
  isMeta: boolean;
  size: number;
  data: Uint8Array;
}

export type BroadcastResponse =
  | { type: 'ready'; blockCount: number; version: number }
  | { type: 'frames'; frames: BroadcastFrame[] }
  | { type: 'error'; message: string };

let encoder: FountainEncoder | null = null;
let version = 1;
let level: ErrorCorrectionLevel = 'L';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<BroadcastRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'start') {
      encoder = new FountainEncoder(message.session, new Uint8Array(message.source), message.meta);
      version = message.version;
      level = message.level;
      post({ type: 'ready', blockCount: message.meta.blockCount, version });
      return;
    }

    if (message.type === 'stop') {
      encoder = null;
      return;
    }

    if (!encoder) return;

    const frames: BroadcastFrame[] = [];
    const transfer: ArrayBuffer[] = [];
    for (let i = 0; i < message.count; i++) {
      const frame = encoder.next();
      const matrix = encodeMatrix(frame.bytes, version, level);
      frames.push({
        index: frame.index,
        seq: frame.seq,
        isMeta: frame.isMeta,
        size: matrix.size,
        data: matrix.data,
      });
      transfer.push(matrix.data.buffer as ArrayBuffer);
    }
    post({ type: 'frames', frames }, transfer);
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function post(message: BroadcastResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}
