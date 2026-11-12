import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const FRAME_HEADER_BYTES = 13;
const FRAME_KIND_MESSAGE = 1;
const CALL = 100;
const LISTEN = 102;
const INITIALIZED = 200;
const RESULT = 201;
const ERROR = 202;
const REJECTED = 203;
const EVENT = 204;
const TAG_UNDEFINED = 0;
const TAG_STRING = 1;
const TAG_BUFFER = 2;
const TAG_ARRAY = 4;
const TAG_OBJECT = 5;
const TAG_INT = 6;
const enc = new TextEncoder();
const dec = new TextDecoder();

const writeVarint = (bytes, value) => {
  if (value === 0) { bytes.push(0); return; }
  while (value > 0) {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    bytes.push(byte);
  }
};

const appendBytes = (target, chunk) => { for (const byte of chunk) target.push(byte); };

const serializeInto = (bytes, value) => {
  if (value === undefined) { bytes.push(TAG_UNDEFINED); return; }
  if (typeof value === "string") {
    const encoded = enc.encode(value);
    bytes.push(TAG_STRING); writeVarint(bytes, encoded.byteLength); appendBytes(bytes, encoded); return;
  }
  if (value instanceof Uint8Array) {
    bytes.push(TAG_BUFFER); writeVarint(bytes, value.byteLength); appendBytes(bytes, value); return;
  }
  if (Array.isArray(value)) {
    bytes.push(TAG_ARRAY); writeVarint(bytes, value.length);
    for (const el of value) serializeInto(bytes, el);
    return;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    bytes.push(TAG_INT); writeVarint(bytes, value); return;
  }
  const encoded = enc.encode(JSON.stringify(value) ?? "null");
  bytes.push(TAG_OBJECT); writeVarint(bytes, encoded.byteLength); appendBytes(bytes, encoded);
};

class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; }
  read(count) {
    const out = this.bytes.subarray(this.offset, this.offset + count);
    if (out.byteLength !== count) throw new Error("frame truncated");
    this.offset += count;
    return out;
  }
  get done() { return this.offset >= this.bytes.byteLength; }
}

const readVarint = (reader) => {
  let value = 0;
  for (let shift = 0; ; shift += 7) {
    const [byte = 0] = reader.read(1);
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
  }
};

const deserializeFrom = (reader) => {
  const [tag = -1] = reader.read(1);
  switch (tag) {
    case TAG_UNDEFINED: return undefined;
    case TAG_STRING: return dec.decode(reader.read(readVarint(reader)));
    case TAG_BUFFER: return reader.read(readVarint(reader));
    case TAG_ARRAY: { const n = readVarint(reader); return Array.from({ length: n }, () => deserializeFrom(reader)); }
    case TAG_OBJECT: return JSON.parse(dec.decode(reader.read(readVarint(reader))));
    case TAG_INT: return readVarint(reader);
    default: throw new Error(`unknown tag ${tag}`);
  }
};

export const encodeFrame = (header, arg) => {
  const body = [];
  serializeInto(body, header);
  serializeInto(body, arg);
  const buffer = new ArrayBuffer(FRAME_HEADER_BYTES + body.length);
  const frame = new Uint8Array(buffer);
  frame[0] = FRAME_KIND_MESSAGE;
  const view = new DataView(buffer);
  view.setUint32(1, 0);
  view.setUint32(5, 0);
  view.setUint32(9, body.length);
  frame.set(Uint8Array.from(body), FRAME_HEADER_BYTES);
  return frame;
};

export const decodeBody = (body) => {
  const reader = new Reader(body);
  const header = deserializeFrom(reader);
  if (!Array.isArray(header)) return undefined;
  const [type, id] = header;
  if (typeof type !== "number") return undefined;
  const rest = reader.done ? undefined : [];
  // collect any remaining values
  const values = [];
  while (!reader.done) values.push(deserializeFrom(reader));
  void rest;
  return { type, id: typeof id === "number" ? id : 0, values };
};

