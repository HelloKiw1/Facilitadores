import './styles.css';
import { icon } from './icons.js';
import {
  compressPdf,
  formatBytes,
  imagesToPdf,
  inspectPdf,
  mergePdfs,
  officeToPdf,
  pdfToJpg,
  saveBlob,
  splitPdf,
} from './tools.js';

const toolConfig = {
  merge: {
    title: 'Juntar PDF',
    short: 'Combine arquivos na ordem que quiser',
    description: 'Una vários PDFs em um só documento. Reordene os arquivos antes de processar.',
    icon: 'merge',
    accept: '.pdf,application/pdf',
    hint: 'Selecione dois ou mais arquivos PDF',
    multiple: true,
    button: 'Juntar PDFs',
  },
  split: {
    title: 'Dividir PDF',
    short: 'Extraia páginas ou separe o documento',
    description: 'Escolha páginas específicas ou crie um PDF independente para cada página.',
    icon: 'split',
    accept: '.pdf,application/pdf',
    hint: 'Selecione um arquivo PDF',
    multiple: false,
    button: 'Dividir PDF',
  },
  compress: {
    title: 'Comprimir PDF',
    short: 'Reduza o tamanho do seu arquivo',
    description: 'Otimize o PDF com o equilíbrio de qualidade que você escolher.',
    icon: 'compress',
    accept: '.pdf,application/pdf',
    hint: 'Selecione um arquivo PDF',
    multiple: false,
    button: 'Comprimir PDF',
  },
  office: {
    title: 'Office para PDF',
    short: 'Converta Word, Excel e PowerPoint',
    description: 'Transforme documentos modernos do Office em PDF sem enviar nada para a internet.',
    icon: 'office',
    accept: '.docx,.xlsx,.pptx',
    hint: 'Selecione um DOCX, XLSX ou PPTX',
    multiple: false,
    button: 'Converter para PDF',
  },
  pdfToJpg: {
    title: 'PDF para JPG',
    short: 'Transforme cada página em uma imagem',
    description: 'Converta as páginas do PDF em imagens JPG de alta qualidade.',
    icon: 'image',
    accept: '.pdf,application/pdf',
    hint: 'Selecione um arquivo PDF',
    multiple: false,
    button: 'Converter para JPG',
  },
  imageToPdf: {
    title: 'Imagens para PDF',
    short: 'Monte um PDF com suas imagens',
    description: 'Organize imagens JPG, PNG ou WebP em um único arquivo PDF.',
    icon: 'imageToPdf',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    hint: 'Selecione uma ou mais imagens',
    multiple: true,
    button: 'Criar PDF',
  },
};

const state = {
  activeTool: null,
  files: [],
  result: null,
  busy: false,
};

