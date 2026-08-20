import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  '.git', '.next', '.turbo', '.wrangler', 'build', 'coverage', 'dist',
  'node_modules', 'out', 'target', 'vendor',
]);
const EXCLUDED_FILES = new Set([
  '.env', '.env.local', '.env.production', 'pnpm-lock.yaml', 'package-lock.json',
  'yarn.lock', 'bun.lock', 'bun.lockb',
]);
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.conf', '.cpp', '.cs', '.css', '.dockerfile', '.go', '.graphql',
  '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.kt', '.kts',
  '.md', '.mjs', '.php', '.properties', '.py', '.rb', '.rs', '.scss', '.sh',
  '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx', '.txt', '.vue', '.xml',
  '.yaml', '.yml',
]);
const IMPORTANT_NAMES = new Set([
  'action.yml', 'action.yaml', 'dockerfile', 'gemfile', 'go.mod', 'makefile',
  'package.json', 'pom.xml', 'pyproject.toml', 'requirements.txt', 'tsconfig.json',
]);
const PER_FILE_LIMIT = 20_000;

function input(name, fallback = '') {
  const key = `INPUT_${name.replaceAll('-', '_').toUpperCase()}`;
  const value = process.env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function parseArguments(args) {
  const values = {};
  const supported = new Set([
    'model', 'language', 'ollama-host', 'output', 'max-input-bytes', 'instructions',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      values.help = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const separator = argument.indexOf('=');
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    if (!supported.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = separator === -1 ? args[++index] : argument.slice(separator + 1);
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }
    values[name] = value;
  }
  return values;
}

function printHelp() {
  process.stdout.write(`Ollama README Generator

Usage:
  node action/index.js [options]

Options:
  --model <name>             Ollama model (default: qwen3:8b)
  --language <language>      README language (default: English)
  --ollama-host <url>        Ollama base URL (default: http://127.0.0.1:11434)
  --output <path>            Output path (default: README.md)
  --max-input-bytes <number> Project bytes sent to Ollama (default: 120000)
  --instructions <text>      Additional generation instructions
  -h, --help                 Show this help
`);
}

function workflowCommand(name, value) {
  const escaped = String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  process.stdout.write(`::${name}::${escaped}\n`);
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
  } else {
    process.stdout.write(`${name}=${value}\n`);
  }
}

function isSecretLike(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase();
  const name = path.basename(normalized);
  return EXCLUDED_FILES.has(name)
    || name.startsWith('.env.')
    || /(^|\/)(id_rsa|id_ed25519|credentials|secrets?)(\.|$)/.test(normalized)
    || /\.(key|p12|pfx|pem)$/.test(name);
}

function isReadableProjectFile(relativePath) {
  const name = path.basename(relativePath).toLowerCase();
  if (name === 'readme.md' || isSecretLike(relativePath)) return false;
  return IMPORTANT_NAMES.has(name) || TEXT_EXTENSIONS.has(path.extname(name));
}

async function discoverFiles(root) {
  const found = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) await walk(absolute);
      } else if (entry.isFile() && isReadableProjectFile(relative)) {
        found.push(relative);
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => {
    const aImportant = IMPORTANT_NAMES.has(path.basename(a).toLowerCase()) ? 0 : 1;
    const bImportant = IMPORTANT_NAMES.has(path.basename(b).toLowerCase()) ? 0 : 1;
    return aImportant - bImportant || a.localeCompare(b);
  });
}

async function buildProjectContext(root, maxBytes) {
  const files = await discoverFiles(root);
  const sections = [];
  let used = 0;
  for (const relative of files) {
    const absolute = path.join(root, relative);
    const metadata = await stat(absolute);
    if (metadata.size > PER_FILE_LIMIT * 4) continue;
    const content = await readFile(absolute, 'utf8');
    if (content.includes('\u0000')) continue;
    const excerpt = content.slice(0, Math.min(PER_FILE_LIMIT, maxBytes - used));
    if (!excerpt) break;
    sections.push(`\n--- FILE: ${relative.replaceAll('\\', '/')} ---\n${excerpt}`);
    used += Buffer.byteLength(excerpt, 'utf8');
    if (used >= maxBytes) break;
  }
  if (sections.length === 0) throw new Error('No readable project files were found.');
  return { text: sections.join('\n'), fileCount: sections.length, bytes: used };
}

function stripMarkdownFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (match ? match[1] : trimmed).trim() + '\n';
}

async function generateReadme({ host, model, language, instructions, projectContext }) {
  const endpoint = new URL('/api/chat', host.endsWith('/') ? host : `${host}/`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [
        {
          role: 'system',
          content: [
            'You are a meticulous open-source documentation writer.',
            `Write the complete README in ${language}.`,
            'Return only Markdown, without an enclosing code fence.',
            'Base every claim, command, requirement, and example on the supplied project files.',
            'Do not invent repository URLs, badges, licenses, features, inputs, outputs, or installation steps.',
            'Include an overview, key features, requirements, setup, usage, project structure, development commands, and limitations when supported by the evidence.',
            'If the project is a GitHub Action, include inputs, outputs, permissions, and workflow examples supported by action metadata.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `${instructions ? `Additional instructions:\n${instructions}\n\n` : ''}Project files:\n${projectContext}`,
        },
      ],
    }),
  });

  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}: ${body?.error ?? raw.slice(0, 500)}`);
  }
  const content = body?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('Ollama returned an empty README.');
  }
  return stripMarkdownFence(content);
}

export async function run(args = []) {
  const cli = parseArguments(args);
  if (cli.help) {
    printHelp();
    return;
  }
  const root = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const model = cli.model ?? input('model', 'qwen3:8b');
  const language = cli.language ?? input('language', 'English');
  const host = cli['ollama-host'] ?? input('ollama-host', 'http://127.0.0.1:11434');
  const outputValue = cli.output ?? input('output', 'README.md');
  const instructions = cli.instructions ?? input('instructions');
  const maxBytes = Number.parseInt(cli['max-input-bytes'] ?? input('max-input-bytes', '120000'), 10);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_000 || maxBytes > 2_000_000) {
    throw new Error('max-input-bytes must be an integer between 1000 and 2000000.');
  }

  const outputPath = path.resolve(root, outputValue);
  const relativeOutput = path.relative(root, outputPath);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error('output must stay inside the checked-out repository.');
  }

  workflowCommand('notice', `Reading project files for a ${language} README`);
  const context = await buildProjectContext(root, maxBytes);
  process.stdout.write(`Prepared ${context.fileCount} files (${context.bytes} bytes) for ${model}.\n`);

  try {
    const readme = await generateReadme({
      host, model, language, instructions, projectContext: context.text,
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, readme, 'utf8');
  } catch (error) {
    if (error instanceof TypeError && /fetch|connect/i.test(error.message)) {
      throw new Error(`Could not connect to Ollama at ${host}. Start Ollama on this runner and pull model "${model}" first.`);
    }
    throw error;
  }

  await setOutput('path', relativeOutput.replaceAll('\\', '/'));
  await setOutput('model', model);
  await setOutput('language', language);
  workflowCommand('notice', `Generated ${relativeOutput} with ${model}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    workflowCommand('error', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
