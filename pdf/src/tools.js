import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import html2canvas from 'html2canvas';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const A4 = [595.28, 841.89];

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function baseName(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'arquivo';
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function inspectPdf(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = pdf.numPages;
  await pdf.destroy();
  return { pages };
}

export function parsePageSelection(value, pageCount) {
  const raw = value.trim();
  if (!raw) throw new Error('Informe as páginas que deseja extrair.');
  const pages = [];
  for (const token of raw.split(',')) {
    const item = token.trim();
    if (!item) continue;
    if (/^\d+$/.test(item)) {
      pages.push(Number(item));
      continue;
    }
    const match = item.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) throw new Error(`O intervalo “${item}” não é válido.`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    const direction = start <= end ? 1 : -1;
    for (let page = start; page !== end + direction; page += direction) pages.push(page);
  }
  if (!pages.length) throw new Error('Nenhuma página foi selecionada.');
  if (pages.some((page) => page < 1 || page > pageCount)) {
    throw new Error(`Use páginas entre 1 e ${pageCount}.`);
  }
  return [...new Set(pages)];
}

export async function mergePdfs(files, onProgress = () => {}) {
  const output = await PDFDocument.create();
  for (let index = 0; index < files.length; index += 1) {
    const source = await PDFDocument.load(await files[index].arrayBuffer());
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    onProgress((index + 1) / files.length, `Adicionando ${files[index].name}`);
  }
  const bytes = await output.save({ useObjectStreams: true });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: 'pdfs-unidos.pdf',
    detail: `${output.getPageCount()} páginas`,
  };
}

export async function splitPdf(file, selection, mode, onProgress = () => {}) {
  const sourceBytes = await file.arrayBuffer();
  const source = await PDFDocument.load(sourceBytes);
  const count = source.getPageCount();
  const selected = mode === 'all'
    ? Array.from({ length: count }, (_, index) => index + 1)
    : parsePageSelection(selection, count);

  if (mode === 'range') {
    const output = await PDFDocument.create();
    const copied = await output.copyPages(source, selected.map((page) => page - 1));
    copied.forEach((page) => output.addPage(page));
    onProgress(1, 'Preparando o PDF extraído');
    const bytes = await output.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      filename: `${baseName(file.name)}-paginas.pdf`,
      detail: `${selected.length} página${selected.length === 1 ? '' : 's'}`,
    };
  }

  const zip = new JSZip();
  for (let index = 0; index < selected.length; index += 1) {
    const pageNumber = selected[index];
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [pageNumber - 1]);
    output.addPage(page);
    const bytes = await output.save({ useObjectStreams: true });
    zip.file(`${baseName(file.name)}-pagina-${String(pageNumber).padStart(2, '0')}.pdf`, bytes);
    onProgress((index + 1) / selected.length, `Separando página ${pageNumber}`);
  }
  return {
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
    filename: `${baseName(file.name)}-paginas.zip`,
    detail: `${selected.length} PDFs em um ZIP`,
  };
}

async function renderPdfPage(pdf, pageNumber, scale, type = 'image/jpeg', quality = 0.78) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: type === 'image/png' });
  if (type === 'image/jpeg') {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Não foi possível gerar a imagem.')), type, quality);
  });
  page.cleanup();
  return { blob, width: viewport.width, height: viewport.height };
}

export async function compressPdf(file, level, onProgress = () => {}) {
  const settings = {
    light: { scale: 1.65, quality: 0.82 },
    balanced: { scale: 1.3, quality: 0.7 },
    strong: { scale: 1.0, quality: 0.52 },
  }[level] || { scale: 1.3, quality: 0.7 };

  const source = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const output = await PDFDocument.create();
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const rendered = await renderPdfPage(source, pageNumber, settings.scale, 'image/jpeg', settings.quality);
    const image = await output.embedJpg(await rendered.blob.arrayBuffer());
    const sourcePage = await source.getPage(pageNumber);
    const view = sourcePage.getViewport({ scale: 1 });
    const page = output.addPage([view.width, view.height]);
    page.drawImage(image, { x: 0, y: 0, width: view.width, height: view.height });
    sourcePage.cleanup();
    onProgress(pageNumber / source.numPages, `Otimizando página ${pageNumber} de ${source.numPages}`);
  }
  await source.destroy();
  const bytes = await output.save({ useObjectStreams: true });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const reduction = file.size > 0 ? Math.round((1 - blob.size / file.size) * 100) : 0;
  if (blob.size >= file.size) {
    return {
      blob: file,
      filename: `${baseName(file.name)}-otimizado.pdf`,
      detail: `${formatBytes(file.size)} · o original já estava otimizado`,
    };
  }
  return {
    blob,
    filename: `${baseName(file.name)}-comprimido.pdf`,
    detail: reduction > 0 ? `${reduction}% menor · ${formatBytes(blob.size)}` : `${formatBytes(blob.size)} · já estava otimizado`,
  };
}

