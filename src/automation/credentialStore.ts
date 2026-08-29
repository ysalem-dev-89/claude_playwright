import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface StoredCredential {
  email: string;
  password: string;
  createdAt: string;
}

const STORE_PATH = path.resolve(process.cwd(), "data", "workday-credentials.json");

/**
 * Demo-grade local credential store, keyed by target hostname so different employers'
 * Workday tenants ("nextracker.wd5.myworkdayjobs.com", "someoneelse.wd1.myworkdayjobs.com", ...)
 * never share an account. Plaintext JSON on disk — fine for a local dev demo you run yourself,
 * NOT how you'd store real candidate credentials in production (use an OS keychain / secrets
 * manager for that). The file is gitignored; never commit it.
 */
function readStore(): Record<string, StoredCredential> {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredCredential>): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getCredential(hostname: string): StoredCredential | undefined {
  return readStore()[hostname];
}

export function saveCredential(hostname: string, email: string, password: string): StoredCredential {
  const store = readStore();
  const credential: StoredCredential = { email, password, createdAt: new Date().toISOString() };
  store[hostname] = credential;
  writeStore(store);
  return credential;
}

/** A password we generate ourselves for first-time signup — never asks the user to supply one. */
export function generatePassword(): string {
  const symbols = "!@#$%^&*";
  const random = crypto.randomBytes(12).toString("base64url");
  const symbol = symbols[crypto.randomInt(symbols.length)];
  return `Aa1${symbol}${random}`;
}
