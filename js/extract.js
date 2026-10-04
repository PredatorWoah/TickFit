// extract.js
// Read text out of a file the user picked, entirely on their device.
//   .txt .md .json .csv  -> read as text
//   .pdf                 -> pdf.js (our own copy in vendor/, loaded only when needed)
// Nothing is uploaded anywhere.

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB is far more than any plan document
const MAX_PDF_PAGES = 60;

/** Read a File and return its text. Throws an Error with a friendly message on problems. */
export async function extractText(file) {
  if (file.size > MAX_BYTES) throw new Error('That file is bigger than 15 MB. Try a smaller one.');
  const name = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');

  if (isPdf) return extractPdfText(file);

  if (/^image\//.test(file.type)) {
    throw new Error('Photos and screenshots are not supported. Use a PDF or a text file, or type the plan into a chatbot.');
  }
  const text = await file.text();
  if (!text.trim()) throw new Error('That file is empty.');
  // A binary file read as text is full of the "replacement" character.
  if ((text.match(/�/g) || []).length > 20) throw new Error('That does not look like a text file. Try a PDF or .txt file.');
  return text;
}

async function extractPdfText(file) {
  let pdfjs;
  try {
    // Loaded on demand so it costs nothing until someone uploads a PDF.
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  } catch (e) {
    throw new Error('Could not load the PDF reader. If you are offline, open TickFit once while online first and try again.');
  }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('That PDF is password protected. Remove the password and try again.');
    throw new Error('Could not read that PDF. It may be damaged.');
  }

  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const out = [];
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Each item is a bit of text; hasEOL marks the end of a line.
    out.push(content.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join(''));
  }
  const text = out.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('That PDF has no selectable text (it is probably a scan or photo). Copy the text into a chatbot yourself, or use a text-based PDF.');
  return text;
}