export async function pdfToJpg(file, qualityName, onProgress = () => {}) {
  const quality = qualityName === 'compact' ? 0.72 : 0.92;
  const scale = qualityName === 'compact' ? 1.55 : 2.15;
  const source = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const rendered = await renderPdfPage(source, pageNumber, scale, 'image/jpeg', quality);
    images.push(rendered.blob);
    onProgress(pageNumber / source.numPages, `Convertendo página ${pageNumber} de ${source.numPages}`);
  }
  await source.destroy();
  if (images.length === 1) {
    return {
      blob: images[0],
      filename: `${baseName(file.name)}-pagina-01.jpg`,
      detail: `1 imagem · ${formatBytes(images[0].size)}`,
    };
  }
  const zip = new JSZip();
  images.forEach((blob, index) => {
    zip.file(`${baseName(file.name)}-pagina-${String(index + 1).padStart(2, '0')}.jpg`, blob);
  });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return {
    blob,
    filename: `${baseName(file.name)}-jpg.zip`,
    detail: `${images.length} imagens em um ZIP`,
  };
}

async function normalizeImage(file, quality = 0.94) {
  if (file.type === 'image/jpeg') return { bytes: await file.arrayBuffer(), kind: 'jpg' };
  if (file.type === 'image/png') return { bytes: await file.arrayBuffer(), kind: 'png' };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { bytes: await blob.arrayBuffer(), kind: 'jpg' };
}

export async function imagesToPdf(files, options, onProgress = () => {}) {
  const output = await PDFDocument.create();
  const margin = Number(options.margin || 0) * 2.83465;
  for (let index = 0; index < files.length; index += 1) {
    const normalized = await normalizeImage(files[index]);
    const image = normalized.kind === 'png'
      ? await output.embedPng(normalized.bytes)
      : await output.embedJpg(normalized.bytes);
    const dimensions = image.scale(1);
    let pageSize;
    if (options.pageSize === 'original') {
      pageSize = [dimensions.width + margin * 2, dimensions.height + margin * 2];
    } else {
      const portrait = options.orientation !== 'landscape';
      pageSize = portrait ? A4 : [A4[1], A4[0]];
    }
    const availableWidth = Math.max(1, pageSize[0] - margin * 2);
    const availableHeight = Math.max(1, pageSize[1] - margin * 2);
    const ratio = Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height, options.pageSize === 'original' ? 1 : Infinity);
    const width = dimensions.width * ratio;
    const height = dimensions.height * ratio;
    const page = output.addPage(pageSize);
    page.drawImage(image, {
      x: (pageSize[0] - width) / 2,
      y: (pageSize[1] - height) / 2,
      width,
      height,
    });
    onProgress((index + 1) / files.length, `Adicionando imagem ${index + 1} de ${files.length}`);
  }
  const bytes = await output.save({ useObjectStreams: true });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: 'imagens-convertidas.pdf',
    detail: `${files.length} página${files.length === 1 ? '' : 's'} · ${formatBytes(bytes.length)}`,
  };
}

async function elementToPdf(element, onProgress = () => {}) {
  await document.fonts.ready;
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 1.55,
    useCORS: false,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
  onProgress(0.72, 'Montando as páginas do PDF');
  const pdf = await PDFDocument.create();
  const pagePixelHeight = Math.floor(canvas.width * A4[1] / A4[0]);
  for (let offset = 0; offset < canvas.height; offset += pagePixelHeight) {
    const contentHeight = Math.min(pagePixelHeight, canvas.height - offset);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = pagePixelHeight;
    const context = pageCanvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, offset, canvas.width, contentHeight, 0, 0, canvas.width, contentHeight);
    const imageBlob = await new Promise((resolve) => pageCanvas.toBlob(resolve, 'image/jpeg', .9));
    const image = await pdf.embedJpg(await imageBlob.arrayBuffer());
    const page = pdf.addPage(A4);
    page.drawImage(image, { x:0, y:0, width:A4[0], height:A4[1] });
  }
  return new Blob([await pdf.save({ useObjectStreams:true })], { type:'application/pdf' });
}

async function docxToPdf(file, stage, onProgress) {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  onProgress(0.38, 'Interpretando estilos e conteúdo');
  const documentView = document.createElement('article');
  documentView.className = 'conversion-document';
  documentView.appendChild(sanitizeMarkup(result.value));
  stage.appendChild(documentView);
  const blob = await elementToPdf(documentView, onProgress);
  documentView.remove();
  return blob;
}

