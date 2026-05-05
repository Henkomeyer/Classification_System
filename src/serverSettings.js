import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.join(rootDirectory, "data");
const settingsPath = path.join(dataDirectory, "server.json");

export const defaultServerConfig = {
  host: "0.0.0.0",
  port: 3000
};

function normalizeHost(value) {
  return String(value ?? defaultServerConfig.host).trim() || defaultServerConfig.host;
}

function normalizePort(value) {
  const port = Number(value ?? defaultServerConfig.port);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : defaultServerConfig.port;
}

export function normalizeServerConfig(config = {}) {
  return {
    host: normalizeHost(config.host),
    port: normalizePort(config.port)
  };
}

export function validateServerConfig(config = {}) {
  const host = normalizeHost(config.host);
  const port = Number(config.port);

  if (/^https?:\/\//i.test(host)) {
    throw new Error("Enter only the bind IP or hostname, for example 0.0.0.0 or 192.168.1.50.");
  }

  if (host.includes("/") || /\s/.test(host)) {
    throw new Error("Bind IP/host cannot contain spaces or URL paths.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be a whole number between 1 and 65535.");
  }

  return {
    host,
    port
  };
}

export async function loadSavedServerConfig() {
  try {
    const content = await readFile(settingsPath, "utf8");
    return normalizeServerConfig(JSON.parse(content));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return { ...defaultServerConfig };
  }
}

export async function loadServerConfig() {
  const saved = await loadSavedServerConfig();
  return normalizeServerConfig({
    ...saved,
    host: process.env.HOST ?? saved.host,
    port: process.env.PORT ?? saved.port
  });
}

export async function saveServerConfig(config) {
  const normalized = validateServerConfig(config);

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}

export async function buildServerConfigPayload(activeConfig) {
  const saved = await loadSavedServerConfig();
  const nextStart = await loadServerConfig();
  const active = normalizeServerConfig(activeConfig);
  const restartRequired = active.host !== nextStart.host || active.port !== nextStart.port;

  return {
    active,
    saved,
    nextStart,
    restartRequired,
    envOverrides: {
      host: process.env.HOST != null,
      port: process.env.PORT != null
    }
  };
}
