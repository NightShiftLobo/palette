import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../palette.source.json", import.meta.url);
const outputPath = new URL("../palette.json", import.meta.url);

const flavorOrder = ["eclipse", "shadow", "obsidian", "dawn"];

const flavorMeta = {
  eclipse: {
    name: "Eclipse",
    emoji: "🌑",
    contrast: "low",
    description: "Lowest-luminance dark flavour for maximum ambient suppression.",
  },
  shadow: {
    name: "Shadow",
    emoji: "🌘",
    contrast: "medium",
    description: "Balanced dark flavour with slightly lifted surfaces and accents.",
  },
  obsidian: {
    name: "Obsidian",
    emoji: "🌒",
    contrast: "high",
    description: "Highest-contrast dark flavour with the clearest separation of layers.",
  },
  dawn: {
    name: "Dawn",
    emoji: "🌅",
    contrast: "light",
    description: "Light flavour tuned to retain NightShift Lobo's muted precision.",
  },
};

const colorSpecs = [
  { key: "bg_0", name: "Background 0", accent: false, category: "surface" },
  { key: "bg_1", name: "Background 1", accent: false, category: "surface" },
  { key: "bg_2", name: "Background 2", accent: false, category: "surface" },
  { key: "bg_3", name: "Background 3", accent: false, category: "surface" },
  { key: "bg_4", name: "Background 4", accent: false, category: "surface" },
  { key: "border", name: "Border", accent: false, category: "surface" },
  {
    key: "fg_primary",
    name: "Foreground Primary",
    accent: false,
    category: "foreground",
  },
  {
    key: "fg_secondary",
    name: "Foreground Secondary",
    accent: false,
    category: "foreground",
  },
  {
    key: "fg_muted",
    name: "Foreground Muted",
    accent: false,
    category: "foreground",
  },
  { key: "comment", name: "Comment", accent: false, category: "foreground" },
  { key: "blue", name: "Blue", accent: true, category: "accent" },
  {
    key: "blue_soft",
    name: "Blue Soft",
    accent: true,
    category: "accent",
    variantOf: "blue",
  },
  { key: "cyan", name: "Cyan", accent: true, category: "accent" },
  { key: "teal", name: "Teal", accent: true, category: "accent" },
  { key: "green", name: "Green", accent: true, category: "accent" },
  { key: "yellow", name: "Yellow", accent: true, category: "accent" },
  { key: "orange", name: "Orange", accent: true, category: "accent" },
  { key: "red", name: "Red", accent: true, category: "accent" },
  { key: "purple", name: "Purple", accent: true, category: "accent" },
  {
    key: "selection",
    name: "Selection",
    accent: false,
    category: "utility",
  },
  { key: "cursor", name: "Cursor", accent: false, category: "utility" },
  {
    key: "success",
    name: "Success",
    accent: false,
    category: "semantic",
    aliasOf: "green",
  },
  {
    key: "warning",
    name: "Warning",
    accent: false,
    category: "semantic",
    aliasOf: "yellow",
  },
  {
    key: "error",
    name: "Error",
    accent: false,
    category: "semantic",
    aliasOf: "red",
  },
  {
    key: "info",
    name: "Info",
    accent: false,
    category: "semantic",
    aliasOf: "blue",
  },
  {
    key: "diff_add",
    name: "Diff Add",
    accent: false,
    category: "semantic",
  },
];

const ansiMappings = {
  black: { code: 0 },
  red: { code: 1, mapping: "red" },
  green: { code: 2, mapping: "green" },
  yellow: { code: 3, mapping: "yellow" },
  blue: { code: 4, mapping: "blue" },
  magenta: { code: 5, mapping: "purple" },
  cyan: { code: 6, mapping: "cyan" },
  white: { code: 7 },
};

const groupKeys = {
  surface: "surfaces",
  foreground: "foregrounds",
  accent: "accents",
  utility: "utilities",
  semantic: "semantics",
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex) => {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
};

const componentToHex = (value) => value.toString(16).padStart(2, "0");

const rgbToHex = ({ r, g, b }) =>
  `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`.toUpperCase();

const rgbToHsl = ({ r, g, b }) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case red:
        h = 60 * (((green - blue) / delta) % 6);
        break;
      case green:
        h = 60 * ((blue - red) / delta + 2);
        break;
      default:
        h = 60 * ((red - green) / delta + 4);
        break;
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s,
    l,
  };
};

const hueToRgb = (p, q, t) => {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
};

const hslToRgb = ({ h, s, l }) => {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  };
};