function sanitizeMarkup(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, link, meta').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'src') && /^(javascript|vbscript):/.test(value)) node.removeAttribute(attribute.name);
      if (name === 'style' && /url\s*\(/i.test(value)) node.removeAttribute(attribute.name);
    });
  });
  const fragment = document.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach((node) => fragment.appendChild(node));
  return fragment;
}

async function xlsxToPdf(file, stage, onProgress) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const workbookText = await zip.file('xl/workbook.xml')?.async('text');
  const relsText = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');
  if (!workbookText || !relsText) throw new Error('A planilha não contém uma estrutura XLSX válida.');
  const workbook = parser.parseFromString(workbookText, 'application/xml');
  const relationships = parser.parseFromString(relsText, 'application/xml');
  const relMap = new Map(Array.from(relationships.getElementsByTagName('Relationship')).map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
  const sharedText = await zip.file('xl/sharedStrings.xml')?.async('text');
  const sharedStrings = sharedText
    ? Array.from(parser.parseFromString(sharedText, 'application/xml').getElementsByTagName('si')).map((item) => Array.from(item.getElementsByTagName('t')).map((text) => text.textContent).join(''))
    : [];
  const documentView = document.createElement('article');
  documentView.className = 'conversion-document';
  const sheets = Array.from(workbook.getElementsByTagName('sheet'));
  for (const sheet of sheets) {
    const name = sheet.getAttribute('name') || 'Planilha';
    const title = document.createElement('h2');
    title.className = 'sheet-title';
    title.textContent = name;
    documentView.appendChild(title);
    const relId = sheet.getAttribute('r:id');
    const target = relMap.get(relId);
    const sheetPath = normalizeZipPath('xl', target || '');
    const sheetText = await zip.file(sheetPath)?.async('text');
    if (!sheetText) continue;
    const sheetXml = parser.parseFromString(sheetText, 'application/xml');
    const table = document.createElement('table');
    Array.from(sheetXml.getElementsByTagName('row')).slice(0, 2000).forEach((rowNode) => {
      const row = document.createElement('tr');
      let expectedColumn = 0;
      Array.from(rowNode.getElementsByTagName('c')).slice(0, 100).forEach((cellNode) => {
        const reference = cellNode.getAttribute('r') || '';
        const letters = reference.match(/[A-Z]+/)?.[0] || 'A';
        const column = letters.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
        while (expectedColumn < column) {
          row.appendChild(document.createElement('td'));
          expectedColumn += 1;
        }
        const cell = document.createElement('td');
        const type = cellNode.getAttribute('t');
        const raw = firstDescendant(cellNode, 'v')?.textContent ?? '';
        if (type === 's') cell.textContent = sharedStrings[Number(raw)] ?? '';
        else if (type === 'inlineStr') cell.textContent = Array.from(cellNode.getElementsByTagName('t')).map((node) => node.textContent).join('');
        else if (type === 'b') cell.textContent = raw === '1' ? 'VERDADEIRO' : 'FALSO';
        else cell.textContent = raw;
        row.appendChild(cell);
        expectedColumn = column + 1;
      });
      table.appendChild(row);
    });
    documentView.appendChild(table);
  }
  stage.appendChild(documentView);
  onProgress(0.4, 'Formatando planilhas');
  const blob = await elementToPdf(documentView, onProgress);
  documentView.remove();
  return blob;
}

function directChildrenByTag(node, tagName) {
  return Array.from(node.children || []).filter((child) => child.tagName === tagName);
}

function firstDescendant(node, tagName) {
  return node.getElementsByTagName(tagName)[0] || null;
}

function normalizeZipPath(base, target) {
  const segments = `${base}/${target}`.split('/');
  const clean = [];
  segments.forEach((segment) => {
    if (!segment || segment === '.') return;
    if (segment === '..') clean.pop(); else clean.push(segment);
  });
  return clean.join('/');
}

