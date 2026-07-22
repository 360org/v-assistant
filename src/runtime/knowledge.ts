/**
 * Knowledge pipeline — real document understanding, fully in-app.
 *
 *   drop file → extractText → chunkText → IndexedDB (per-role bucket)
 *   chat turn → retrieveKnowledge(role, question) → excerpts → system prompt
 *
 * docx/xlsx/pptx are plain ZIP+XML, unpacked with the native
 * DecompressionStream — no parsing library. PDF is the one format that
 * genuinely needs a real parser (font encodings, CMaps), so it lazy-loads
 * pdfjs-dist only when a PDF is dropped.
 *
 * ponytail: retrieval is lexical (tf-idf over chunks, linear scan) — no
 * embeddings, no vector index. Right for personal-scale corpora; upgrade
 * path is provider embeddings + a proper index behind the same
 * retrieveKnowledge() signature.
 */

// ---------------------------------------------------------------------------
// ZIP reader (docx/xlsx/pptx are ZIP archives of XML parts)
// ---------------------------------------------------------------------------

interface ZipReader {
  names: string[];
  read(name: string): Promise<Uint8Array | null>;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function openZip(buf: ArrayBuffer): ZipReader {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // End-of-central-directory record: scan back from the file end.
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid Office file (missing ZIP directory)");
  const count = view.getUint16(eocd + 10, true);
  const entries = new Map<string, { method: number; csize: number; lho: number }>();
  const td = new TextDecoder();
  let off = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && view.getUint32(off, true) === 0x02014b50; n++) {
    const nameLen = view.getUint16(off + 28, true);
    entries.set(td.decode(bytes.subarray(off + 46, off + 46 + nameLen)), {
      method: view.getUint16(off + 10, true),
      csize: view.getUint32(off + 20, true),
      lho: view.getUint32(off + 42, true),
    });
    off += 46 + nameLen + view.getUint16(off + 30, true) + view.getUint16(off + 32, true);
  }
  return {
    names: [...entries.keys()],
    async read(name) {
      const e = entries.get(name);
      if (!e) return null;
      // The local header repeats name/extra lengths; data follows it.
      const start =
        e.lho + 30 + view.getUint16(e.lho + 26, true) + view.getUint16(e.lho + 28, true);
      const data = bytes.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return inflateRaw(data);
      throw new Error("Unsupported ZIP compression method");
    },
  };
}

// ---------------------------------------------------------------------------
// Per-format text extraction
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (_, code: string) => {
    if (code === "amp") return "&";
    if (code === "lt") return "<";
    if (code === "gt") return ">";
    if (code === "quot") return '"';
    if (code === "apos") return "'";
    return String.fromCodePoint(
      code[1] === "x" || code[1] === "X"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10),
    );
  });
}

const stripTags = (xml: string) => decodeEntities(xml.replace(/<[^>]+>/g, ""));

async function readXml(zip: ZipReader, name: string): Promise<string> {
  const data = await zip.read(name);
  return data ? new TextDecoder().decode(data) : "";
}

/** Word: character data in document.xml lives inside <w:t> runs. */
async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const xml = await readXml(openZip(buf), "word/document.xml");
  return stripTags(
    xml.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<\/w:p>/g, "\n"),
  );
}

/** Excel: shared strings + each worksheet's cells, tab-separated rows. */
async function extractXlsx(buf: ArrayBuffer): Promise<string> {
  const zip = openZip(buf);
  const shared = [...(await readXml(zip, "xl/sharedStrings.xml"))
    .matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => stripTags(m[1]));
  const sheets = zip.names.filter((n) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(n)).sort();
  const out: string[] = [];
  for (const sheet of sheets) {
    const xml = await readXml(zip, sheet);
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c([^>]*?)\/?>(?:([\s\S]*?)<\/c>)?/g)].map(
        ([, attrs, inner = ""]) => {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
          if (/t="s"/.test(attrs)) return shared[Number(v)] ?? "";
          if (/t="inlineStr"/.test(attrs)) return stripTags(inner);
          return stripTags(v);
        },
      );
      const line = cells.join("\t").trim();
      if (line) out.push(line);
    }
  }
  return out.join("\n");
}

/** PowerPoint: every <a:t> run on each slide, in slide order. */
async function extractPptx(buf: ArrayBuffer): Promise<string> {
  const zip = openZip(buf);
  const slides = zip.names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  const out: string[] = [];
  for (const slide of slides) {
    const xml = await readXml(zip, slide);
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => stripTags(m[1]));
    if (runs.length) out.push(runs.join(" "));
  }
  return out.join("\n\n");
}