export const makeFramer = () => {
  const chunks = [];
  let length = 0;
  const take = (count) => {
    const out = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      const slice = chunk.subarray(0, Math.min(chunk.byteLength, count - offset));
      out.set(slice, offset);
      offset += slice.byteLength;
      if (offset === count) break;
    }
    let remaining = count;
    while (remaining > 0) {
      const head = chunks[0];
      if (head === undefined) break;
      if (head.byteLength <= remaining) { remaining -= head.byteLength; chunks.shift(); }
      else { chunks[0] = head.subarray(remaining); remaining = 0; }
    }
    length -= count;
    return out;
  };
  const peek = () => {
    const out = new Uint8Array(FRAME_HEADER_BYTES);
    let offset = 0;
    for (const chunk of chunks) {
      const slice = chunk.subarray(0, Math.min(chunk.byteLength, FRAME_HEADER_BYTES - offset));
      out.set(slice, offset);
      offset += slice.byteLength;
      if (offset === FRAME_HEADER_BYTES) break;
    }
    return out;
  };
  return (chunk) => {
    if (chunk.byteLength > 0) { chunks.push(chunk); length += chunk.byteLength; }
    const bodies = [];
    for (;;) {
      if (length < FRAME_HEADER_BYTES) break;
      const header = peek();
      const bodyLength = ((header[9] * 0x1000000 + (header[10] << 16) + (header[11] << 8) + header[12]) >>> 0);
      if (length < FRAME_HEADER_BYTES + bodyLength) break;
      take(FRAME_HEADER_BYTES);
      const body = bodyLength === 0 ? new Uint8Array(0) : take(bodyLength);
      if (header[0] === FRAME_KIND_MESSAGE) bodies.push(body);
    }
    return bodies;
  };
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export const connect = async (serverRoot = `${homedir()}/.zcode/server`) => {
  const status = readJson(`${serverRoot}/run/status.json`);
  const token = readFileSync(`${serverRoot}/run/ingress-token`, "utf8").trim();
  const base = `http://${status.host}:${status.port}`;
  const info = await (await fetch(`${base}/api/server-info`, { headers: { authorization: `Bearer ${token}` } })).json();
  const grant = await (await fetch(`${base}/api/rpc-host-capability`, { method: "POST", headers: { authorization: `Bearer ${token}` } })).json();
  const url = `ws://${status.host}:${status.port}/ws/host?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url, { headers: { "x-zcode-rpc-host-capability": grant.capability } });
  socket.binaryType = "arraybuffer";
  const frame = makeFramer();
  const pending = new Map();
  const listeners = new Map();
  const events = [];
  let nextId = 0;
  let ready = false;
  const readyWaiters = [];

  socket.addEventListener("message", (event) => {
    const data = event.data;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
      : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : undefined;
    if (bytes === undefined) return;
    for (const body of frame(bytes)) {
      let parsed;
      try { parsed = decodeBody(body); } catch (e) { console.log("DECODE-ERR", String(e)); continue; }
      if (!parsed) continue;
      if (parsed.type === INITIALIZED) { ready = true; for (const w of readyWaiters.splice(0)) w(); continue; }
      if (parsed.type === EVENT) { listeners.get(parsed.id)?.(parsed.values[0]); continue; }
      const p = pending.get(parsed.id);
      if (!p) { events.push(parsed); continue; }
      pending.delete(parsed.id);
      p(parsed);
    }
  });
  const closed = new Promise((resolve) => socket.addEventListener("close", (e) => resolve(`code ${e.code}`)));
  socket.addEventListener("error", (e) => console.log("WS-ERROR", String(e?.message ?? e)));

  await new Promise((resolve, reject) => {
    readyWaiters.push(resolve);
    setTimeout(() => reject(new Error("handshake timeout")), 15000);
  });

  let nextUnused = nextId;
  const call = (channel, method, arg = {}, timeoutMs = 30000) => {
    const id = nextUnused++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      socket.send(encodeFrame([CALL, id, channel, method], [arg]));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ type: "timeout", id, values: [] }); } }, timeoutMs);
    });
  };
  const listen = (channel, event, arg = {}) => {
    const id = nextUnused++;
    const q = [];
    listeners.set(id, (payload) => q.push(payload));
    socket.send(encodeFrame([LISTEN, id, channel, event], [arg]));
    return q;
  };
  return { status, info, grant, call, listen, close: () => socket.close(), closed, events };
};

export const TYPE = { INITIALIZED, RESULT, ERROR, REJECTED, EVENT };