async function pptxToPdf(file, stage, onProgress) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presentationXml) throw new Error('A apresentação não contém uma estrutura PPTX válida.');
  const presentation = parser.parseFromString(presentationXml, 'application/xml');
  const sizeNode = firstDescendant(presentation, 'p:sldSz');
  const slideWidth = Number(sizeNode?.getAttribute('cx')) || 12192000;
  const slideHeight = Number(sizeNode?.getAttribute('cy')) || 6858000;
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!slideFiles.length) throw new Error('Nenhum slide foi encontrado na apresentação.');

  const pdf = await PDFDocument.create();
  for (let index = 0; index < slideFiles.length; index += 1) {
    const path = slideFiles[index];
    const xml = parser.parseFromString(await zip.file(path).async('text'), 'application/xml');
    const slide = document.createElement('div');
    slide.className = 'ppt-slide';
    const relPath = path.replace('/slides/', '/slides/_rels/') + '.rels';
    const rels = new Map();
    if (zip.file(relPath)) {
      const relXml = parser.parseFromString(await zip.file(relPath).async('text'), 'application/xml');
      Array.from(relXml.getElementsByTagName('Relationship')).forEach((rel) => {
        rels.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
      });
    }

    Array.from(xml.getElementsByTagName('p:sp')).forEach((shape) => {
      const texts = Array.from(shape.getElementsByTagName('a:t')).map((node) => node.textContent).filter(Boolean);
      if (!texts.length) return;
      const xfrm = firstDescendant(shape, 'a:xfrm');
      const off = xfrm ? firstDescendant(xfrm, 'a:off') : null;
      const ext = xfrm ? firstDescendant(xfrm, 'a:ext') : null;
      const x = (Number(off?.getAttribute('x')) || slideWidth * .08) / slideWidth * 960;
      const y = (Number(off?.getAttribute('y')) || slideHeight * .08) / slideHeight * 540;
      const width = (Number(ext?.getAttribute('cx')) || slideWidth * .84) / slideWidth * 960;
      const height = (Number(ext?.getAttribute('cy')) || slideHeight * .2) / slideHeight * 540;
      const runProps = firstDescendant(shape, 'a:rPr') || firstDescendant(shape, 'a:defRPr');
      const fontSize = Math.max(10, Math.min(56, (Number(runProps?.getAttribute('sz')) || 2200) / 100 * 1.33));
      const colorNode = firstDescendant(shape, 'a:srgbClr');
      const color = colorNode?.getAttribute('val') ? `#${colorNode.getAttribute('val')}` : '#17211a';
      const block = document.createElement('div');
      block.className = 'ppt-text';
      block.textContent = texts.join(' ');
      Object.assign(block.style, { left:`${x}px`, top:`${y}px`, width:`${width}px`, height:`${height}px`, fontSize:`${fontSize}px`, color });
      if (firstDescendant(shape, 'a:b')) block.style.fontWeight = '700';
      slide.appendChild(block);
    });

    const pendingImages = Array.from(xml.getElementsByTagName('p:pic')).map(async (picture) => {
      const blip = firstDescendant(picture, 'a:blip');
      const relationshipId = blip?.getAttribute('r:embed');
      const target = rels.get(relationshipId);
      if (!target) return;
      const mediaPath = normalizeZipPath('ppt/slides', target);
      const media = zip.file(mediaPath);
      if (!media) return;
      const data = await media.async('blob');
      const xfrm = firstDescendant(picture, 'a:xfrm');
      const off = xfrm ? firstDescendant(xfrm, 'a:off') : null;
      const ext = xfrm ? firstDescendant(xfrm, 'a:ext') : null;
      const image = document.createElement('img');
      const url = URL.createObjectURL(data);
      image.src = url;
      image.dataset.objectUrl = url;
      Object.assign(image.style, {
        left:`${(Number(off?.getAttribute('x')) || 0) / slideWidth * 960}px`,
        top:`${(Number(off?.getAttribute('y')) || 0) / slideHeight * 540}px`,
        width:`${(Number(ext?.getAttribute('cx')) || slideWidth) / slideWidth * 960}px`,
        height:`${(Number(ext?.getAttribute('cy')) || slideHeight) / slideHeight * 540}px`,
      });
      slide.appendChild(image);
      await image.decode().catch(() => {});
    });
    await Promise.all(pendingImages);
    stage.appendChild(slide);
    const canvas = await html2canvas(slide, { backgroundColor:'#fff', scale:1.35, logging:false });
    const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .91));
    const image = await pdf.embedJpg(await imageBlob.arrayBuffer());
    const page = pdf.addPage([720, 405]);
    page.drawImage(image, { x:0, y:0, width:720, height:405 });
    slide.querySelectorAll('[data-object-url]').forEach((image) => URL.revokeObjectURL(image.dataset.objectUrl));
    slide.remove();
    onProgress((index + 1) / slideFiles.length, `Convertendo slide ${index + 1} de ${slideFiles.length}`);
  }
  return new Blob([await pdf.save({ useObjectStreams:true })], { type:'application/pdf' });
}

export async function officeToPdf(file, stage, onProgress = () => {}) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  onProgress(0.08, 'Abrindo o documento localmente');
  let blob;
  if (extension === 'docx') blob = await docxToPdf(file, stage, onProgress);
  else if (extension === 'xlsx') blob = await xlsxToPdf(file, stage, onProgress);
  else if (extension === 'pptx') blob = await pptxToPdf(file, stage, onProgress);
  else throw new Error('Use um arquivo DOCX, XLSX ou PPTX. Formatos antigos não são compatíveis.');
  onProgress(1, 'Finalizando o documento');
  return {
    blob,
    filename: `${baseName(file.name)}.pdf`,
    detail: `${extension.toUpperCase()} convertido · ${formatBytes(blob.size)}`,
  };
}
