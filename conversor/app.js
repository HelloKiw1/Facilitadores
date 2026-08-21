(() => {
  'use strict';

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'avif']);
  const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'webm', 'opus']);
  const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'html', 'htm', 'xml', 'csv', 'tsv', 'json']);
  const MAX_FILE_SIZE = 500 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 40_000_000;

  const definitions = {
    png: { label: 'PNG', extension: 'png', mime: 'image/png' },
    jpg: { label: 'JPG', extension: 'jpg', mime: 'image/jpeg' },
    webp: { label: 'WEBP', extension: 'webp', mime: 'image/webp' },
    bmp: { label: 'BMP', extension: 'bmp', mime: 'image/bmp' },
    wav: { label: 'WAV', extension: 'wav', mime: 'audio/wav' },
    txt: { label: 'TXT', extension: 'txt', mime: 'text/plain;charset=utf-8' },
    md: { label: 'MARKDOWN', extension: 'md', mime: 'text/markdown;charset=utf-8' },
    html: { label: 'HTML', extension: 'html', mime: 'text/html;charset=utf-8' },
    csv: { label: 'CSV', extension: 'csv', mime: 'text/csv;charset=utf-8' },
    json: { label: 'JSON', extension: 'json', mime: 'application/json;charset=utf-8' },
    base64: { label: 'BASE64', extension: 'base64', mime: 'text/plain;charset=utf-8' },
    gzip: { label: 'GZIP', extension: 'gz', mime: 'application/gzip' },
    ungzip: { label: 'DESCOMPACTAR', extension: 'bin', mime: 'application/octet-stream' },
    binary: { label: 'BINÁRIO', extension: 'bin', mime: 'application/octet-stream' },
  };

  const state = { items: [], converting: false, nextId: 1 };
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    dropZone: $('#dropZone'), fileInput: $('#fileInput'), select: $('#selectButton'), workspace: $('#workspace'),
    add: $('#addButton'), list: $('#fileList'), queueTitle: $('#queueTitle'), clear: $('#clearButton'),
    convert: $('#convertButton'), downloadAll: $('#downloadAllButton'), quality: $('#qualityRange'),
    qualityValue: $('#qualityValue'), template: $('#fileTemplate'), toast: $('#toast'),
  };

  function extensionOf(name) {
    const match = String(name || '').toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : '';
  }

  function baseName(name) {
    return String(name || 'arquivo').replace(/\.[^.]+$/, '') || 'arquivo';
  }

  function safeName(name) {
    return String(name || 'arquivo').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'arquivo';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2800);
  }

  function categoryOf(file) {
    const extension = extensionOf(file.name);
    if (extension === 'gz' || file.type === 'application/gzip') return 'gzip';
    if (extension === 'b64' || extension === 'base64') return 'base64';
    if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text';
    return 'generic';
  }

  function availableTargets(file) {
    const extension = extensionOf(file.name);
    const category = categoryOf(file);
    let targets = [];
    if (category === 'image') targets = ['png', 'jpg', 'webp', 'bmp'].filter((target) => target !== (extension === 'jpeg' ? 'jpg' : extension));
    else if (category === 'audio') targets = extension === 'wav' ? [] : ['wav'];
    else if (category === 'gzip') targets = ['ungzip'];
    else if (category === 'base64') targets = ['binary'];
    else if (category === 'text') {
      if (extension === 'json') targets = ['csv', 'txt', 'html'];
      else if (extension === 'csv' || extension === 'tsv') targets = ['json', 'txt', 'html'];
      else if (extension === 'md' || extension === 'markdown') targets = ['html', 'txt'];
      else if (extension === 'html' || extension === 'htm' || extension === 'xml') targets = ['txt'];
      else targets = ['html', 'md'];
    }
    if (category !== 'gzip' && category !== 'base64') targets.push('base64', 'gzip');
    return [...new Set(targets)];
  }

  function resetItem(item) {
    item.status = 'ready';
    item.output = null;
    item.outputName = '';
    item.error = '';
  }

  function updateSummary() {
    const count = state.items.length;
    elements.workspace.classList.toggle('hidden', count === 0);
    elements.queueTitle.textContent = `${count} ${count === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}`;
    const completed = state.items.filter((item) => item.status === 'done').length;
    elements.downloadAll.classList.toggle('hidden', completed === 0);
    elements.downloadAll.textContent = completed === 1 ? 'Baixar resultado' : `Baixar ${completed} resultados`;
    elements.convert.disabled = state.converting || count === 0;
    elements.clear.disabled = state.converting;
  }

  function renderItem(item) {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector('.file-card');
    const extension = extensionOf(item.file.name).toUpperCase() || 'FILE';
    card.dataset.id = String(item.id);
    card.querySelector('.file-type-icon span').textContent = extension.slice(0, 5);
    card.querySelector('.file-info strong').textContent = item.file.name;
    card.querySelector('.file-info strong').title = item.file.name;
    card.querySelector('.file-info small').textContent = `${formatBytes(item.file.size)} · ${categoryLabel(categoryOf(item.file))}`;
    card.querySelector('.from-format').textContent = extension;
    const select = card.querySelector('select');
    item.targets.forEach((target) => {
      const option = document.createElement('option');
      option.value = target;
      option.textContent = definitions[target].label;
      select.appendChild(option);
    });
    select.value = item.target;
    select.addEventListener('change', () => {
      item.target = select.value;
      resetItem(item);
      updateItem(item);
      updateSummary();
    });
    card.querySelector('.remove-file').addEventListener('click', () => removeItem(item.id));
    card.querySelector('.download-one').addEventListener('click', () => downloadItem(item));
    elements.list.appendChild(fragment);
    item.node = elements.list.querySelector(`[data-id="${item.id}"]`);
    updateItem(item);
  }

  function categoryLabel(category) {
    return ({ image: 'Imagem', audio: 'Áudio', text: 'Texto e dados', gzip: 'Arquivo GZIP', base64: 'Texto Base64', generic: 'Arquivo' })[category] || 'Arquivo';
  }

  function updateItem(item) {
    if (!item.node) return;
    const status = item.node.querySelector('.status-label');
    const progress = item.node.querySelector('.progress i');
    const download = item.node.querySelector('.download-one');
    const select = item.node.querySelector('select');
    item.node.classList.toggle('done', item.status === 'done');
    item.node.classList.toggle('error', item.status === 'error');
    select.disabled = item.status === 'converting' || state.converting;
    download.classList.toggle('hidden', item.status !== 'done');
    if (item.status === 'converting') { status.textContent = 'Convertendo…'; progress.style.width = '62%'; }
    else if (item.status === 'done') { status.textContent = `${formatBytes(item.output.size)} · Concluído`; progress.style.width = '100%'; }
    else if (item.status === 'error') { status.textContent = item.error || 'Falha na conversão'; status.title = status.textContent; progress.style.width = '100%'; }
    else { status.textContent = 'Pronto'; status.title = ''; progress.style.width = '0'; }
  }

  function addFiles(files) {
    const accepted = [];
    Array.from(files || []).forEach((file) => {
      if (!file || !file.name) return;
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name} ultrapassa o limite local de 500 MB.`);
        return;
      }
      const targets = availableTargets(file);
      if (!targets.length) return;
      const item = { id: state.nextId++, file, targets, target: targets[0], status: 'ready', output: null, outputName: '', error: '', node: null };
      state.items.push(item);
      accepted.push(item);
    });
    accepted.forEach(renderItem);
    updateSummary();
    if (accepted.length) elements.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (files?.length) showToast('Não foi encontrada uma conversão local para esse arquivo.');
    elements.fileInput.value = '';
  }

  function removeItem(id) {
    if (state.converting) return;
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    state.items[index].node?.remove();
    state.items.splice(index, 1);
    updateSummary();
  }

  function clearQueue() {
    if (state.converting) return;
    state.items = [];
    elements.list.replaceChildren();
    updateSummary();
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Este navegador não consegue gerar ${type}.`));
    }, type, quality));
  }

  function canvasToBmp(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const pixelSize = rowSize * height;
    const buffer = new ArrayBuffer(54 + pixelSize);
    const view = new DataView(buffer);
    view.setUint16(0, 0x4d42, true);
    view.setUint32(2, 54 + pixelSize, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelSize, true);
    const bytes = new Uint8Array(buffer);
    for (let y = 0; y < height; y += 1) {
      const targetRow = 54 + (height - 1 - y) * rowSize;
      for (let x = 0; x < width; x += 1) {
        const source = (y * width + x) * 4;
        const alpha = pixels[source + 3] / 255;
        const target = targetRow + x * 3;
        bytes[target] = Math.round(pixels[source + 2] * alpha + 255 * (1 - alpha));
        bytes[target + 1] = Math.round(pixels[source + 1] * alpha + 255 * (1 - alpha));
        bytes[target + 2] = Math.round(pixels[source] * alpha + 255 * (1 - alpha));
      }
    }
    return new Blob([buffer], { type: 'image/bmp' });
  }

  async function convertImage(file, target) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('O navegador não conseguiu decodificar esta imagem.'));
        image.src = url;
      });
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) throw new Error('A imagem não possui dimensões válidas.');
      if (width * height > MAX_IMAGE_PIXELS) throw new Error('A imagem é grande demais para a memória disponível. Limite: 40 megapixels.');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: target !== 'jpg' && target !== 'bmp' });
      if (target === 'jpg' || target === 'bmp') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
      context.drawImage(image, 0, 0);
      if (target === 'bmp') return canvasToBmp(canvas);
      return canvasToBlob(canvas, definitions[target].mime, Number(elements.quality.value) / 100);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function writeAscii(view, offset, text) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  }

  function audioBufferToWav(audioBuffer) {
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const dataSize = length * channels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
    let offset = 44;
    for (let sample = 0; sample < length; sample += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const value = Math.max(-1, Math.min(1, channelData[channel][sample]));
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function convertAudio(file) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Este navegador não possui o decodificador de áudio necessário.');
    const audioContext = new AudioContextClass();
    try {
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
      return audioBufferToWav(audioBuffer);
    } catch (error) {
      throw new Error('Este codec de áudio não é aceito pelo navegador. Tente MP3, M4A, OGG ou WAV.');
    } finally {
      await audioContext.close().catch(() => {});
    }
  }

  function decodeText(buffer) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  }

  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find((value) => value.trim()) || '';
    const options = [',', ';', '\t'];
    return options.sort((a, b) => line.split(b).length - line.split(a).length)[0];
  }

  function parseDelimited(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(value); value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value); value = '';
        if (row.some((cell) => cell.length)) rows.push(row);
        row = [];
      } else value += character;
    }
    row.push(value);
    if (row.some((cell) => cell.length)) rows.push(row);
    return rows;
  }

  function csvEscape(value) {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function jsonToCsv(text) {
    const parsed = JSON.parse(text);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    if (!records.length) return '';
    const normalized = records.map((record) => (record && typeof record === 'object' && !Array.isArray(record)) ? record : { valor: record });
    const headers = [...new Set(normalized.flatMap((record) => Object.keys(record)))];
    return [headers.map(csvEscape).join(','), ...normalized.map((record) => headers.map((header) => csvEscape(record[header])).join(','))].join('\r\n');
  }

  function csvToJson(text) {
    const rows = parseDelimited(text);
    if (!rows.length) return '[]';
    const headers = rows[0].map((header, index) => header.trim() || `coluna_${index + 1}`);
    const records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
    return JSON.stringify(records, null, 2);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function htmlDocument(title, body) {
    return `<!doctype html>\n<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px/1.55 system-ui;color:#202124}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #d8d8d8;text-align:left}th{background:#f3f3f3}pre{white-space:pre-wrap}</style></head><body>${body}</body></html>`;
  }

  function rowsToHtml(rows, title) {
    if (!rows.length) return htmlDocument(title, '<p>Arquivo vazio.</p>');
    const head = `<tr>${rows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`;
    const body = rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    return htmlDocument(title, `<h1>${escapeHtml(title)}</h1><table><thead>${head}</thead><tbody>${body}</tbody></table>`);
  }

  function markdownToHtml(markdown, title) {
    const inline = (value) => escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const output = [];
    let listOpen = false;
    markdown.split(/\r?\n/).forEach((line) => {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      const list = line.match(/^\s*[-*+]\s+(.+)$/);
      if (list) {
        if (!listOpen) { output.push('<ul>'); listOpen = true; }
        output.push(`<li>${inline(list[1])}</li>`);
        return;
      }
      if (listOpen) { output.push('</ul>'); listOpen = false; }
      if (heading) output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      else if (!line.trim()) output.push('');
      else output.push(`<p>${inline(line)}</p>`);
    });
    if (listOpen) output.push('</ul>');
    return htmlDocument(title, output.join('\n'));
  }

  function htmlToText(html) {
    const documentValue = new DOMParser().parseFromString(html, 'text/html');
    return (documentValue.body?.innerText || documentValue.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function convertText(file, target) {
    const extension = extensionOf(file.name);
    const text = decodeText(await file.arrayBuffer());
    let output;
    if (target === 'csv') output = jsonToCsv(text);
    else if (target === 'json') output = csvToJson(text);
    else if (target === 'txt') {
      if (extension === 'html' || extension === 'htm' || extension === 'xml') output = htmlToText(text);
      else if (extension === 'json') output = JSON.stringify(JSON.parse(text), null, 2);
      else output = text;
    } else if (target === 'md') output = text;
    else if (target === 'html') {
      if (extension === 'csv' || extension === 'tsv') output = rowsToHtml(parseDelimited(text), baseName(file.name));
      else if (extension === 'json') {
        const parsed = JSON.parse(text);
        const records = Array.isArray(parsed) ? parsed : [parsed];
        const objects = records.map((record) => (record && typeof record === 'object' && !Array.isArray(record)) ? record : { valor: record });
        const headers = [...new Set(objects.flatMap((record) => Object.keys(record)))];
        output = rowsToHtml([headers, ...objects.map((record) => headers.map((header) => record[header] == null ? '' : typeof record[header] === 'object' ? JSON.stringify(record[header]) : String(record[header])))], baseName(file.name));
      } else if (extension === 'md' || extension === 'markdown') output = markdownToHtml(text, baseName(file.name));
      else output = htmlDocument(baseName(file.name), `<pre>${escapeHtml(text)}</pre>`);
    } else throw new Error('Conversão de texto não reconhecida.');
    return new Blob([target === 'txt' || target === 'md' ? output : `\uFEFF${output}`], { type: definitions[target].mime });
  }

  async function toBase64(file) {
    if (file.size > 100 * 1024 * 1024) throw new Error('A conversão para Base64 aceita arquivos de até 100 MB para proteger a memória.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    const value = btoa(chunks.join(''));
    return new Blob([value.match(/.{1,76}/g)?.join('\n') || ''], { type: definitions.base64.mime });
  }

  async function fromBase64(file) {
    const text = decodeText(await file.arrayBuffer()).replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
    let binary;
    try { binary = atob(text); }
    catch { throw new Error('O conteúdo não é um Base64 válido.'); }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'application/octet-stream' });
  }

  async function gzipFile(file) {
    if (!('CompressionStream' in window)) throw new Error('Seu navegador não oferece compactação GZIP local.');
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).blob();
  }

  async function ungzipFile(file) {
    if (!('DecompressionStream' in window)) throw new Error('Seu navegador não oferece descompactação GZIP local.');
    try {
      const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).blob();
    } catch {
      throw new Error('O arquivo GZIP está danificado ou usa um formato incompatível.');
    }
  }

  function outputNameFor(item) {
    if (item.target === 'gzip') return `${safeName(item.file.name)}.gz`;
    if (item.target === 'ungzip') return safeName(item.file.name.replace(/\.gz$/i, '') || `${item.file.name}.bin`);
    if (item.target === 'base64') return `${safeName(item.file.name)}.base64`;
    if (item.target === 'binary') return safeName(item.file.name.replace(/\.(?:b64|base64)$/i, '') || 'arquivo.bin');
    return `${safeName(baseName(item.file.name))}.${definitions[item.target].extension}`;
  }

  async function convertItem(item) {
    item.status = 'converting';
    item.error = '';
    updateItem(item);
    await nextPaint();
    try {
      const category = categoryOf(item.file);
      let blob;
      if (item.target === 'base64') blob = await toBase64(item.file);
      else if (item.target === 'gzip') blob = await gzipFile(item.file);
      else if (item.target === 'ungzip') blob = await ungzipFile(item.file);
      else if (item.target === 'binary') blob = await fromBase64(item.file);
      else if (category === 'image') blob = await convertImage(item.file, item.target);
      else if (category === 'audio' && item.target === 'wav') blob = await convertAudio(item.file);
      else if (category === 'text') blob = await convertText(item.file, item.target);
      else throw new Error('Esta combinação de formatos não pode ser processada localmente.');
      if (!blob || !blob.size) throw new Error('A conversão gerou um arquivo vazio.');
      item.output = blob;
      item.outputName = outputNameFor(item);
      item.status = 'done';
    } catch (error) {
      item.output = null;
      item.status = 'error';
      item.error = error instanceof SyntaxError ? 'O conteúdo do arquivo não possui a estrutura esperada.' : (error.message || 'Não foi possível converter este arquivo.');
    }
    updateItem(item);
  }

  async function convertAll() {
    if (state.converting || !state.items.length) return;
    state.converting = true;
    elements.convert.querySelector('span').textContent = 'Convertendo…';
    state.items.forEach(updateItem);
    updateSummary();
    for (const item of state.items) await convertItem(item);
    state.converting = false;
    elements.convert.querySelector('span').textContent = 'Converter novamente';
    state.items.forEach(updateItem);
    updateSummary();
    const completed = state.items.filter((item) => item.status === 'done').length;
    const failed = state.items.length - completed;
    showToast(failed ? `${completed} concluído(s) e ${failed} com erro.` : `${completed} arquivo(s) convertido(s).`);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function downloadItem(item) {
    if (item.output) downloadBlob(item.output, item.outputName);
  }

  function downloadAll() {
    const completed = state.items.filter((item) => item.status === 'done' && item.output);
    completed.forEach((item, index) => setTimeout(() => downloadItem(item), index * 180));
    if (completed.length > 1) showToast('O navegador pode pedir permissão para baixar vários arquivos.');
  }

  function openPicker() {
    if (!state.converting) elements.fileInput.click();
  }

  function bindDropZone() {
    ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('dragging');
    }));
    elements.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  }

  elements.select.addEventListener('click', (event) => { event.stopPropagation(); openPicker(); });
  elements.dropZone.addEventListener('click', openPicker);
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(); }
  });
  elements.fileInput.addEventListener('change', () => addFiles(elements.fileInput.files));
  elements.add.addEventListener('click', openPicker);
  elements.clear.addEventListener('click', clearQueue);
  elements.convert.addEventListener('click', convertAll);
  elements.downloadAll.addEventListener('click', downloadAll);
  elements.quality.addEventListener('input', () => {
    elements.qualityValue.value = `${elements.quality.value}%`;
    state.items.filter((item) => ['jpg', 'webp'].includes(item.target)).forEach((item) => { resetItem(item); updateItem(item); });
    updateSummary();
  });
  bindDropZone();
  updateSummary();
})();
