import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { withPairedItem } from "@/sdk";

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed: string | undefined): () => number {
  if (seed && seed.length > 0) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return mulberry32(hash);
  }
  return mulberry32((Date.now() & 0x7fffffff) ^ (Math.random() * 0x7fffffff));
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

const FIRST_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
const STREETS = ["Main St", "Oak Ave", "Elm St", "Pine Rd", "Maple Dr", "Cedar Ln", "Birch Ct", "Walnut Way", "Cherry Blvd", "Spruce Cir"];
const CITIES = ["Springfield", "Riverside", "Greenville", "Fairview", "Madison", "Georgetown", "Salem", "Brookside", "Lakewood", "Clinton"];
const STATES = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA", "NC", "MI"];
const COUNTRIES = ["US", "CA", "UK", "DE", "FR", "JP", "AU", "BR", "IN", "MX"];

function generateAddress(rng: () => number): Record<string, unknown> {
  return {
    street: `${Math.floor(rng() * 9000 + 1000)} ${pick(rng, STREETS)}`,
    city: pick(rng, CITIES),
    state: pick(rng, STATES),
    zip: String(Math.floor(rng() * 90000 + 10000)),
    country: pick(rng, COUNTRIES),
  };
}

function generateCoordinates(rng: () => number): Record<string, unknown> {
  return {
    lat: +(rng() * 180 - 90).toFixed(6),
    lng: +(rng() * 360 - 180).toFixed(6),
  };
}

function generateCreditCard(rng: () => number): Record<string, unknown> {
  const prefixes = ["4", "51", "52", "53", "54", "55", "34", "37", "6011"];
  const prefix = pick(rng, prefixes);
  let num = prefix;
  while (num.length < 16) num += Math.floor(rng() * 10);
  const month = String(Math.floor(rng() * 12 + 1)).padStart(2, "0");
  const year = String(2025 + Math.floor(rng() * 5));
  return {
    number: num,
    cvv: String(Math.floor(rng() * 900 + 100)),
    expiry: `${month}/${year}`,
    issuer: prefix.startsWith("4") ? "Visa" : prefix.startsWith("5") ? "MasterCard" : prefix.startsWith("34") || prefix.startsWith("37") ? "Amex" : "Discover",
  };
}

function generateEmail(rng: () => number): Record<string, unknown> {
  const name = `${pick(rng, FIRST_NAMES).toLowerCase()}.${pick(rng, LAST_NAMES).toLowerCase()}${Math.floor(rng() * 999)}`;
  const domains = ["example.com", "test.org", "mail.net", "email.co", "web.io"];
  return {
    email: `${name}@${pick(rng, domains)}`,
  };
}

function generateIpv4(rng: () => number): Record<string, unknown> {
  return {
    ipv4: `${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}.${Math.floor(rng() * 256)}`,
  };
}

function generateIpv6(rng: () => number): Record<string, unknown> {
  const groups: string[] = [];
  for (let i = 0; i < 8; i++) {
    groups.push(Math.floor(rng() * 65536).toString(16).padStart(4, "0"));
  }
  return { ipv6: groups.join(":") };
}

function generateMac(rng: () => number): Record<string, unknown> {
  const octets: string[] = [];
  for (let i = 0; i < 6; i++) {
    octets.push(Math.floor(rng() * 256).toString(16).padStart(2, "0"));
  }
  return { mac: octets.join(":") };
}

function generateNanoid(rng: () => number, alphabet: string, length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return result;
}

function generateUrl(rng: () => number): Record<string, unknown> {
  const protocols = ["https", "http"];
  const tlds = ["com", "org", "net", "io", "dev"];
  return {
    url: `${pick(rng, protocols)}://${pick(rng, FIRST_NAMES).toLowerCase()}${pick(rng, LAST_NAMES).toLowerCase()}.${pick(rng, tlds)}/${Math.floor(rng() * 1000)}`,
  };
}

function generateUserData(rng: () => number): Record<string, unknown> {
  const age = Math.floor(rng() * 70 + 18);
  return {
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    age,
    email: `${pick(rng, FIRST_NAMES).toLowerCase()}${age}@example.com`,
    phone: `${Math.floor(rng() * 900 + 100)}-${Math.floor(rng() * 900 + 100)}-${Math.floor(rng() * 9000 + 1000)}`,
  };
}