/** PDF needs a real parser (fonts, CMaps) — lazy-load pdfjs on demand. */
async function extractPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerPort && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      // @ts-ignore
      const PDFWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
      // @ts-ignore
      pdfjs.GlobalWorkerOptions.workerPort = new PDFWorker.default();
    } catch (e) {
      console.warn("Failed to load PDF worker as port, falling back to URL path", e);
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  await doc.destroy();
  return pages.join("\n\n");
}

async function extractZip(buf: ArrayBuffer): Promise<string> {
  const zip = openZip(buf);
  const out: string[] = [];

  const textFiles = zip.names.filter((name) => {
    if (name.startsWith("__MACOSX/") || name.includes("/.") || name.endsWith("/")) return false;
    const innerExt = name.toLowerCase().split(".").pop() ?? "";
    return [
      "txt", "md", "markdown", "pdf", "docx", "xlsx", "pptx", 
      "html", "htm", "json", "js", "ts", "jsx", "tsx", 
      "py", "sh", "yaml", "yml", "ini", "conf", "csv",
      "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"
    ].includes(innerExt);
  });

  for (const name of textFiles) {
    try {
      const data = await zip.read(name);
      if (!data) continue;

      const innerExt = name.toLowerCase().split(".").pop() ?? "";
      let text = "";
      const fileBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
      if (innerExt === "pdf") {
        text = await extractPdf(fileBuf);
      } else if (innerExt === "docx") {
        text = await extractDocx(fileBuf);
      } else if (innerExt === "xlsx") {
        text = await extractXlsx(fileBuf);
      } else if (innerExt === "pptx") {
        text = await extractPptx(fileBuf);
      } else if (imgExtensions.includes(innerExt)) {
        text = `[Tệp hình ảnh: ${name} | Định dạng: ${innerExt.toUpperCase()} | Kích thước: ${(data.byteLength / 1024).toFixed(1)} KB]\n(Tệp tin hình ảnh được tải lên làm tài liệu tri thức cho Agent. AI có thể sử dụng thông tin này để nhận biết sự hiện diện của tệp tin.)`;
      } else {
        text = new TextDecoder().decode(data);
        if (innerExt === "html" || innerExt === "htm") {
          text = stripTags(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
        }
      }

      if (text.trim()) {
        out.push(`--- File: ${name} ---\n${text.trim()}`);
      }
    } catch (e) {
      console.warn(`Failed to extract file "${name}" from ZIP:`, e);
    }
  }

  if (!out.length) {
    throw new Error("No readable text files found in this ZIP archive");
  }

  return out.join("\n\n");
}

/** Extracts plain text from a dropped file, by format. */
export async function extractText(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buf = () => file.arrayBuffer();
  if (ext === "pdf") return extractPdf(await buf());
  if (ext === "docx") return extractDocx(await buf());
  if (ext === "xlsx") return extractXlsx(await buf());
  if (ext === "pptx") return extractPptx(await buf());
  if (ext === "zip") return extractZip(await buf());
  if (ext === "doc" || ext === "xls" || ext === "ppt")
    throw new Error(`Legacy .${ext} format isn't supported — save it as .${ext}x`);
  
  const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"];
  if (imgExtensions.includes(ext)) {
    return `[Tệp hình ảnh: ${file.name} | Định dạng: ${ext.toUpperCase()} | Kích thước: ${(file.size / 1024).toFixed(1)} KB]\n(Tệp tin hình ảnh được tải lên làm tài liệu tri thức cho Agent. AI có thể sử dụng thông tin này để nhận biết sự hiện diện của tệp tin.)`;
  }

  const text = await file.text();
  if (ext === "html" || ext === "htm")
    return stripTags(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  // Everything else is treated as text (txt, md, csv, json, code…); reject
  // binaries, which decode with NUL/replacement characters.
  const junk = (text.slice(0, 2000).match(/[\0]/g) ?? []).length;
  if (junk > 4) throw new Error("This file type isn't supported");
  return text;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Splits text into ~`size`-char chunks, preferring paragraph/sentence breaks. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/[ \t]+\n/g, "\n").trim();
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const brk = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
      if (brk > size * 0.4) end = i + brk + 1;
    }
    const chunk = clean.slice(i, end).trim();
    if (chunk) out.push(chunk);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chunk store — IndexedDB per role bucket (in-memory fallback where idb is
// unavailable: tests, private-mode webviews)
// ---------------------------------------------------------------------------

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface FileChunks {
  fileId: string;
  bucket: string;
  name: string;
  chunks: string[];
  dataUrl?: string;
}

const bucketOf = (agentId: string | null | undefined): string => agentId ?? "general";

const memory = new Map<string, FileChunks>();
const hasIdb = typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("v-assistant-knowledge", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("chunks", { keyPath: "fileId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction("chunks", mode).objectStore("chunks"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Extract + chunk + persist one file into a role's bucket. Returns chunk count. */
export async function indexKnowledgeFile(
  agentId: string | null,
  fileId: string,
  file: File,
): Promise<number> {
  const text = await extractText(file);
  const chunks = chunkText(text);
  if (!chunks.length)
    throw new Error("No readable text in this file (is it a scanned image?)");

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"];
  let dataUrl: string | undefined = undefined;
  if (imgExtensions.includes(ext) || file.type.startsWith("image/")) {
    try {
      dataUrl = await fileToDataUrl(file);
    } catch (e) {
      console.warn("Failed to read image as data URL:", e);
    }
  }

  const rec: FileChunks = { fileId, bucket: bucketOf(agentId), name: file.name, chunks, dataUrl };
  if (hasIdb) await withStore("readwrite", (s) => s.put(rec));
  else memory.set(fileId, rec);
  return chunks.length;
}

export async function deleteKnowledgeFile(fileId: string): Promise<void> {
  if (hasIdb) await withStore("readwrite", (s) => s.delete(fileId));
  else memory.delete(fileId);
}

export async function getFileContent(fileId: string): Promise<string | null> {
  const rec = hasIdb
    ? await withStore<FileChunks | undefined>("readonly", (s) => s.get(fileId))
    : memory.get(fileId);
  return rec ? rec.chunks.join("\n\n") : null;
}

export async function getKnowledgeFileRecord(
  fileId: string,
): Promise<{ name: string; chunks: string[]; dataUrl?: string } | null> {
  const rec = hasIdb
    ? await withStore<FileChunks | undefined>("readonly", (s) => s.get(fileId))
    : memory.get(fileId);
  return rec ? { name: rec.name, chunks: rec.chunks, dataUrl: rec.dataUrl } : null;
}

export async function clearKnowledge(): Promise<void> {
  if (hasIdb) await withStore("readwrite", (s) => s.clear());
  else memory.clear();
}

export async function getAllImageRecords(): Promise<Array<{ id: string; name: string; dataUrl?: string }>> {
  const files: FileChunks[] = hasIdb
    ? await withStore<FileChunks[]>("readonly", (s) => s.getAll())
    : [...memory.values()];

  const imageFiles = files.filter((f) => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    const isImg = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff"].includes(ext);
    return isImg || Boolean(f.dataUrl) || f.chunks?.[0]?.startsWith("data:image/");
  });

  return imageFiles.map((f) => ({
    id: f.fileId,
    name: f.name,
    dataUrl: f.dataUrl || (f.chunks?.[0]?.startsWith("data:image/") ? f.chunks[0] : undefined),
  }));
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface KnowledgeExcerpt {
  name: string;
  text: string;
}

const tokenize = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1);

/**
 * Top chunks from THIS role's documents for a question — tf-idf scored,
 * capped so the excerpts never flood the prompt.
 */
export async function retrieveKnowledge(
  agentId: string | null,
  query: string,
  k = 4,
  maxChars = 6000,
): Promise<KnowledgeExcerpt[]> {
  const bucket = bucketOf(agentId);
  const files = hasIdb
    ? (await withStore<FileChunks[]>("readonly", (s) => s.getAll())).filter(
        (f) => f.bucket === bucket,
      )
    : [...memory.values()].filter((f) => f.bucket === bucket);
  const all = files.flatMap((f) =>
    f.chunks.map((text) => ({ name: f.name, text, terms: tokenize(text) })),
  );
  const qTerms = [...new Set(tokenize(query))];
  if (!all.length || !qTerms.length) return [];

  const df = new Map<string, number>();
  for (const q of qTerms)
    df.set(q, all.filter((c) => c.terms.includes(q)).length);
  const scored = all
    .map((c) => ({
      ...c,
      score: qTerms.reduce((sum, q) => {
        const tf = c.terms.filter((t) => t === q).length;
        return tf ? sum + (1 + Math.log(tf)) * Math.log(1 + all.length / df.get(q)!) : sum;
      }, 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const out: KnowledgeExcerpt[] = [];
  let used = 0;
  for (const c of scored.slice(0, k)) {
    if (used + c.text.length > maxChars) break;
    out.push({ name: c.name, text: c.text });
    used += c.text.length;
  }
  return out;
}
