import { promises as fs } from "fs";
import os from "os";
import path from "path";

// The OS temp dir is the only writable location on Vercel's read-only
// filesystem, and works the same in local development.
const DIR = path.join(os.tmpdir(), "snowline-cache");

function safeName(key: string): string {
  return key.replace(/[^a-z0-9_.-]/gi, "_");
}

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function getJson<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(DIR, safeName(key) + ".json"), "utf8");
    const parsed = JSON.parse(raw) as { ts: number; value: T };
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    path.join(DIR, safeName(key) + ".json"),
    JSON.stringify({ ts: Date.now(), value }),
  );
}

export async function getBuffer(key: string, ttlMs: number): Promise<Buffer | null> {
  try {
    const f = path.join(DIR, safeName(key));
    const stat = await fs.stat(f);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return await fs.readFile(f);
  } catch {
    return null;
  }
}

export async function setBuffer(key: string, buf: Buffer): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(DIR, safeName(key)), buf);
}

export function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
