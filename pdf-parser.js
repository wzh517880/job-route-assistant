import * as pdfjsLib from './pdf/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf/pdf.worker.min.mjs', import.meta.url).href;

globalThis.extractResumePdfText = async function extractResumePdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = '';
    content.items.forEach(item => {
      text += item.str;
      text += item.hasEOL ? '\n' : ' ';
    });
    pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
  }
  return pages.join('\n\n').trim();
};
