import * as readline from 'readline/promises';
import { promises as fs } from 'fs';
import path from 'path';

// =============================================================================
// COLOR CONVERSION UTILITIES
// =============================================================================

/** Convert hex color (#RRGGBB) to { h, s, l } */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Format HSL as CSS custom property value: "H S% L%" */
function hslStr(hsl: { h: number; s: number; l: number }): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

/** Auto-adjust lightness for dark mode */
function darkAdjust(hsl: { h: number; s: number; l: number }, type: 'bg' | 'fg' | 'brand'): string {
  let { h, s, l } = hsl;
  if (type === 'bg') l = Math.max(5, 100 - l);
  else if (type === 'fg') return '0 0% 100%'; // foreground always white (for button text)
  else l = Math.min(65, l + 10); // brand colors: slightly brighter
  return `${h} ${s}% ${l}%`;
}

// =============================================================================
// PROMPT UTILITIES
// =============================================================================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function prompt(message: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal !== undefined ? ` (${defaultVal})` : '';
  const answer = await rl.question(`  ${message}${suffix}: `);
  return answer.trim() || defaultVal || '';
}

async function confirm(message: string, defaultVal = false): Promise<boolean> {
  const suffix = defaultVal ? ' (Y/n)' : ' (y/N)';
  const answer = await rl.question(`  ${message}${suffix}: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultVal;
  return trimmed === 'y' || trimmed === 'yes';
}

async function pickOne(message: string, options: string[], defaultIdx = 0): Promise<string> {
  console.log(`  ${message}`);
  options.forEach((opt, i) => {
    const marker = i === defaultIdx ? '>' : ' ';
    console.log(`    ${marker} ${i + 1}. ${opt}`);
  });
  const answer = await rl.question(`  Choice (${defaultIdx + 1}): `);
  const idx = parseInt(answer.trim()) - 1;
  return options[idx >= 0 && idx < options.length ? idx : defaultIdx];
}

// =============================================================================
// FILE REWRITERS
// =============================================================================

interface ColorConfig {
  primary: string;
  secondary: string;
  accent: string;
  radius: string;
}

interface FeatureConfig {
  zapsEnabled: boolean;
  longFormEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  latestSection: 'episode' | 'article' | 'post' | 'auto';
  recentSection: 'episode' | 'article' | 'post' | 'auto';
}

interface PodcastMeta {
  title: string;
  author: string;
  description: string;
  email: string;
  website: string;
  creatorNpub: string;
  image: string;
}

interface SetupConfig {
  colors: ColorConfig;
  features: FeatureConfig;
  podcast?: PodcastMeta;
}

async function rewriteCSS(colors: ColorConfig): Promise<void> {
  const cssPath = path.resolve('src/index.css');
  let css = await fs.readFile(cssPath, 'utf-8');

  const primary = hexToHsl(colors.primary);
  const secondary = hexToHsl(colors.secondary);
  const accent = hexToHsl(colors.accent);

  // Light mode (:root)
  const lightVars: Record<string, string> = {
    '--primary': hslStr(primary),
    '--primary-foreground': darkAdjust(primary, 'fg'),
    '--secondary': hslStr(secondary),
    '--secondary-foreground': darkAdjust(secondary, 'fg'),
    '--accent': hslStr(accent),
    '--accent-foreground': darkAdjust(accent, 'fg'),
    '--ring': hslStr(primary),
    '--radius': `${parseFloat(colors.radius) / 16}rem`,
  };

  // Dark mode (.dark)
  const darkVars: Record<string, string> = {
    '--primary': darkAdjust(primary, 'brand'),
    '--primary-foreground': '0 0% 100%',
    '--secondary': darkAdjust(secondary, 'brand'),
    '--secondary-foreground': '0 0% 100%',
    '--accent': darkAdjust(accent, 'brand'),
    '--accent-foreground': '0 0% 100%',
    '--ring': darkAdjust(primary, 'brand'),
  };

  // Replace light mode vars in :root block
  for (const [varName, value] of Object.entries(lightVars)) {
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    css = css.replace(
      new RegExp(`(${escaped}:\\s*)[^;]+(;)`),
      `$1${value}$2`
    );
  }

  // Replace dark mode vars — find the .dark block and replace within it
  const darkMatch = css.match(/\.dark\s*\{([^}]+)\}/s);
  if (darkMatch) {
    let darkBlock = darkMatch[1];
    for (const [varName, value] of Object.entries(darkVars)) {
      const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      darkBlock = darkBlock.replace(
        new RegExp(`(${escaped}:\\s*)[^;]+(;)`),
        `$1${value}$2`
      );
    }
    css = css.replace(/\.dark\s*\{[^}]+\}/s, `.dark {${darkBlock}}`);
  }

  await fs.writeFile(cssPath, css, 'utf-8');
  console.log('  ✅ Updated src/index.css (colors)');
}

async function rewriteAppConfig(features: FeatureConfig): Promise<void> {
  const appPath = path.resolve('src/App.tsx');
  let content = await fs.readFile(appPath, 'utf-8');

  // Replace the defaultConfig object
  content = content.replace(
    /const defaultConfig: AppConfig = \{[\s\S]*?\};/,
    `const defaultConfig: AppConfig = {
  theme: "${features.theme}",
  relayUrl: "wss://relay.ditto.pub",
  zapsEnabled: ${features.zapsEnabled},
  longFormEnabled: ${features.longFormEnabled},
  latestSection: "${features.latestSection}",
  recentSection: "${features.recentSection}",
};`
  );

  await fs.writeFile(appPath, content, 'utf-8');
  console.log('  ✅ Updated src/App.tsx (feature flags & home sections)');
}

async function rewritePodcastConfig(meta: PodcastMeta): Promise<void> {
  const configPath = path.resolve('src/lib/podcastConfig.ts');
  let content = await fs.readFile(configPath, 'utf-8');

  const replacements: Array<[RegExp, string]> = [
    [/creatorNpub: "[^"]*"/, `creatorNpub: "${meta.creatorNpub}"`],
    [/\btitle: "[^"]*",?\s*$/, `title: "${meta.title}",`],
    [/\bdescription: "[^"]*",?\s*$/, `description: "${meta.description}",`],
    [/\bauthor: "[^"]*",?\s*$/, `author: "${meta.author}",`],
    [/\bemail: "[^"]*",?\s*$/, `email: "${meta.email}",`],
    [/\bwebsite: "[^"]*",?\s*$/, `website: "${meta.website}",`],
    [/\bimage: "[^"]*",?\s*$/, `image: "${meta.image}",`],
    [/copyright: "[^"]*",?\s*$/, `copyright: "@${new Date().getFullYear()} ${meta.author}",`],
    [/\bpublisher: "[^"]*",?\s*$/, `publisher: "${meta.author}",`],
  ];

  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  await fs.writeFile(configPath, content, 'utf-8');
  console.log('  ✅ Updated src/lib/podcastConfig.ts (metadata)');
}

async function writeConfigSnapshot(config: SetupConfig): Promise<void> {
  const snapshotPath = path.resolve('podstr.config.json');
  await fs.writeFile(snapshotPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`  ✅ Saved config snapshot to ${snapshotPath}`);
}

async function readConfigSnapshot(): Promise<SetupConfig | null> {
  const snapshotPath = path.resolve('podstr.config.json');
  try {
    const data = await fs.readFile(snapshotPath, 'utf-8');
    return JSON.parse(data) as SetupConfig;
  } catch {
    return null;
  }
}

// =============================================================================
// INTERACTIVE PROMPTS
// =============================================================================

/** Default config values used when no previous snapshot exists */
const HARD_DEFAULTS: SetupConfig = {
  colors: {
    primary: '#2952CC',
    secondary: '#1B9E4B',
    accent: '#6D3FC0',
    radius: '12',
  },
  features: {
    zapsEnabled: false,
    longFormEnabled: true,
    theme: 'light',
    latestSection: 'auto',
    recentSection: 'episode',
  },
  podcast: {
    title: 'My Podcast',
    author: 'Podcaster',
    description: 'A podcast powered by Podstr',
    email: 'hello@example.com',
    website: 'https://example.com',
    creatorNpub: 'npub1...',
    image: 'https://example.com/cover.png',
  },
};

async function promptColors(prev?: ColorConfig): Promise<ColorConfig> {
  console.log('\n🎨  Color Configuration');
  console.log('   Enter hex colors or press Enter to keep current values.\n');

  const primary = await prompt('Primary color (hex)', prev?.primary || HARD_DEFAULTS.colors.primary);
  const secondary = await prompt('Secondary color (hex)', prev?.secondary || HARD_DEFAULTS.colors.secondary);
  const accent = await prompt('Accent color (hex)', prev?.accent || HARD_DEFAULTS.colors.accent);
  const radius = await prompt('Border radius (px)', prev?.radius || HARD_DEFAULTS.colors.radius);

  return { primary, secondary, accent, radius };
}

async function promptFeatures(prev?: FeatureConfig): Promise<FeatureConfig> {
  const p = prev || HARD_DEFAULTS.features;

  console.log('\n⚙️  Feature Flags\n');

  const zapsEnabled = await confirm('Enable Lightning zaps?', p.zapsEnabled);
  const longFormEnabled = await confirm('Enable long-form articles?', p.longFormEnabled);

  const themeIdx = ['light', 'dark', 'system'].indexOf(p.theme);
  const theme = await pickOne('Default theme:', ['light', 'dark', 'system'], themeIdx >= 0 ? themeIdx : 0) as FeatureConfig['theme'];

  console.log('\n📋  Home Page Sections\n');
  console.log('  The "Latest" section shows a hero card. The "Recent" section shows a list.');

  const latestOptions = ['auto', 'episode', 'article', 'social post'];
  const latestDisplay = p.latestSection === 'post' ? 'social post' : p.latestSection;
  const latestIdx = latestOptions.indexOf(latestDisplay);
  const latestChoice = await pickOne(
    'Latest section content (auto = whichever is newest):',
    latestOptions,
    latestIdx >= 0 ? latestIdx : 0
  );
  const latestSection = (latestChoice === 'social post' ? 'post' : latestChoice) as FeatureConfig['latestSection'];

  const recentOptions = ['episode', 'article', 'social post', 'auto'];
  const recentDisplay = p.recentSection === 'post' ? 'social post' : p.recentSection;
  const recentIdx = recentOptions.indexOf(recentDisplay);
  const recentChoice = await pickOne(
    'Recent section content:',
    recentOptions,
    recentIdx >= 0 ? recentIdx : 0
  );
  const recentSection = (recentChoice === 'social post' ? 'post' : recentChoice) as FeatureConfig['recentSection'];

  return { zapsEnabled, longFormEnabled, theme, latestSection, recentSection };
}

async function promptPodcastMeta(prev?: PodcastMeta): Promise<PodcastMeta | undefined> {
  const p = prev || HARD_DEFAULTS.podcast;

  console.log('\n📻  Podcast Metadata');
  const doConfig = await confirm('Configure podcast metadata?', false);
  if (!doConfig) return undefined;

  console.log('');
  const title = await prompt('Podcast title', p.title);
  const author = await prompt('Author name', p.author);
  const description = await prompt('Description', p.description);
  const email = await prompt('Contact email', p.email);
  const website = await prompt('Website URL', p.website);
  const creatorNpub = await prompt('Creator npub', p.creatorNpub);
  const image = await prompt('Cover art URL', p.image);

  return { title, author, description, email, website, creatorNpub, image };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const nonInteractive = args.includes('--non-interactive');

  console.log('\n🚀 Podstr Setup\n');

  let config: SetupConfig;

  if (nonInteractive) {
    const snapshot = await readConfigSnapshot();
    if (!snapshot) {
      console.error('❌ No podstr.config.json found. Run interactively first.');
      process.exit(1);
    }
    config = snapshot;
    console.log('📄 Loaded config from podstr.config.json');
  } else {
    // Load previous config as defaults (if any)
    const prev = await readConfigSnapshot();
    if (prev) {
      console.log('📄 Found previous config — using your past answers as defaults.');
    }

    const colors = await promptColors(prev?.colors);
    const features = await promptFeatures(prev?.features);
    const podcast = await promptPodcastMeta(prev?.podcast);
    config = { colors, features, podcast };
  }

  console.log('\n📝 Applying configuration...\n');

  await rewriteCSS(config.colors);
  await rewriteAppConfig(config.features);
  if (config.podcast) await rewritePodcastConfig(config.podcast);
  await writeConfigSnapshot(config);

  rl.close();

  console.log('\n🎉 Setup complete! Run `npm run build` to build your site.\n');
}

main().catch((err) => {
  console.error('❌ Setup failed:', err);
  rl.close();
  process.exit(1);
});