const cards = Object.entries(toolConfig).map(([key, tool]) => `
  <button class="tool-card" type="button" data-tool="${key}">
    <span class="tool-icon">${icon(tool.icon, 25)}</span>
    <span class="tool-arrow">${icon('arrow', 18)}</span>
    <h3>${tool.title}</h3>
    <p>${tool.description}</p>
  </button>
`).join('');

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="Kiwi PDF — página inicial">
      <span class="brand-mark">${icon('logo', 23)}</span>
      <span>Kiwi <b>PDF</b></span>
    </a>
    <nav class="header-nav" aria-label="Navegação principal">
      <a href="#ferramentas">Ferramentas</a>
      <a href="#privacidade">Como funciona</a>
      <span class="privacy-pill">${icon('shield', 16)} <span>100% no navegador</span></span>
      <a class="all-tools-link" href="../">Todos os facilitadores</a>
    </nav>
  </header>

  <main id="top">
    <section class="hero">
      <span class="eyebrow"><span class="eyebrow-dot"></span> Gratuito, simples e privado</span>
      <h1>Seus PDFs resolvidos.<br><span>Seus arquivos protegidos.</span></h1>
      <p>Junte, divida, comprima e converta documentos direto no navegador. Sem cadastro, sem instalação e sem enviar arquivos para nenhum servidor.</p>
      <div class="trust-row">
        <span><i class="trust-check">${icon('check', 12)}</i> Sem upload</span>
        <span><i class="trust-check">${icon('check', 12)}</i> Sem limites artificiais</span>
        <span><i class="trust-check">${icon('check', 12)}</i> Funciona em qualquer dispositivo</span>
      </div>
    </section>

    <section class="tools-section" id="ferramentas">
      <div class="section-heading">
        <h2>O que você precisa fazer?</h2>
        <p>Escolha uma ferramenta para começar</p>
      </div>
      <div class="tool-grid">${cards}</div>
    </section>

    <section class="privacy-section" id="privacidade">
      <div class="privacy-inner">
        <div class="privacy-copy">
          <span class="eyebrow">${icon('lock', 15)} Privacidade de verdade</span>
          <h2>Seu arquivo não sai do seu dispositivo.</h2>
          <p>O processamento acontece com recursos do próprio navegador. Nenhum documento é enviado, armazenado ou analisado por um servidor. Ao fechar a página, tudo desaparece.</p>
        </div>
        <div class="privacy-visual" aria-hidden="true">
          <div class="privacy-file">
            <span class="privacy-file-icon">${icon('file', 22)}</span>
            <span><strong>meu-documento.pdf</strong><small>Processando localmente…</small></span>
          </div>
          <div class="local-path"><span>Seu dispositivo</span><span class="local-line"></span><span>${icon('shield', 17)}</span></div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <span>Kiwi PDF · Ferramentas abertas e locais para seus documentos.</span>
    <a href="https://github.com/HelloKiw1/Facilitadores" target="_blank" rel="noreferrer">${icon('github', 17)} Código no GitHub</a>
  </footer>

  <div class="workspace-backdrop" id="workspaceBackdrop" aria-hidden="true">
    <section class="workspace" role="dialog" aria-modal="true" aria-labelledby="workspaceTitle">
      <header class="workspace-header">
        <span class="tool-icon" id="workspaceIcon"></span>
        <div class="workspace-title">
          <h2 id="workspaceTitle"></h2>
          <p id="workspaceSubtitle"></p>
        </div>
        <button class="icon-button" id="closeWorkspace" type="button" aria-label="Fechar">${icon('close', 20)}</button>
      </header>

      <div class="workspace-body" id="selectionView">
        <label class="drop-zone" id="dropZone" for="fileInput">
          <span class="drop-icon">${icon('upload', 28)}</span>
          <strong id="dropTitle">Arraste seus arquivos aqui</strong>
          <p id="dropHint"></p>
          <span class="select-button">Escolher arquivos</span>
          <input class="file-input" id="fileInput" type="file" />
        </label>
        <div class="file-list" id="fileList"></div>
        <div id="toolOptions"></div>
        <div class="error-box" id="errorBox" role="alert"></div>
        <footer class="workspace-footer">
          <span class="local-note">${icon('lock', 14)} Processado apenas neste dispositivo</span>
          <button class="primary-button" id="processButton" type="button" disabled>Continuar</button>
        </footer>
      </div>

      <div class="processing" id="processingView">
        <div class="processing-orbit"><span class="brand-mark">${icon('logo', 23)}</span></div>
        <h3>Trabalhando no seu arquivo</h3>
        <p id="processingMessage">Preparando tudo…</p>
        <div class="progress-track"><div class="progress-bar" id="progressBar"></div></div>
        <span class="progress-label" id="progressLabel">8%</span>
      </div>

      <div class="result" id="resultView">
        <span class="success-mark">${icon('check', 34)}</span>
        <h3>Pronto para baixar!</h3>
        <p>Seu arquivo foi processado localmente e está pronto.</p>
        <div class="result-meta" id="resultMeta"></div>
        <div class="result-actions">
          <button class="primary-button" id="downloadButton" type="button">${icon('download', 18)} Baixar arquivo</button>
          <button class="secondary-button" id="startAgainButton" type="button">${icon('refresh', 17)} Fazer outro</button>
        </div>
      </div>
    </section>
  </div>

  <div class="conversion-stage" id="conversionStage" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status"></div>
