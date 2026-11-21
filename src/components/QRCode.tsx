import { QRCodeSVG } from "qrcode.react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

const QRCodeDisplay = ({ value, size = 180 }: QRCodeDisplayProps) => {
  return (
    <div className="inline-flex items-center justify-center rounded-xl bg-card p-4 border">
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="transparent"
        fgColor="hsl(var(--foreground))"
        level="M"
      />
    </div>
  );
};

export default QRCodeDisplay;
