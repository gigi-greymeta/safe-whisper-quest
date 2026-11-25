import { QRCodeSVG } from "qrcode.react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

/**
 * Always dark modules on white with the standard 4-module quiet zone. Light-on-dark
 * or transparent codes (as in the dark theme) are unreadable to many scanners.
 */
const QRCodeDisplay = ({ value, size = 220 }: QRCodeDisplayProps) => {
  return (
    <div className="inline-flex items-center justify-center rounded-xl bg-white p-2 border">
      <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#000000" level="M" marginSize={4} />
    </div>
  );
};

export default QRCodeDisplay;