`;

const elements = {
  backdrop: document.querySelector('#workspaceBackdrop'),
  workspace: document.querySelector('.workspace'),
  title: document.querySelector('#workspaceTitle'),
  subtitle: document.querySelector('#workspaceSubtitle'),
  icon: document.querySelector('#workspaceIcon'),
  close: document.querySelector('#closeWorkspace'),
  input: document.querySelector('#fileInput'),
  dropZone: document.querySelector('#dropZone'),
  dropHint: document.querySelector('#dropHint'),
  fileList: document.querySelector('#fileList'),
  options: document.querySelector('#toolOptions'),
  process: document.querySelector('#processButton'),
  error: document.querySelector('#errorBox'),
  selection: document.querySelector('#selectionView'),
  processing: document.querySelector('#processingView'),
  processingMessage: document.querySelector('#processingMessage'),
  progressBar: document.querySelector('#progressBar'),
  progressLabel: document.querySelector('#progressLabel'),
  result: document.querySelector('#resultView'),
  resultMeta: document.querySelector('#resultMeta'),
  download: document.querySelector('#downloadButton'),
  again: document.querySelector('#startAgainButton'),
  stage: document.querySelector('#conversionStage'),
  toast: document.querySelector('#toast'),
};

function optionsTemplate(tool) {
  if (tool === 'split') return `
    <div class="options">
      <div><span class="field-label">COMO DIVIDIR</span>
        <div class="segmented" style="grid-template-columns:repeat(2,1fr)">
          <label><input type="radio" name="splitMode" value="range" checked><span>Extrair páginas</span></label>
          <label><input type="radio" name="splitMode" value="all"><span>Uma por arquivo</span></label>
        </div>
      </div>
      <div class="field" id="rangeField"><label for="pageRange">PÁGINAS</label><input id="pageRange" value="1" placeholder="Ex.: 1-3, 5, 8-10"></div>
      <span class="note">${icon('file', 15)} Use vírgulas para combinar páginas e hífen para criar intervalos.</span>
    </div>`;
  if (tool === 'compress') return `
    <div class="options"><div><span class="field-label">NÍVEL DE COMPRESSÃO</span>
      <div class="segmented">
        <label><input type="radio" name="compression" value="light"><span>Leve</span></label>
        <label><input type="radio" name="compression" value="balanced" checked><span>Equilibrada</span></label>
        <label><input type="radio" name="compression" value="strong"><span>Forte</span></label>
      </div>
    </div><span class="note">${icon('file', 15)} A compressão recria as páginas como imagens. Textos deixam de ser selecionáveis.</span></div>`;
  if (tool === 'office') return `
    <div class="options"><span class="note">${icon('shield', 16)} Compatível com DOCX, XLSX e PPTX. Layouts avançados, fontes especiais, animações e macros podem ser simplificados pelo navegador.</span></div>`;
  if (tool === 'pdfToJpg') return `
    <div class="options"><div><span class="field-label">QUALIDADE DAS IMAGENS</span>
      <div class="segmented" style="grid-template-columns:repeat(2,1fr)">
        <label><input type="radio" name="jpgQuality" value="high" checked><span>Alta qualidade</span></label>
        <label><input type="radio" name="jpgQuality" value="compact"><span>Arquivo menor</span></label>
      </div>
    </div><span class="note">${icon('file', 15)} PDFs com várias páginas serão entregues em um arquivo ZIP.</span></div>`;
  if (tool === 'imageToPdf') return `
    <div class="options">
      <div class="options-row">
        <div class="field"><label for="pageSize">TAMANHO DA PÁGINA</label><select id="pageSize"><option value="a4">A4</option><option value="original">Tamanho da imagem</option></select></div>
        <div class="field"><label for="orientation">ORIENTAÇÃO</label><select id="orientation"><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></div>
      </div>
      <div class="field"><label for="margin">MARGEM</label><select id="margin"><option value="0">Sem margem</option><option value="10" selected>Pequena (10 mm)</option><option value="20">Grande (20 mm)</option></select></div>
    </div>`;
  return '';
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function showError(message = '') {
  elements.error.textContent = message;
  elements.error.classList.toggle('visible', Boolean(message));
}

function openWorkspace(toolKey) {
  const config = toolConfig[toolKey];
  state.activeTool = toolKey;
  state.files = [];
  state.result = null;
  state.busy = false;
  elements.title.textContent = config.title;
  elements.subtitle.textContent = config.short;
  elements.icon.innerHTML = icon(config.icon, 23);
  elements.icon.style.setProperty('--accent', getComputedStyle(document.querySelector(`[data-tool="${toolKey}"]`)).getPropertyValue('--accent'));
  elements.icon.style.setProperty('--accent-soft', getComputedStyle(document.querySelector(`[data-tool="${toolKey}"]`)).getPropertyValue('--accent-soft'));
  elements.input.accept = config.accept;
  elements.input.multiple = config.multiple;
  elements.input.value = '';
  elements.dropHint.textContent = `${config.hint} · clique ou arraste e solte`;
  elements.options.innerHTML = optionsTemplate(toolKey);
  elements.process.textContent = config.button;
  elements.fileList.innerHTML = '';
  elements.selection.style.display = 'block';
  elements.processing.classList.remove('active');
  elements.result.classList.remove('active');
  elements.backdrop.classList.add('open');
  elements.backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  bindOptionEvents();
  updateProcessButton();
  setTimeout(() => elements.close.focus(), 80);
}

function closeWorkspace() {
  if (state.busy) return;
  elements.backdrop.classList.remove('open');
  elements.backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.files = [];
  state.result = null;
  elements.stage.innerHTML = '';
}

function isFileAllowed(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['merge', 'split', 'compress', 'pdfToJpg'].includes(state.activeTool)) return extension === 'pdf';
  if (state.activeTool === 'office') return ['docx', 'xlsx', 'pptx'].includes(extension);
  if (state.activeTool === 'imageToPdf') return ['jpg', 'jpeg', 'png', 'webp'].includes(extension) || file.type.startsWith('image/');
  return false;
}

async function addFiles(fileList) {
  const config = toolConfig[state.activeTool];
  const incoming = Array.from(fileList).filter((file) => {
    if (!isFileAllowed(file)) {
      showToast(`Formato não compatível: ${file.name}`);
      return false;
    }
    return true;
  });
  if (!incoming.length) return;
  state.files = config.multiple ? [...state.files, ...incoming] : [incoming[0]];
  state.files = state.files.filter((file, index, array) => index === array.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified));
  showError('');
  renderFiles();
  updateProcessButton();

  if (['merge', 'split', 'compress', 'pdfToJpg'].includes(state.activeTool)) {
    await Promise.all(state.files.map(async (file) => {
      if (file._pdfPages || file._pdfError) return;
      try {
        const info = await inspectPdf(file);
        Object.defineProperty(file, '_pdfPages', { value: info.pages, configurable: true });
      } catch {
        Object.defineProperty(file, '_pdfError', { value: true, configurable: true });
      }
    }));
    renderFiles();
    updateProcessButton();
  }
}

function renderFiles() {
  elements.fileList.innerHTML = state.files.map((file, index) => {
    const pageText = file._pdfError ? 'PDF protegido ou inválido' : file._pdfPages ? `${file._pdfPages} página${file._pdfPages === 1 ? '' : 's'} · ` : '';
    const moveActions = toolConfig[state.activeTool].multiple ? `
      <button type="button" data-action="up" data-index="${index}" aria-label="Mover para cima" ${index === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
      <button type="button" data-action="down" data-index="${index}" aria-label="Mover para baixo" ${index === state.files.length - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>` : '';
    return `<div class="file-row">
      <span class="file-badge">${icon(state.activeTool === 'imageToPdf' ? 'image' : 'file', 20)}</span>
      <span class="file-info"><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><small>${pageText}${formatBytes(file.size)}</small></span>
      <span class="file-actions">${moveActions}<button class="danger" type="button" data-action="remove" data-index="${index}" aria-label="Remover arquivo">${icon('trash', 16)}</button></span>
    </div>`;
  }).join('');
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
}

function updateProcessButton() {
  const invalidPdf = state.files.some((file) => file._pdfError);
  const enough = state.activeTool === 'merge' ? state.files.length >= 2 : state.files.length >= 1;
  elements.process.disabled = !enough || invalidPdf || state.busy;
}

function bindOptionEvents() {
  const splitRadios = elements.options.querySelectorAll('input[name="splitMode"]');
  splitRadios.forEach((radio) => radio.addEventListener('change', () => {
    const rangeField = document.querySelector('#rangeField');
    if (rangeField) rangeField.style.display = radio.value === 'range' && radio.checked ? 'block' : radio.checked ? 'none' : rangeField.style.display;
  }));
  const pageSize = document.querySelector('#pageSize');
  pageSize?.addEventListener('change', () => {
    const orientation = document.querySelector('#orientation');
    orientation.disabled = pageSize.value === 'original';
  });
}

function updateProgress(value, message) {
  const percentage = Math.max(3, Math.min(100, Math.round(value * 100)));
  elements.progressBar.style.width = `${percentage}%`;
  elements.progressLabel.textContent = `${percentage}%`;
  if (message) elements.processingMessage.textContent = message;
}

function radioValue(name) {
  return elements.options.querySelector(`input[name="${name}"]:checked`)?.value;
}

async function processFiles() {
  if (elements.process.disabled || state.busy) return;
  state.busy = true;
  updateProcessButton();
  showError('');
  elements.selection.style.display = 'none';
  elements.processing.classList.add('active');
  updateProgress(.04, 'Lendo os arquivos no navegador');

  try {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const progress = (value, message) => updateProgress(.06 + value * .9, message);
    if (state.activeTool === 'merge') state.result = await mergePdfs(state.files, progress);
    if (state.activeTool === 'split') {
      state.result = await splitPdf(
        state.files[0],
        document.querySelector('#pageRange')?.value || '',
        radioValue('splitMode'),
        progress,
      );
    }
    if (state.activeTool === 'compress') state.result = await compressPdf(state.files[0], radioValue('compression'), progress);
    if (state.activeTool === 'pdfToJpg') state.result = await pdfToJpg(state.files[0], radioValue('jpgQuality'), progress);
    if (state.activeTool === 'imageToPdf') {
      state.result = await imagesToPdf(state.files, {
        pageSize: document.querySelector('#pageSize').value,
        orientation: document.querySelector('#orientation').value,
        margin: document.querySelector('#margin').value,
      }, progress);
    }
    if (state.activeTool === 'office') state.result = await officeToPdf(state.files[0], elements.stage, progress);
    if (!state.result) throw new Error('Não foi possível concluir esta operação.');
    updateProgress(1, 'Concluído');
    await new Promise((resolve) => setTimeout(resolve, 280));
    elements.processing.classList.remove('active');
    elements.result.classList.add('active');
    elements.resultMeta.innerHTML = `<span>${escapeHtml(state.result.filename)}</span><span>${escapeHtml(state.result.detail)}</span>`;
    elements.download.focus();
  } catch (error) {
    console.error(error);
    elements.processing.classList.remove('active');
    elements.selection.style.display = 'block';
    showError(friendlyError(error));
  } finally {
    state.busy = false;
    updateProcessButton();
    elements.stage.innerHTML = '';
  }
}

function friendlyError(error) {
  const message = error?.message || 'Erro desconhecido.';
  if (/encrypted|password/i.test(message)) return 'Este PDF é protegido por senha. Desbloqueie-o antes de continuar.';
  if (/memory|allocation|canvas/i.test(message)) return 'O arquivo é grande demais para a memória disponível neste dispositivo. Tente um arquivo menor ou feche outras abas.';
  return message;
}

function startAgain() {
  const tool = state.activeTool;
  elements.result.classList.remove('active');
  openWorkspace(tool);
}

document.querySelectorAll('.tool-card').forEach((card) => card.addEventListener('click', () => openWorkspace(card.dataset.tool)));
elements.close.addEventListener('click', closeWorkspace);
elements.backdrop.addEventListener('mousedown', (event) => {
  if (event.target === elements.backdrop) closeWorkspace();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements.backdrop.classList.contains('open')) closeWorkspace();
});
elements.input.addEventListener('change', () => addFiles(elements.input.files));
['dragenter', 'dragover'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove('dragging');
}));
elements.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
elements.fileList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'remove') state.files.splice(index, 1);
  if (button.dataset.action === 'up' && index > 0) [state.files[index - 1], state.files[index]] = [state.files[index], state.files[index - 1]];
  if (button.dataset.action === 'down' && index < state.files.length - 1) [state.files[index + 1], state.files[index]] = [state.files[index], state.files[index + 1]];
  renderFiles();
  updateProcessButton();
});
elements.process.addEventListener('click', processFiles);
elements.download.addEventListener('click', () => {
  if (state.result) saveBlob(state.result.blob, state.result.filename);
});
elements.again.addEventListener('click', startAgain);
