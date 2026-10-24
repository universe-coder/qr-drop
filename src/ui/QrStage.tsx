/**
 * Полотно, на котором живёт поток QR-кодов.
 *
 * Здесь только раскладка: размер буфера подгоняет сам шаг отрисовки
 * (`fitCanvasToBox`), потому что запись в `canvas.width` стирает картинку,
 * и делать это со стороны разметки — значит регулярно показывать сканеру
 * белый квадрат.
 *
 * Код всегда чёрный на белом, независимо от темы: контраст здесь важнее
 * единообразия интерфейса.
 */
interface QrStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function QrStage({ canvasRef }: QrStageProps) {
  return (
    <div className="qr-stage">
      <canvas ref={canvasRef} className="qr-stage__canvas" />
    </div>
  );
}
