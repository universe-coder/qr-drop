/**
 * Сессия приёма: разбирает кадры, следит за сменой сессии, копит кадры данных
 * до прихода META и проверяет целостность собранного файла.
 *
 * Канал односторонний: попросить повторить кадр нельзя, поэтому вся логика
 * здесь — «принять всё, что дали, и понять, когда хватит».
 */
import { FountainDecoder, PushResult, type DecoderOptions } from './decoder';
import { parseFrame } from './frames';
import { FrameType, ParseError, type FileMeta } from './types';

export const ReceiveOutcome = {
  /** Данные не похожи на кадр протокола (чужой QR, шум). */
  NotOurs: 'not-ours',
  /** Кадр битый: не сошёлся CRC или структура. */
  Corrupt: 'corrupt',
  /** Первый META — сессия началась. */
  Started: 'started',
  /** Кадр принят и продвинул сборку. */
  Progress: 'progress',
  /** Кадр корректен, но нового не дал. */
  Redundant: 'redundant',
  /** Кадр данных пришёл раньше META и отложен. */
  Buffered: 'buffered',
  /** Все блоки собраны. */
  Complete: 'complete',
  /** Кадр из другой передачи. */
  ForeignSession: 'foreign-session',
  /** Отправитель работает на другой версии расписания кадров. */
  Incompatible: 'incompatible',
} as const;

export type ReceiveOutcome = (typeof ReceiveOutcome)[keyof typeof ReceiveOutcome];

export interface ReceiveStats {
  /** Кадров успешно распознано с начала приёма. */
  framesAccepted: number;
  /** Кадров отброшено из-за CRC/структуры. */
  framesCorrupt: number;
  /** Повторов и бесполезных кадров. */
  framesRedundant: number;
  /** Восстановлено исходных блоков. */
  blocksRecovered: number;
  /** Всего исходных блоков (0, пока не пришла META). */
  blockCount: number;
  /** Байт полезных данных собрано. */
  bytesRecovered: number;
  /** Всего байт в файле (0, пока не пришла META). */
  bytesTotal: number;
}

export interface ReceiveEvent {
  outcome: ReceiveOutcome;
  stats: ReceiveStats;
}

const MAX_BUFFERED_BEFORE_META = 128;

export class ReceiverSession {
  private decoder: FountainDecoder | null = null;
  private session: number | null = null;
  private buffered: Array<{ session: number; seq: number; payload: Uint8Array }> = [];
  private options: DecoderOptions;
  private integrityFailures = 0;

  private framesAccepted = 0;
  private framesCorrupt = 0;
  private framesRedundant = 0;

  constructor(options: DecoderOptions = {}) {
    this.options = options;
  }

  get meta(): FileMeta | null {
    return this.decoder?.meta ?? null;
  }

  get isComplete(): boolean {
    return this.decoder?.isComplete ?? false;
  }

  get sessionId(): number | null {
    return this.session;
  }

  /** Скармливает сырые байты одного распознанного QR-кода. */
  accept(bytes: Uint8Array): ReceiveEvent {
    const parsed = parseFrame(bytes);

    if (!parsed.ok) {
      // Чужой QR — не наша ошибка и не повод пугать пользователя счётчиком.
      if (parsed.error === ParseError.BadMagic || parsed.error === ParseError.TooShort) {
        return this.event(ReceiveOutcome.NotOurs);
      }
      if (
        parsed.error === ParseError.ScheduleMismatch ||
        parsed.error === ParseError.BadVersion
      ) {
        return this.event(ReceiveOutcome.Incompatible);
      }
      this.framesCorrupt++;
      return this.event(ReceiveOutcome.Corrupt);
    }

    const frame = parsed.frame;

    if (frame.type === FrameType.Meta) {
      if (this.session === null) {
        this.session = frame.session;
        this.decoder = new FountainDecoder(frame.meta, this.options);
        this.framesAccepted++;
        this.drainBuffered();
        return this.event(this.isComplete ? ReceiveOutcome.Complete : ReceiveOutcome.Started);
      }
      if (frame.session !== this.session) return this.event(ReceiveOutcome.ForeignSession);
      this.framesAccepted++;
      return this.event(ReceiveOutcome.Redundant);
    }

    if (this.session === null) {
      // META ещё не поймали: копим кадры, чтобы не терять первые секунды съёмки.
      if (this.buffered.length < MAX_BUFFERED_BEFORE_META) {
        this.buffered.push({ session: frame.session, seq: frame.seq, payload: frame.payload });
      }
      return this.event(ReceiveOutcome.Buffered);
    }

    if (frame.session !== this.session) return this.event(ReceiveOutcome.ForeignSession);

    this.framesAccepted++;
    const result = this.decoder!.push(frame.seq, frame.payload);
    if (result !== PushResult.Useful) this.framesRedundant++;

    if (this.decoder!.isComplete) return this.event(ReceiveOutcome.Complete);
    return this.event(result === PushResult.Useful ? ReceiveOutcome.Progress : ReceiveOutcome.Redundant);
  }

  private drainBuffered(): void {
    const pending = this.buffered;
    this.buffered = [];
    for (const item of pending) {
      // Отложенные кадры могли прийти из чужой передачи, которая шла рядом:
      // теперь, когда сессия известна, лишнее надо отбросить, а не смешать.
      if (item.session !== this.session) continue;
      const result = this.decoder!.push(item.seq, item.payload);
      this.framesAccepted++;
      if (result !== PushResult.Useful) this.framesRedundant++;
    }
  }

  /**
   * Собирает файл и сверяет SHA-256.
   *
   * Если хэш не сошёлся, значит сквозь CRC проскочил повреждённый кадр и он
   * успел отравить сразу несколько блоков — какой именно, по хэшу не понять.
   * Тогда сборка обнуляется, но сессия сохраняется: фонтан всё ещё идёт, и
   * достаточно просто продолжить снимать. Второй промах подряд — это уже не
   * случайность, и передачу надо начинать заново.
   */
  async finish(): Promise<Uint8Array | null> {
    if (!this.decoder?.isComplete) throw new Error('receive session is not complete');
    const meta = this.decoder.meta;
    const data = this.decoder.assemble();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice().buffer));

    let equal = true;
    for (let i = 0; i < 32; i++) equal &&= digest[i] === meta.hash[i];
    if (equal) return data;

    this.integrityFailures++;
    if (this.integrityFailures < 2) this.decoder = new FountainDecoder(meta, this.options);
    return null;
  }

  /** Можно ли продолжать приём после несошедшегося хэша. */
  get canRetry(): boolean {
    return this.integrityFailures < 2;
  }

  /** Полный сброс — например, когда пользователь начинает новый приём. */
  reset(): void {
    this.decoder = null;
    this.session = null;
    this.buffered = [];
    this.integrityFailures = 0;
    this.framesAccepted = 0;
    this.framesCorrupt = 0;
    this.framesRedundant = 0;
  }

  stats(): ReceiveStats {
    const meta = this.decoder?.meta;
    const recovered = this.decoder?.recovered ?? 0;
    return {
      framesAccepted: this.framesAccepted,
      framesCorrupt: this.framesCorrupt,
      framesRedundant: this.framesRedundant,
      blocksRecovered: recovered,
      blockCount: meta?.blockCount ?? 0,
      bytesRecovered: meta ? Math.min(meta.size, recovered * meta.blockSize) : 0,
      bytesTotal: meta?.size ?? 0,
    };
  }

  private event(outcome: ReceiveOutcome): ReceiveEvent {
    return { outcome, stats: this.stats() };
  }
}
