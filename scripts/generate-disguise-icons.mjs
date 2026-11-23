// Renders the app-disguise icons in resources/disguise/*.svg into the iOS and Android projects.
//
//   npm install --no-save @resvg/resvg-js@2.6.2
//   node scripts/generate-disguise-icons.mjs
//
// Each SVG has a full-bleed #background and a #glyph kept inside the central 61% so it
// survives Android's adaptive-icon mask. iOS gets the whole artwork (it rounds the corners
// itself); Android gets an adaptive icon (glyph over the background) plus legacy PNGs.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const { Resvg } = await import(process.env.RESVG_PATH ?? "@resvg/resvg-js");

const DISGUISES = ["calculator", "notes", "weather"];
const ROOT = new URL("..", import.meta.url).pathname;
const RES = join(ROOT, "android/app/src/main/res");
const ASSETS = join(ROOT, "ios/App/App/Assets.xcassets");
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const render = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
const withoutBackground = (svg) => svg.replace(/<rect id="background"[^>]*\/>/, "");
const roundedLegacy = (svg) =>
  svg
    .replace("<svg ", '<svg clip-path="url(#round)" ')
    .replace("<defs>", '<defs><clipPath id="round"><rect width="1024" height="1024" rx="180"/></clipPath>');

for (const name of DISGUISES) {
  const svg = readFileSync(join(ROOT, "resources/disguise", `${name}.svg`), "utf8");
  const resName = `ic_disguise_${name}`;

  // iOS alternate icon: AppIcon-<Name>.appiconset with a single 1024px image.
  const iconSet = join(ASSETS, `AppIcon-${name[0].toUpperCase()}${name.slice(1)}.appiconset`);
  mkdirSync(iconSet, { recursive: true });
  writeFileSync(join(iconSet, "icon-1024.png"), render(svg, 1024));
  writeFileSync(
    join(iconSet, "Contents.json"),
    JSON.stringify(
      { images: [{ filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }], info: { author: "xcode", version: 1 } },
      null,
      2
    ) + "\n"
  );

  // Android legacy (pre-8.0) launcher PNGs and adaptive-icon foregrounds.
  for (const [density, size] of Object.entries(LEGACY)) {
    mkdirSync(join(RES, `mipmap-${density}`), { recursive: true });
    writeFileSync(join(RES, `mipmap-${density}`, `${resName}.png`), render(roundedLegacy(svg), size));
    writeFileSync(join(RES, `mipmap-${density}`, `${resName}_foreground.png`), render(withoutBackground(svg), FOREGROUND[density]));
    writeFileSync(join(RES, `mipmap-${density}`, `${resName}_background.png`), render(svg.replace(/<g id="glyph">[\s\S]*<\/g>\s*<\/svg>/, "</svg>"), FOREGROUND[density]));
  }
  mkdirSync(join(RES, "mipmap-anydpi-v26"), { recursive: true });
  writeFileSync(
    join(RES, "mipmap-anydpi-v26", `${resName}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${resName}_background"/>
    <foreground android:drawable="@mipmap/${resName}_foreground"/>
</adaptive-icon>
`
  );
  console.log(`✓ ${name}`);
}
