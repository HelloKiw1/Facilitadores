(() => {
  'use strict';

  const MAX_ENHANCE_PIXELS = 12_000_000;
  const MAX_SEGMENT_DIMENSION = 800;

  const state = {
    file: null,
    originalUrl: '',
    originalImage: null,
    originalCanvas: document.createElement('canvas'),
    tool: 'remove',
    mode: 'smart',
    brush: 'erase',
    drawing: false,
    drawingKind: '',
    lastPoint: null,
    history: [],
    hasSmartResult: false,
    exportBlob: null,
    exportExtension: 'png',
    resultLabel: '',
    busy: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const elements = {
    landing: $('#landingView'), studio: $('#studioView'), input: $('#fileInput'),
    heroDrop: $('#heroDropZone'), heroSelect: $('#heroSelectButton'),
    back: $('#backButton'), change: $('#changeImageButton'), download: $('#downloadButton'),
    fileName: $('#fileName'), fileMeta: $('#fileMeta'), canvas: $('#editorCanvas'), selectionCanvas: $('#selectionCanvas'),
    canvasShell: $('#canvasShell'), loader: $('#canvasLoader'), compare: $('#compareImage'),
    compareButton: $('#compareButton'), stats: $('#resultStats'),
    removePanel: $('#removePanel'), enhancePanel: $('#enhancePanel'), compressPanel: $('#compressPanel'),
    smartBlock: $('#smartBlock'), brushBlock: $('#brushBlock'), smartBrushSize: $('#smartBrushSize'),
    smartBrushSizeValue: $('#smartBrushSizeValue'), clearMark: $('#clearMarkButton'), smartSelect: $('#smartSelectButton'),
    brushSize: $('#brushSize'), brushSizeValue: $('#brushSizeValue'),
    undo: $('#undoButton'), reset: $('#resetButton'), scale: $('#scaleSelect'),
    clarity: $('#clarityRange'), clarityValue: $('#clarityValue'), enhance: $('#enhanceButton'),
    format: $('#formatSelect'), dimension: $('#dimensionSelect'), quality: $('#qualityRange'),
    qualityValue: $('#qualityValue'), compress: $('#compressButton'),
    status: $('#statusBox'), statusTitle: $('#statusTitle'), statusMessage: $('#statusMessage'),
    error: $('#errorBox'), toast: $('#toast'), backgroundColor: $('#backgroundColor'),
  };
  const context = elements.canvas.getContext('2d', { willReadFrequently: true });
  const selectionContext = elements.selectionCanvas.getContext('2d', { willReadFrequently: true });
  const originalContext = state.originalCanvas.getContext('2d', { willReadFrequently: true });

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index === 0 || bytes >= 10 * (1024 ** index) ? 0 : 1)} ${units[index]}`;
  }

  function safeBaseName(name) {
    return (name || 'imagem').replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'imagem';
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2500);
  }

  function showError(message = '') {
    elements.error.textContent = message;
    elements.error.classList.toggle('hidden', !message);
  }

  function setStatus(active, title = 'Processando…', message = 'Isso pode levar alguns segundos.') {
    state.busy = active;
    elements.status.classList.toggle('hidden', !active);
    elements.statusTitle.textContent = title;
    elements.statusMessage.textContent = message;
    elements.smartSelect.disabled = active;
    elements.enhance.disabled = active;
    elements.compress.disabled = active;
    elements.download.disabled = active || (!state.exportBlob && !elements.canvas.width);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir essa imagem.'));
      image.src = source;
    });
  }

  async function chooseFile(file) {
    if (state.busy) return;
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!file.type.startsWith('image/') && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      showToast('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    showError('');
    elements.loader.classList.remove('hidden');
    if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
    state.file = file;
    state.originalUrl = URL.createObjectURL(file);
    try {
      state.originalImage = await loadImage(state.originalUrl);
      const width = state.originalImage.naturalWidth;
      const height = state.originalImage.naturalHeight;
      if (!width || !height) throw new Error('A imagem não possui dimensões válidas.');
      state.originalCanvas.width = width;
      state.originalCanvas.height = height;
      originalContext.clearRect(0, 0, width, height);
      originalContext.drawImage(state.originalImage, 0, 0);
      elements.compare.src = state.originalUrl;
      elements.fileName.textContent = file.name;
      elements.fileMeta.textContent = `${width} × ${height} px · ${formatBytes(file.size)}`;
      elements.landing.classList.add('hidden');
      elements.studio.classList.remove('hidden');
      resetToOriginal();
      selectTool(state.tool, true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) {
      showError(error.message);
    } finally {
      elements.loader.classList.add('hidden');
      elements.input.value = '';
    }
  }

  function drawOriginalToOutput() {
    elements.canvas.width = state.originalCanvas.width;
    elements.canvas.height = state.originalCanvas.height;
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.drawImage(state.originalCanvas, 0, 0);
  }

  function resetToOriginal() {
    if (!state.originalImage) return;
    drawOriginalToOutput();
    elements.selectionCanvas.width = state.originalCanvas.width;
    elements.selectionCanvas.height = state.originalCanvas.height;
    selectionContext.clearRect(0, 0, elements.selectionCanvas.width, elements.selectionCanvas.height);
    state.history = [];
    state.hasSmartResult = false;
    state.exportBlob = null;
    state.exportExtension = 'png';
    state.resultLabel = 'Original no editor';
    elements.undo.disabled = true;
    elements.download.disabled = false;
    updateStats();
  }

  function selectTool(tool, keepCanvas = false) {
    state.tool = tool;
    $$('[data-switch-tool]').forEach((button) => button.classList.toggle('active', button.dataset.switchTool === tool));
    elements.removePanel.classList.toggle('hidden', tool !== 'remove');
    elements.enhancePanel.classList.toggle('hidden', tool !== 'enhance');
    elements.compressPanel.classList.toggle('hidden', tool !== 'compress');
    elements.canvas.classList.toggle('editing', tool === 'remove');
    showError('');
    if (!keepCanvas) resetToOriginal();
    if (tool === 'remove') selectMode(state.mode, true);
  }

  function selectMode(mode, preserve = false) {
    state.mode = mode;
    $$('.mode-card').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    elements.smartBlock.classList.toggle('hidden', mode === 'manual');
    elements.brushBlock.classList.toggle('hidden', mode !== 'manual' && !state.hasSmartResult);
    elements.smartSelect.textContent = mode === 'mixed' ? '✦ Identificar e abrir acabamento' : '✦ Identificar objeto completo';
    elements.canvas.classList.add('editing');
    if (mode === 'manual' && !preserve) resetToOriginal();
    if (mode !== 'manual' && !preserve) {
      resetToOriginal();
      elements.smartBlock.classList.remove('hidden');
      elements.brushBlock.classList.add('hidden');
    }
    showError('');
  }

  async function setCanvasFromBlob(blob, label) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadImage(url);
      elements.canvas.width = image.naturalWidth;
      elements.canvas.height = image.naturalHeight;
      context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
      context.drawImage(image, 0, 0);
      state.exportBlob = blob;
      state.exportExtension = blob.type.includes('webp') ? 'webp' : blob.type.includes('jpeg') ? 'jpg' : 'png';
      state.resultLabel = label;
      elements.download.disabled = false;
      updateStats(blob);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function clearMarking() {
    selectionContext.clearRect(0, 0, elements.selectionCanvas.width, elements.selectionCanvas.height);
  }

  class MinHeap {
    constructor() {
      this.indices = [];
      this.costs = [];
    }

    get size() { return this.indices.length; }

    push(index, cost) {
      let position = this.indices.length;
      this.indices.push(index);
      this.costs.push(cost);
      while (position > 0) {
        const parent = (position - 1) >> 1;
        if (this.costs[parent] <= cost) break;
        this.indices[position] = this.indices[parent];
        this.costs[position] = this.costs[parent];
        position = parent;
      }
      this.indices[position] = index;
      this.costs[position] = cost;
    }

    pop() {
      if (!this.indices.length) return null;
      const index = this.indices[0];
      const cost = this.costs[0];
      const lastIndex = this.indices.pop();
      const lastCost = this.costs.pop();
      if (this.indices.length) {
        let position = 0;
        while (true) {
          const left = position * 2 + 1;
          const right = left + 1;
          if (left >= this.indices.length) break;
          let child = left;
          if (right < this.indices.length && this.costs[right] < this.costs[left]) child = right;
          if (this.costs[child] >= lastCost) break;
          this.indices[position] = this.indices[child];
          this.costs[position] = this.costs[child];
          position = child;
        }
        this.indices[position] = lastIndex;
        this.costs[position] = lastCost;
      }
      return { index, cost };
    }
  }

  function geodesicDistances(pixels, width, height, seeds) {
    const total = width * height;
    const distances = new Float32Array(total);
    distances.fill(Number.POSITIVE_INFINITY);
    const heap = new MinHeap();
    seeds.forEach((index) => {
      if (index < 0 || index >= total || distances[index] === 0) return;
      distances[index] = 0;
      heap.push(index, 0);
    });
    const relax = (from, to, currentCost) => {
      const a = from * 4;
      const b = to * 4;
      const red = pixels[a] - pixels[b];
      const green = pixels[a + 1] - pixels[b + 1];
      const blue = pixels[a + 2] - pixels[b + 2];
      const edge = Math.sqrt(red * red * .3 + green * green * .59 + blue * blue * .11);
      const nextCost = Math.max(currentCost, edge) + .018;
      if (nextCost < distances[to]) {
        distances[to] = nextCost;
        heap.push(to, nextCost);
      }
    };
    while (heap.size) {
      const current = heap.pop();
      if (current.cost > distances[current.index] + .0001) continue;
      const x = current.index % width;
      const y = Math.floor(current.index / width);
      if (x > 0) relax(current.index, current.index - 1, current.cost);
      if (x + 1 < width) relax(current.index, current.index + 1, current.cost);
      if (y > 0) relax(current.index, current.index - width, current.cost);
      if (y + 1 < height) relax(current.index, current.index + width, current.cost);
    }
    return distances;
  }

  function buildColorClusters(pixels, indices, requestedCount) {
    const samples = [];
    const step = Math.max(1, Math.floor(indices.length / 1400));
    for (let position = 0; position < indices.length; position += step) {
      const offset = indices[position] * 4;
      samples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
    }
    const count = Math.max(1, Math.min(requestedCount, samples.length));
    const clusters = Array.from({ length: count }, (_, index) => samples[Math.floor(index * samples.length / count)].slice());
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const sums = Array.from({ length: count }, () => [0, 0, 0, 0]);
      samples.forEach((sample) => {
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        clusters.forEach((cluster, index) => {
          const distance = colorDistance(sample[0], sample[1], sample[2], cluster);
          if (distance < bestDistance) { bestDistance = distance; best = index; }
        });
        sums[best][0] += sample[0];
        sums[best][1] += sample[1];
        sums[best][2] += sample[2];
        sums[best][3] += 1;
      });
      sums.forEach((sum, index) => {
        if (sum[3]) clusters[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
      });
    }
    return clusters;
  }

  function colorDistance(red, green, blue, cluster) {
    const deltaRed = red - cluster[0];
    const deltaGreen = green - cluster[1];
    const deltaBlue = blue - cluster[2];
    return Math.sqrt(deltaRed * deltaRed * .3 + deltaGreen * deltaGreen * .59 + deltaBlue * deltaBlue * .11);
  }

  function nearestClusterDistance(pixels, pixelIndex, clusters) {
    const offset = pixelIndex * 4;
    let nearest = Number.POSITIVE_INFINITY;
    clusters.forEach((cluster) => {
      nearest = Math.min(nearest, colorDistance(pixels[offset], pixels[offset + 1], pixels[offset + 2], cluster));
    });
    return nearest;
  }

  function connectedForeground(candidates, width, height, seeds) {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let start = 0;
    let end = 0;
    seeds.forEach((index) => {
      if (visited[index]) return;
      visited[index] = 1;
      queue[end++] = index;
    });
    while (start < end) {
      const index = queue[start++];
      const x = index % width;
      const y = Math.floor(index / width);
      const visit = (neighbor) => {
        if (!visited[neighbor] && candidates[neighbor]) {
          visited[neighbor] = 1;
          queue[end++] = neighbor;
        }
      };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    return visited;
  }

  async function smartSelectObject() {
    if (!state.originalImage || state.busy) return;
    const markData = selectionContext.getImageData(0, 0, elements.selectionCanvas.width, elements.selectionCanvas.height).data;
    let markedPixels = 0;
    for (let index = 3; index < markData.length; index += 16) {
      if (markData[index] > 10) markedPixels += 1;
    }
    if (markedPixels < 8) {
      showError('Pinte alguns traços dentro do objeto que deseja manter.');
      return;
    }
    showError('');
    setStatus(true, 'Identificando o objeto…', 'Analisando cores e bordas localmente neste dispositivo.');
    await nextFrame();
    try {
      const originalWidth = state.originalCanvas.width;
      const originalHeight = state.originalCanvas.height;
      const scale = Math.min(1, MAX_SEGMENT_DIMENSION / Math.max(originalWidth, originalHeight));
      const width = Math.max(2, Math.round(originalWidth * scale));
      const height = Math.max(2, Math.round(originalHeight * scale));
      const processing = document.createElement('canvas');
      processing.width = width;
      processing.height = height;
      const processingContext = processing.getContext('2d');
      processingContext.drawImage(state.originalCanvas, 0, 0, width, height);
      const seedCanvas = document.createElement('canvas');
      seedCanvas.width = width;
      seedCanvas.height = height;
      seedCanvas.getContext('2d').drawImage(elements.selectionCanvas, 0, 0, width, height);

      const pixels = processingContext.getImageData(0, 0, width, height).data;
      const seedPixels = seedCanvas.getContext('2d').getImageData(0, 0, width, height).data;
      const foregroundSeeds = [];
      const backgroundSeeds = [];
      const border = Math.max(2, Math.round(Math.min(width, height) * .012));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = y * width + x;
          if (seedPixels[offset * 4 + 3] > 30) foregroundSeeds.push(offset);
          if ((x < border || y < border || x >= width - border || y >= height - border) && ((x + y) % 2 === 0)) backgroundSeeds.push(offset);
        }
      }
      if (foregroundSeeds.length < 3) throw new Error('A marcação ficou pequena demais. Faça alguns traços dentro do objeto.');
      const foregroundDistance = geodesicDistances(pixels, width, height, foregroundSeeds);
      await nextFrame();
      const backgroundDistance = geodesicDistances(pixels, width, height, backgroundSeeds);
      await nextFrame();
      const foregroundClusters = buildColorClusters(pixels, foregroundSeeds, 5);
      const backgroundClusters = buildColorClusters(pixels, backgroundSeeds, 7);
      const candidates = new Uint8Array(width * height);
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const foregroundColor = nearestClusterDistance(pixels, offset, foregroundClusters);
        const backgroundColor = nearestClusterDistance(pixels, offset, backgroundClusters);
        const colorMatch = foregroundColor < backgroundColor * 1.18 + 8;
        const edgeMatch = foregroundDistance[offset] < backgroundDistance[offset] * 1.12 + 2;
        candidates[offset] = colorMatch || edgeMatch ? 1 : 0;
      }
      const foregroundMask = connectedForeground(candidates, width, height, foregroundSeeds);

      const smallMask = document.createElement('canvas');
      smallMask.width = width;
      smallMask.height = height;
      const smallContext = smallMask.getContext('2d');
      const smallImage = smallContext.createImageData(width, height);
      for (let offset = 0; offset < foregroundDistance.length; offset += 1) {
        const foreground = foregroundMask[offset] === 1;
        const pixel = offset * 4;
        smallImage.data[pixel] = 255;
        smallImage.data[pixel + 1] = 255;
        smallImage.data[pixel + 2] = 255;
        smallImage.data[pixel + 3] = foreground ? 255 : 0;
      }
      smallContext.putImageData(smallImage, 0, 0);
      const fullMask = document.createElement('canvas');
      fullMask.width = originalWidth;
      fullMask.height = originalHeight;
      const fullMaskContext = fullMask.getContext('2d');
      fullMaskContext.imageSmoothingEnabled = true;
      fullMaskContext.imageSmoothingQuality = 'high';
      fullMaskContext.filter = 'blur(.45px)';
      fullMaskContext.drawImage(smallMask, 0, 0, originalWidth, originalHeight);

      drawOriginalToOutput();
      context.save();
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(fullMask, 0, 0);
      context.restore();
      clearMarking();
      state.hasSmartResult = true;
      state.history = [];
      state.exportBlob = null;
      state.exportExtension = 'png';
      state.resultLabel = 'Objeto identificado localmente';
      elements.undo.disabled = true;
      elements.brushBlock.classList.remove('hidden');
      elements.canvas.classList.add('editing');
      updateStats();
      showToast('Objeto identificado. Agora você pode apagar ou devolver detalhes.');
    } catch (error) {
      showError(error.message || 'Não foi possível identificar o objeto nesta imagem.');
    } finally {
      setStatus(false);
    }
  }

  function saveHistory() {
    try {
      state.history.push(elements.canvas.toDataURL('image/png'));
      if (state.history.length > 6) state.history.shift();
      elements.undo.disabled = false;
    } catch {
      state.history = [];
    }
  }

  async function undo() {
    const snapshot = state.history.pop();
    if (!snapshot) return;
    const image = await loadImage(snapshot);
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.drawImage(image, 0, 0);
    state.exportBlob = null;
    state.exportExtension = 'png';
    elements.undo.disabled = state.history.length === 0;
    updateStats();
  }

  function canvasPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * elements.canvas.width / rect.width,
      y: (event.clientY - rect.top) * elements.canvas.height / rect.height,
    };
  }

  function brushRadius() {
    const rect = elements.canvas.getBoundingClientRect();
    const displayRatio = elements.canvas.width / Math.max(1, rect.width);
    return Number(elements.brushSize.value) * displayRatio / 2;
  }

  function stampBrush(x, y) {
    const radius = brushRadius();
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    if (state.brush === 'erase') {
      context.globalCompositeOperation = 'destination-out';
      context.fill();
    } else {
      context.clip();
      context.globalCompositeOperation = 'source-over';
      context.drawImage(state.originalCanvas, 0, 0, elements.canvas.width, elements.canvas.height);
    }
    context.restore();
  }

  function drawBrushLine(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, brushRadius() * .35)));
    for (let step = 0; step <= steps; step += 1) {
      const amount = step / steps;
      stampBrush(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount);
    }
  }

  function smartBrushRadius() {
    const rect = elements.canvas.getBoundingClientRect();
    const displayRatio = elements.canvas.width / Math.max(1, rect.width);
    return Number(elements.smartBrushSize.value) * displayRatio / 2;
  }

  function stampSelection(x, y) {
    const radius = smartBrushRadius();
    selectionContext.save();
    selectionContext.beginPath();
    selectionContext.arc(x, y, radius, 0, Math.PI * 2);
    selectionContext.fillStyle = 'rgba(39, 190, 104, .82)';
    selectionContext.fill();
    selectionContext.restore();
  }

  function drawSelectionLine(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, smartBrushRadius() * .35)));
    for (let step = 0; step <= steps; step += 1) {
      const amount = step / steps;
      stampSelection(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount);
    }
  }

  function prepareSmartMarking() {
    resetToOriginal();
    state.hasSmartResult = false;
    elements.smartBlock.classList.remove('hidden');
    elements.brushBlock.classList.add('hidden');
    elements.canvas.classList.add('editing');
    clearMarking();
    showError('');
  }

  function startDrawing(event) {
    if (state.tool !== 'remove' || state.busy) return;
    const markingSmartObject = state.mode !== 'manual' && !state.hasSmartResult;
    if (!markingSmartObject && elements.brushBlock.classList.contains('hidden')) return;
    event.preventDefault();
    if (!markingSmartObject) saveHistory();
    state.drawing = true;
    state.drawingKind = markingSmartObject ? 'selection' : 'manual';
    state.lastPoint = canvasPoint(event);
    if (markingSmartObject) stampSelection(state.lastPoint.x, state.lastPoint.y);
    else stampBrush(state.lastPoint.x, state.lastPoint.y);
    elements.canvas.setPointerCapture?.(event.pointerId);
  }

  function continueDrawing(event) {
    if (!state.drawing) return;
    event.preventDefault();
    const point = canvasPoint(event);
    if (state.drawingKind === 'selection') drawSelectionLine(state.lastPoint, point);
    else drawBrushLine(state.lastPoint, point);
    state.lastPoint = point;
  }

  function stopDrawing() {
    if (!state.drawing) return;
    const completedKind = state.drawingKind;
    state.drawing = false;
    state.drawingKind = '';
    state.lastPoint = null;
    if (completedKind === 'selection') return;
    state.exportBlob = null;
    state.exportExtension = 'png';
    state.resultLabel = state.mode === 'mixed' ? 'Recorte refinado' : 'Edição manual';
    updateStats();
  }

  async function enhanceImage() {
    if (!state.originalImage || state.busy) return;
    showError('');
    setStatus(true, 'Melhorando a imagem…', 'Aumentando resolução e aplicando nitidez localmente.');
    try {
      await nextFrame();
      const requestedScale = Number(elements.scale.value);
      const width = state.originalCanvas.width;
      const height = state.originalCanvas.height;
      const safeScale = Math.min(requestedScale, Math.sqrt(MAX_ENHANCE_PIXELS / (width * height)));
      if (safeScale <= 1.001) throw new Error('A imagem já está no limite seguro de 12 megapixels para este editor.');
      const targetWidth = Math.max(1, Math.round(width * safeScale));
      const targetHeight = Math.max(1, Math.round(height * safeScale));
      const scaled = document.createElement('canvas');
      scaled.width = targetWidth;
      scaled.height = targetHeight;
      const scaledContext = scaled.getContext('2d', { willReadFrequently: true });
      scaledContext.imageSmoothingEnabled = true;
      scaledContext.imageSmoothingQuality = 'high';
      scaledContext.drawImage(state.originalCanvas, 0, 0, targetWidth, targetHeight);

      const amount = Number(elements.clarity.value) / 100;
      elements.canvas.width = targetWidth;
      elements.canvas.height = targetHeight;
      if (amount > 0) {
        const blurred = document.createElement('canvas');
        blurred.width = targetWidth;
        blurred.height = targetHeight;
        const blurredContext = blurred.getContext('2d', { willReadFrequently: true });
        blurredContext.filter = `blur(${Math.max(0.7, safeScale * .55)}px)`;
        blurredContext.drawImage(scaled, 0, 0);
        const tileHeight = 320;
        for (let y = 0; y < targetHeight; y += tileHeight) {
          const currentHeight = Math.min(tileHeight, targetHeight - y);
          const sharp = scaledContext.getImageData(0, y, targetWidth, currentHeight);
          const soft = blurredContext.getImageData(0, y, targetWidth, currentHeight);
          for (let index = 0; index < sharp.data.length; index += 4) {
            sharp.data[index] = clampChannel(sharp.data[index] + (sharp.data[index] - soft.data[index]) * amount * 1.45);
            sharp.data[index + 1] = clampChannel(sharp.data[index + 1] + (sharp.data[index + 1] - soft.data[index + 1]) * amount * 1.45);
            sharp.data[index + 2] = clampChannel(sharp.data[index + 2] + (sharp.data[index + 2] - soft.data[index + 2]) * amount * 1.45);
          }
          context.putImageData(sharp, 0, y);
          await nextFrame();
        }
      } else {
        context.drawImage(scaled, 0, 0);
      }
      state.exportBlob = await canvasToBlob(elements.canvas, 'image/png', 1);
      state.exportExtension = 'png';
      state.resultLabel = safeScale < requestedScale ? `Melhorada em ${safeScale.toFixed(1)}× (limite seguro)` : `Melhorada em ${requestedScale}×`;
      updateStats(state.exportBlob);
      showToast('Qualidade melhorada localmente.');
    } catch (error) {
      showError(error.message || 'Não foi possível melhorar a imagem.');
    } finally {
      setStatus(false);
    }
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Seu navegador não conseguiu gerar esse formato.')), type, quality);
    });
  }

  async function compressImage() {
    if (!state.originalImage || state.busy) return;
    showError('');
    setStatus(true, 'Comprimindo a imagem…', 'Tudo acontece neste dispositivo.');
    try {
      await nextFrame();
      const maxDimension = Number(elements.dimension.value);
      const width = state.originalCanvas.width;
      const height = state.originalCanvas.height;
      const ratio = maxDimension ? Math.min(1, maxDimension / Math.max(width, height)) : 1;
      const targetWidth = Math.max(1, Math.round(width * ratio));
      const targetHeight = Math.max(1, Math.round(height * ratio));
      const working = document.createElement('canvas');
      working.width = targetWidth;
      working.height = targetHeight;
      const workingContext = working.getContext('2d');
      workingContext.imageSmoothingEnabled = true;
      workingContext.imageSmoothingQuality = 'high';
      const type = elements.format.value;
      if (type === 'image/jpeg') {
        workingContext.fillStyle = '#fff';
        workingContext.fillRect(0, 0, targetWidth, targetHeight);
      }
      workingContext.drawImage(state.originalCanvas, 0, 0, targetWidth, targetHeight);
      const blob = await canvasToBlob(working, type, Number(elements.quality.value) / 100);
      await setCanvasFromBlob(blob, 'Imagem comprimida');
      state.exportExtension = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
      const reduction = Math.round((1 - blob.size / state.file.size) * 100);
      state.resultLabel = reduction > 0 ? `${reduction}% menor` : 'Novo formato gerado';
      updateStats(blob);
      showToast(reduction > 0 ? `Imagem ${reduction}% menor.` : 'Imagem convertida; o original já era bem otimizado.');
    } catch (error) {
      showError(error.message || 'Não foi possível comprimir a imagem.');
    } finally {
      setStatus(false);
    }
  }

  function updateStats(blob = state.exportBlob) {
    if (!state.file || !elements.canvas.width) return;
    const pieces = [
      `<span>Original: ${formatBytes(state.file.size)}</span>`,
      `<span>${elements.canvas.width} × ${elements.canvas.height} px</span>`,
    ];
    if (blob) pieces.push(`<span class="${blob.size < state.file.size ? 'good' : ''}">Resultado: ${formatBytes(blob.size)}</span>`);
    if (state.resultLabel) pieces.push(`<span>${state.resultLabel}</span>`);
    elements.stats.innerHTML = pieces.join('');
    elements.download.disabled = state.busy;
  }

  async function downloadResult() {
    if (!state.file || state.busy) return;
    try {
      const blob = state.exportBlob || await canvasToBlob(elements.canvas, 'image/png', 1);
      const extension = state.exportBlob ? state.exportExtension : 'png';
      const suffix = state.tool === 'remove' ? 'sem-fundo' : state.tool === 'enhance' ? 'melhorada' : 'comprimida';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeBaseName(state.file.name)}-${suffix}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      showError(error.message || 'Não foi possível preparar o download.');
    }
  }

  function leaveStudio() {
    if (state.busy) return;
    elements.studio.classList.add('hidden');
    elements.landing.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openFilePicker(tool = state.tool) {
    if (state.busy) return;
    state.tool = tool;
    elements.input.click();
  }

  function bindDropZone(zone) {
    ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
    }));
    zone.addEventListener('drop', (event) => chooseFile(Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/'))));
  }

  elements.heroSelect.addEventListener('click', (event) => { event.stopPropagation(); openFilePicker('remove'); });
  elements.heroDrop.addEventListener('click', () => openFilePicker('remove'));
  bindDropZone(elements.heroDrop);
  elements.input.addEventListener('change', () => chooseFile(elements.input.files[0]));
  $$('.tool-card').forEach((card) => card.addEventListener('click', () => openFilePicker(card.dataset.tool)));
  elements.back.addEventListener('click', leaveStudio);
  elements.change.addEventListener('click', () => openFilePicker(state.tool));
  elements.download.addEventListener('click', downloadResult);
  $$('[data-switch-tool]').forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.switchTool)));
  $$('.mode-card').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));
  elements.smartBrushSize.addEventListener('input', () => { elements.smartBrushSizeValue.value = `${elements.smartBrushSize.value} px`; });
  elements.clearMark.addEventListener('click', prepareSmartMarking);
  elements.smartSelect.addEventListener('click', smartSelectObject);
  $$('.brush-actions button').forEach((button) => button.addEventListener('click', () => {
    state.brush = button.dataset.brush;
    $$('.brush-actions button').forEach((item) => item.classList.toggle('active', item === button));
  }));
  elements.brushSize.addEventListener('input', () => { elements.brushSizeValue.value = `${elements.brushSize.value} px`; });
  elements.undo.addEventListener('click', undo);
  elements.reset.addEventListener('click', () => {
    if (state.mode === 'manual') resetToOriginal();
    else prepareSmartMarking();
  });
  elements.canvas.addEventListener('pointerdown', startDrawing);
  elements.canvas.addEventListener('pointermove', continueDrawing);
  elements.canvas.addEventListener('pointerup', stopDrawing);
  elements.canvas.addEventListener('pointercancel', stopDrawing);
  elements.canvas.addEventListener('pointerleave', (event) => { if (event.buttons === 0) stopDrawing(); });
  elements.clarity.addEventListener('input', () => { elements.clarityValue.value = `${elements.clarity.value}%`; });
  elements.quality.addEventListener('input', () => { elements.qualityValue.value = `${elements.quality.value}%`; });
  elements.format.addEventListener('change', () => {
    const lossless = elements.format.value === 'image/png';
    elements.quality.disabled = lossless;
    elements.qualityValue.value = lossless ? 'Sem perdas' : `${elements.quality.value}%`;
  });
  elements.enhance.addEventListener('click', enhanceImage);
  elements.compress.addEventListener('click', compressImage);

  const showOriginal = () => elements.compare.classList.add('visible');
  const hideOriginal = () => elements.compare.classList.remove('visible');
  elements.compareButton.addEventListener('pointerdown', showOriginal);
  elements.compareButton.addEventListener('pointerup', hideOriginal);
  elements.compareButton.addEventListener('pointerleave', hideOriginal);
  elements.compareButton.addEventListener('keydown', (event) => { if (event.key === ' ' || event.key === 'Enter') showOriginal(); });
  elements.compareButton.addEventListener('keyup', hideOriginal);

  $$('[data-background]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-background]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelector('.color-picker').classList.remove('active');
    elements.canvasShell.className = `canvas-shell ${button.dataset.background}`;
  }));
  elements.backgroundColor.addEventListener('input', () => {
    $$('[data-background]').forEach((item) => item.classList.remove('active'));
    const picker = document.querySelector('.color-picker');
    picker.classList.add('active');
    picker.style.background = elements.backgroundColor.value;
    elements.canvasShell.className = 'canvas-shell custom';
    elements.canvasShell.style.backgroundColor = elements.backgroundColor.value;
  });

  document.addEventListener('paste', (event) => {
    const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'));
    if (file) chooseFile(new File([file], file.name || 'imagem-colada.png', { type: file.type }));
  });

})();
