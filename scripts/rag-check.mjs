// End-to-end check of the knowledge pipeline (src/runtime/knowledge.ts):
// real files (docx/xlsx/pptx built as actual ZIPs, a real minimal PDF, text)
// → extractText → chunkText → per-role store → retrieveKnowledge → excerpts
// land in the system prompt (src/runtime/engine.ts) for that role only.

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const entry = `
export {
  extractText, chunkText, indexKnowledgeFile, deleteKnowledgeFile,
  retrieveKnowledge,
} from "../src/runtime/knowledge.ts";
export { buildSystemPrompt } from "../src/runtime/engine.ts";
`;
writeFileSync("scripts/.rag-entry.mjs", entry);
const outfile = "scripts/.rag-bundle.mjs";
await build({
  entryPoints: ["scripts/.rag-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  // Node needs pdfjs's legacy build (the modern one assumes DOM globals);
  // it resolves from node_modules at runtime. The ?url worker import is
  // browser-only and never evaluated under Node.
  alias: { "pdfjs-dist": "pdfjs-dist/legacy/build/pdf.mjs" },
  external: [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/build/pdf.worker.min.mjs?url",
  ],
  logLevel: "silent",
});
const {
  extractText,
  chunkText,
  indexKnowledgeFile,
  deleteKnowledgeFile,
  retrieveKnowledge,
  buildSystemPrompt,
} = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// --- fixture builders -------------------------------------------------------

// A real ZIP archive (method 0 = stored), enough for the Office formats.
function storedZip(files) {
  const te = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = te.encode(f.name);
    const data = typeof f.data === "string" ? te.encode(f.data) : f.data;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, central.reduce((n, p) => n + p.length, 0), true);
  eocd.setUint32(16, offset, true);
  const chunks = [...parts, ...central, new Uint8Array(eocd.buffer)];
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// A real minimal single-page PDF with a proper xref table.
function minimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// --- 1. extraction ----------------------------------------------------------

const docx = storedZip([
  {
    name: "word/document.xml",
    data:
      `<?xml version="1.0"?><w:document><w:body>` +
      `<w:p><w:r><w:t>Quarterly revenue grew 42 percent &amp; margins held.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Chi phí vận hành giảm 8%.</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  },
]);
const docxText = await extractText(new File([docx], "report.docx"));
check("docx: paragraphs extracted", docxText.includes("Quarterly revenue grew 42 percent & margins held."));
check("docx: unicode (Vietnamese) preserved", docxText.includes("Chi phí vận hành giảm 8%."));
check("docx: paragraphs separated", docxText.includes("held.\n"));

const xlsx = storedZip([
  {
    name: "xl/sharedStrings.xml",
    data: `<sst><si><t>Product</t></si><si><t>Widget A</t></si></sst>`,
  },
  {
    name: "xl/worksheets/sheet1.xml",
    data:
      `<worksheet><sheetData>` +
      `<row><c t="s"><v>0</v></c><c><v>2026</v></c></row>` +
      `<row><c t="s"><v>1</v></c><c><v>1250</v></c></row>` +
      `</sheetData></worksheet>`,
  },
]);
const xlsxText = await extractText(new File([xlsx], "sales.xlsx"));
check("xlsx: shared strings resolved", xlsxText.includes("Widget A"));
check("xlsx: cells joined into rows", xlsxText.includes("Widget A\t1250"));

const pptx = storedZip([
  {
    name: "ppt/slides/slide1.xml",
    data: `<p:sld><a:t>Roadmap 2026</a:t><a:t>Ship the knowledge feature</a:t></p:sld>`,
  },
]);
const pptxText = await extractText(new File([pptx], "deck.pptx"));
check("pptx: slide text extracted", pptxText.includes("Roadmap 2026 Ship the knowledge feature"));

const pdfText = await extractText(
  new File([minimalPdf("The vault master password policy is 16 characters")], "policy.pdf"),
);
check("pdf: text extracted via pdfjs", pdfText.includes("master password policy"));

let legacyErr = "";
await extractText(new File(["x"], "old.doc")).catch((e) => (legacyErr = e.message));
check("legacy .doc rejected with a clear message", legacyErr.includes(".docx"));

// --- 2. chunking ------------------------------------------------------------

const para = "Alpha beta gamma delta. ".repeat(20).trim(); // ~480 chars
const long = Array.from({ length: 12 }, (_, i) => `Section ${i}. ${para}`).join("\n\n");
const chunks = chunkText(long);
check("chunking: long text splits into multiple chunks", chunks.length > 2);
check("chunking: chunks stay near the target size", chunks.every((c) => c.length <= 1400));
check("chunking: nothing lost at the tail", chunks[chunks.length - 1].includes("Section 11"));
check("chunking: empty text gives no chunks", chunkText("   ").length === 0);

// --- 3. per-role store + retrieval -----------------------------------------

await indexKnowledgeFile(
  "sales",
  "f-sales",
  new File(
    ["Our average deal size is 5000 dollars. The sales cycle runs 30 days from demo to close."],
    "sales-playbook.txt",
  ),
);
await indexKnowledgeFile(
  "marketing",
  "f-mkt",
  new File(
    ["Brand voice is playful. The campaign budget for spring is 2000 dollars."],
    "marketing-plan.txt",
  ),
);

const salesHits = await retrieveKnowledge("sales", "what is our average deal size?");
check("retrieval: the right chunk comes back", salesHits.some((e) => e.text.includes("5000 dollars")));
check("retrieval: excerpt carries the source name", salesHits.some((e) => e.name === "sales-playbook.txt"));

const crossHits = await retrieveKnowledge("marketing", "average deal size");
check(
  "isolation: another role never sees that document",
  !crossHits.some((e) => e.name === "sales-playbook.txt"),
);
check("empty bucket: no excerpts", (await retrieveKnowledge(null, "deal size")).length === 0);
check("no matching terms: no excerpts", (await retrieveKnowledge("sales", "xyzzy plugh")).length === 0);

await deleteKnowledgeFile("f-sales");
check(
  "deletion: removed file no longer retrieved",
  (await retrieveKnowledge("sales", "average deal size")).length === 0,
);

// --- 4. excerpts reach the system prompt ------------------------------------

const prompt = buildSystemPrompt({
  provider: "openrouter",
  agentName: "Sales Expert",
  knowledgeExcerpts: [{ name: "sales-playbook.txt", text: "Average deal size is 5000 dollars." }],
});
check("prompt: excerpt text is injected", prompt.includes("Average deal size is 5000 dollars."));
check("prompt: excerpt cites its document", prompt.includes("[sales-playbook.txt]"));
const bare = buildSystemPrompt({ provider: "openrouter", agentName: "Marketing Expert" });
check("prompt: no excerpts → no excerpt section", !bare.includes("Relevant excerpts"));

rmSync("scripts/.rag-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ knowledge pipeline works — extract, chunk, retrieve, ground" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