function generateVersion(rng: () => number): Record<string, unknown> {
  return {
    version: `${Math.floor(rng() * 10)}.${Math.floor(rng() * 20)}.${Math.floor(rng() * 100)}`,
  };
}

export const debugHelperExecutor: NodeExecutor = async (ctx) => {
  const category = ctx.getParam<string>("category", "doNothing");
  const inputItems = ctx.getInputItems(0);

  if (category === "doNothing") {
    if (inputItems.length === 0) return [[{ json: {} }]];
    return [inputItems.map((item, idx) => withPairedItem(item, idx))];
  }

  if (category === "throwError") {
    const errorType = ctx.getParam<string>("errorType", "NodeApiError");
    const errorMessage = ctx.getParam<string>("errorMessage", "");

    if (ctx.continueOnFail()) {
      const msg = `[${errorType}] ${errorMessage || "Debug Helper error"}`;
      const out: INodeExecutionData[] = inputItems.map((item, idx) => ({
        json: { ...item.json, error: msg },
      }));
      return [out];
    }

    if (errorType === "NodeApiError") {
      const err = new Error(errorMessage || "NodeApiError");
      (err as Record<string, unknown>).errorType = "NodeApiError";
      throw err;
    }
    if (errorType === "NodeOperationError") {
      const err = new Error(errorMessage || "NodeOperationError");
      (err as Record<string, unknown>).errorType = "NodeOperationError";
      throw err;
    }
    throw new Error(errorMessage || "Error");
  }

  if (category === "outOfMemory") {
    const memorySize = ctx.getParam<number>("memorySize", 1);
    const bytes = Math.max(1, Math.round(memorySize * 1024 * 1024));
    const buffer = Buffer.alloc(bytes);
    buffer.fill(0);
    // Tie up the allocation so it isn't GC'd
    return [[{ json: { allocated: memorySize } }]];
  }

  if (category === "generateRandomData") {
    const dataType = ctx.getParam<string>("dataType", "address");
    const seed = ctx.getParam<string>("seed", "");
    const itemsToGenerate = Math.max(1, Math.floor(ctx.getParam<number>("itemsToGenerate", 1)));
    const outputAsSingleArray = ctx.getParam<boolean>("outputAsSingleArray", false);

    const rng = makeRng(seed);
    const items: INodeExecutionData[] = [];

    for (let i = 0; i < itemsToGenerate; i++) {
      let data: Record<string, unknown>;
      switch (dataType) {
        case "address":
          data = generateAddress(rng);
          break;
        case "coordinates":
          data = generateCoordinates(rng);
          break;
        case "creditCard":
          data = generateCreditCard(rng);
          break;
        case "email":
          data = generateEmail(rng);
          break;
        case "ipv4":
          data = generateIpv4(rng);
          break;
        case "ipv6":
          data = generateIpv6(rng);
          break;
        case "mac":
          data = generateMac(rng);
          break;
        case "nanoids": {
          const alphabet = ctx.getParam<string>("nanoidAlphabet", "");
          const nanoidLength = Math.max(1, Math.floor(ctx.getParam<number>("nanoidLength", 21)));
          data = { nanoid: generateNanoid(rng, alphabet || "abcdefghijklmnopqrstuvwxyz0123456789", nanoidLength) };
          break;
        }
        case "url":
          data = generateUrl(rng);
          break;
        case "userData":
          data = generateUserData(rng);
          break;
        case "uuid":
          data = { uuid: crypto.randomUUID() };
          break;
        case "version":
          data = generateVersion(rng);
          break;
        default:
          data = { error: `Unsupported dataType: ${dataType}` };
      }
      items.push({ json: data, pairedItem: { item: 0, input: 0 } });
    }

    if (outputAsSingleArray) {
      return [[{ json: { data: items.map((i) => i.json) }, pairedItem: { item: 0, input: 0 } }]];
    }

    return [items];
  }

  // Fallback: passthrough
  return [inputItems.map((item, idx) => withPairedItem(item, idx))];
};