const brightenHex = (hex, dark) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  const bright = {
    h: (hsl.h + 2) % 360,
    s: clamp(hsl.s + (dark ? 0.05 : 0.03)),
    l: clamp(hsl.l + (dark ? 0.08 : 0.06)),
  };

  return rgbToHex(hslToRgb(bright));
};

const buildColorRecord = (spec, hex, order, baseColors) => {
  const rgb = hexToRgb(hex);
  const color = {
    name: spec.name,
    order,
    hex,
    rgb,
    hsl: rgbToHsl(rgb),
    accent: spec.accent,
    category: spec.category,
  };

  if (spec.aliasOf && baseColors[spec.aliasOf] === hex) {
    color.aliasOf = spec.aliasOf;
  }

  if (spec.variantOf) {
    color.variantOf = spec.variantOf;
  }

  return color;
};

const buildAnsiColors = (flavor) =>
  Object.entries(ansiMappings).reduce((accumulator, [ansiName, config], order) => {
    const normalName = ansiName.charAt(0).toUpperCase() + ansiName.slice(1);
    const brightName = `Bright ${normalName}`;

    let normalHex;
    let brightHex;

    if (ansiName === "black") {
      if (flavor.dark) {
        normalHex = flavor.rawColors.bg_3;
        brightHex = flavor.rawColors.bg_4;
      } else {
        normalHex = flavor.rawColors.fg_secondary;
        brightHex = flavor.rawColors.fg_muted;
      }
    } else if (ansiName === "white") {
      if (flavor.dark) {
        normalHex = flavor.rawColors.fg_muted;
        brightHex = flavor.rawColors.fg_secondary;
      } else {
        normalHex = flavor.rawColors.bg_4;
        brightHex = flavor.rawColors.bg_3;
      }
    } else {
      normalHex = flavor.rawColors[config.mapping];
      brightHex = brightenHex(normalHex, flavor.dark);
    }

    const normalRgb = hexToRgb(normalHex);
    const brightRgb = hexToRgb(brightHex);

    accumulator[ansiName] = {
      name: normalName,
      order,
      normal: {
        name: normalName,
        hex: normalHex,
        rgb: normalRgb,
        hsl: rgbToHsl(normalRgb),
        code: config.code,
      },
      bright: {
        name: brightName,
        hex: brightHex,
        rgb: brightRgb,
        hsl: rgbToHsl(brightRgb),
        code: config.code + 8,
      },
    };

    return accumulator;
  }, {});

const buildGroups = () =>
  colorSpecs.reduce((accumulator, spec) => {
    const groupKey = groupKeys[spec.category];
    accumulator[groupKey] ??= [];
    accumulator[groupKey].push(spec.key);
    return accumulator;
  }, {});

const main = async () => {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));

  const flavours = flavorOrder.reduce((accumulator, flavorKey, order) => {
    const rawFlavor = source.flavours[flavorKey];
    const meta = flavorMeta[flavorKey];

    if (!rawFlavor) {
      throw new Error(`Missing flavour "${flavorKey}" in palette.source.json`);
    }

    const missingColors = colorSpecs
      .filter(({ key }) => !(key in rawFlavor.colors))
      .map(({ key }) => key);

    if (missingColors.length > 0) {
      throw new Error(
        `Missing colours in "${flavorKey}": ${missingColors.join(", ")}`,
      );
    }

    const colors = colorSpecs.reduce((colorAccumulator, spec, colorOrder) => {
      colorAccumulator[spec.key] = buildColorRecord(
        spec,
        rawFlavor.colors[spec.key],
        colorOrder,
        rawFlavor.colors,
      );
      return colorAccumulator;
    }, {});

    const flavor = {
      name: meta.name,
      emoji: meta.emoji,
      order,
      type: rawFlavor.type,
      dark: rawFlavor.type === "dark",
      contrast: meta.contrast,
      description: meta.description,
      colorOrder: colorSpecs.map(({ key }) => key),
      groups: buildGroups(),
      rawColors: rawFlavor.colors,
      colors,
    };

    flavor.ansiColors = buildAnsiColors({
      dark: flavor.dark,
      rawColors: rawFlavor.colors,
    });

    accumulator[flavorKey] = flavor;
    return accumulator;
  }, {});

  const output = {
    name: source.name,
    tagline: source.tagline,
    version: source.version,
    engine: source.engine,
    schema: "nightshift-lobo.palette/v2",
    generatedFrom: "./palette.source.json",
    flavourOrder: flavorOrder,
    flavours,
  };

  if (source.originalPalette) {
    output.originalPalette = source.originalPalette;
  }

  await writeFile(`${outputPath.pathname}`, `${JSON.stringify(output, null, 2)}\n`);
};

await main();
