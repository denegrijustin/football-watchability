// Builds the Chargers' two pictures from the supplied banner (scripts/art/chargers-banner.png):
//   public/logos/los-angeles-chargers.webp   the emblem (the winged donkey-unicorn, its rider and the lettering on their blue field), square, 128px
//   public/field-art/chargers.webp           the whole banner without the outer gold stripes, for the middle of the field in the simulator and on the cards
//
//   node scripts/chargers-art.mjs
//
// Record the logo in src/data/logo-sources.json with source "custom" so scripts/upgrade-logos.mjs never replaces it.
import sharp from "sharp";

const SRC = new URL("./art/chargers-banner.png", import.meta.url).pathname;
const LOGO = new URL("../public/logos/los-angeles-chargers.webp", import.meta.url).pathname;
const FIELD = new URL("../public/field-art/chargers.webp", import.meta.url).pathname;

const meta = await sharp(SRC).metadata();
console.log(`source ${meta.width}x${meta.height}`);

// The emblem: the lettering and the mascot, trimmed to a square-ish block of the blue field.
const emblem = { left: 360, top: 20, width: 890, height: 940 };
const logo = await sharp(SRC).extract(emblem).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(LOGO);
console.log(`los-angeles-chargers: ${logo.size} bytes`);

// The field art: the banner between the gold stripes, so it reads as a flag laid on the turf.
const banner = await sharp(SRC).extract({ left: 90, top: 0, width: 1428, height: meta.height }).resize({ width: 720 }).webp({ quality: 88 }).toFile(FIELD);
console.log(`field-art/chargers: ${banner.size} bytes, ${banner.width}x${banner.height}`);
