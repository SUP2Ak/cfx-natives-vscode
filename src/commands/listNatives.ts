import { window, ViewColumn } from "vscode";
import { loadNatives } from "../utils/natives";
import { ResourceManager, NativeParser } from "../parser";
import { Native, Lang } from "../types";

function formatSignature(native: Native, lang: Lang): string {
  const params = native.params.map(param => {
    const type = NativeParser.parseType(param.type, lang, true);
    
    switch (lang) {
      case 'csharp':
        return `${type} ${param.name}`;
      case 'lua':
        return param.name;
      case 'javascript':
      case 'typescript':
        return `${param.name}: ${type}`;
      default:
        return `${param.name}: ${type}`;
    }
  }).join(', ');

  const returnType = NativeParser.parseType(native.return_type, lang, false);

  switch (lang) {
    case 'lua':
      return `function ${native.name}(${params}) -> ${returnType}`;
    case 'javascript':
    case 'typescript':
      return `${native.name}(${params}): ${returnType}`;
    case 'csharp':
      return `${returnType} ${native.name}(${params})`;
    default:
      return `${native.name}(${params})`;
  }
}

export default async function listNatives() {
  try {
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const scriptType = ResourceManager.getScriptType(filePath);
    const games = ResourceManager.getGameSupport(filePath);
    let availableNatives: Native[] = [];

    for (const game of games) {
      const natives = await loadNatives(game as "gta5" | "rdr3");

      switch (scriptType) {
        case "client":
          availableNatives.push(...natives.client, ...natives.shared);
          break;
        case "server":
          availableNatives.push(...natives.server, ...natives.shared);
          break;
        case "shared":
          availableNatives.push(
            ...natives.client,
            ...natives.server,
            ...natives.shared,
          );
          break;
        default:
          availableNatives.push(
            ...natives.client,
            ...natives.server,
            ...natives.shared,
          );
      }
    }

    availableNatives = Array.from(new Set(availableNatives));
    const panel = window.createWebviewPanel(
      "nativesList",
      "CFX Natives List",
      ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    panel.webview.html = generateNativesListHtml(
      availableNatives,
      editor.document.languageId as Lang,
    );
  } catch (error) {
    console.error("Error listing natives:", error);
    window.showErrorMessage("Failed to list natives");
  }
}

function generateControlsHtml(natives: Native[], language: Lang): string {
  const namespaces = [...new Set(natives.map(n => n.namespace))].sort();
  
  return `
    <div class="controls">
      <input type="text" id="search" class="search-box" placeholder="Search natives...">
      <div class="filters">
        <div class="filter-group">
          <select class="language-select" id="language-select">
            <option value="lua" ${language === 'lua' ? 'selected' : ''}>Lua</option>
            <option value="javascript" ${language === 'javascript' ? 'selected' : ''}>JavaScript</option>
            <option value="typescript" ${language === 'typescript' ? 'selected' : ''}>TypeScript</option>
            <option value="csharp" ${language === 'csharp' ? 'selected' : ''}>C#</option>
          </select>

          <select class="namespace-select" id="namespace-select">
            <option value="all">All Namespaces</option>
            ${namespaces.map(ns => `
              <option value="${ns}">${ns} (${natives.filter(n => n.namespace === ns).length})</option>
            `).join('')}
          </select>

          <select class="apiset-select" id="apiset-select">
            <option value="all">All APIs</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
            <option value="shared">Shared</option>
          </select>

          <select class="game-select" id="game-select">
            <option value="all">All Games</option>
            <option value="gta5">GTA V</option>
            <option value="rdr3">RDR 3</option>
          </select>
        </div>
      </div>
      <div id="stats">Showing all natives</div>
    </div>
  `;
}

function generateStylesHtml(): string {
  return `
    <style>
      :root {
        --animation-duration: 0.3s;
        --hover-color: rgba(255, 165, 0, 0.1);
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes scaleIn {
        from { transform: scale(0.95); }
        to { transform: scale(1); }
      }

      body { 
        padding: 2vh;
        height: 98vh;
        font-family: var(--vscode-editor-font-family);
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
      }

      .controls {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: 2vh;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        z-index: 100;
        animation: fadeIn var(--animation-duration) ease-in-out;
      }

      #natives-list {
        margin-top: 15vh;
        height: calc(85vh - 4vh);
        overflow-y: auto;
      }

      .natives-container {
        position: relative;
        padding: 0 2vh;
      }

      .native {
        margin-bottom: 2vh;
        padding: 1.5vh;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 0.5vh;
        transition: all var(--animation-duration) ease-in-out;
        animation: scaleIn var(--animation-duration) ease-in-out;
      }

      .native.hidden {
        display: none;
      }

      .search-box {
        width: 100%;
        padding: 1vh;
        margin-bottom: 1.5vh;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 0.5vh;
        transition: all var(--animation-duration) ease-in-out;
      }

      .search-box:focus {
        border-color: orange;
        box-shadow: 0 0 0 2px var(--hover-color);
        outline: none;
      }

      .filters {
        display: flex;
        gap: 1vh;
        margin-bottom: 1.5vh;
        flex-wrap: wrap;
      }

      .filter-group {
        display: flex;
        gap: 0.5vh;
      }

      select, .filter-btn {
        padding: 1vh;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 0.5vh;
        cursor: pointer;
        transition: all var(--animation-duration) ease-in-out;
      }

      .filter-btn.active {
        background: var(--vscode-button-hoverBackground);
      }

      .signature {
        background-color: var(--vscode-textBlockQuote-background);
        padding: 1vh;
        border-radius: 0.5vh;
        font-family: monospace;
        transition: all var(--animation-duration) ease-in-out;
      }

      .signature:hover {
        background: var(--hover-color);
        transform: scale(1.01);
      }

      .meta {
        display: flex;
        gap: 1vh;
        margin: 1vh 0;
        transition: background 0.3s ease-in-out;
      }

      .meta:hover {
        background: rgba(255, 165, 0, 0.1);
      }

      .meta span {
        padding: 0.5vh 1vh;
        border-radius: 1vh;
        background-color: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        transition: all var(--animation-duration) ease-in-out;
      }

      .meta span:hover {
        background: var(--hover-color);
        transform: scale(1.1);
      }

      .navigation-controls {
        position: fixed;
        right: 2vh;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 1vh;
        z-index: 101;
      }

      .navigation-controls button {
        padding: 1vh;
        border-radius: 50%;
        border: none;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
      }

      .segment-nav {
        position: fixed;
        bottom: 2vh;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 1vh;
        z-index: 101;
      }

      .segment-nav button {
        padding: 1vh 2vh;
        border: none;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        border-radius: 0.5vh;
      }
    </style>
  `;
}

function generateScriptHtml(): string {
  return `
    <script>
      let allNatives = [];
      let filteredNatives = [];
      let visibleNatives = [];
      const ITEMS_PER_RENDER = 50;

      function initNatives() {
        allNatives = Array.from(document.querySelectorAll('.native')).map(el => ({
          element: el,
          name: el.querySelector('h3').textContent.toLowerCase(),
          namespace: el.dataset.namespace,
          apiset: el.dataset.apiset,
          game: el.dataset.game
        }));
        filteredNatives = [...allNatives];
        showInitialBatch();
      }

      function showInitialBatch() {
        allNatives.forEach(native => native.element.classList.add('hidden'));
        filteredNatives.slice(0, ITEMS_PER_RENDER).forEach(native => {
          native.element.classList.remove('hidden');
        });
        updateStats();
      }

      function loadMoreNatives() {
        const visibleCount = document.querySelectorAll('.native:not(.hidden)').length;
        if (visibleCount >= filteredNatives.length) return;

        const nextBatch = filteredNatives.slice(visibleCount, visibleCount + ITEMS_PER_RENDER);
        nextBatch.forEach(native => native.element.classList.remove('hidden'));
        updateStats();
      }

      function updateStats() {
        const visibleCount = document.querySelectorAll('.native:not(.hidden)').length;
        document.getElementById('stats').textContent = 
          \`Showing \${visibleCount} of \${filteredNatives.length} natives\`;
      }

      function filterNatives() {
        const searchTerm = document.getElementById('search').value.toLowerCase()
          .replace(/[_\\s]/g, ''); // Retire les underscores et espaces
        const selectedNamespace = document.getElementById('namespace-select').value;
        const selectedApiset = document.getElementById('apiset-select').value;
        const selectedGame = document.getElementById('game-select').value;
        
        allNatives.forEach(native => native.element.classList.add('hidden'));
        
        filteredNatives = allNatives.filter(native => {
          const normalizedName = native.name.toLowerCase().replace(/[_\\s]/g, '');
          const matchesSearch = normalizedName.includes(searchTerm);
          const matchesNamespace = selectedNamespace === 'all' || native.namespace === selectedNamespace;
          const matchesApiset = selectedApiset === 'all' || native.apiset === selectedApiset;
          const matchesGame = selectedGame === 'all' || native.game === selectedGame;

          return matchesSearch && matchesNamespace && matchesApiset && matchesGame;
        });

        showInitialBatch();
        document.querySelector('.natives-container').scrollTop = 0;
      }

      let isLoading = false;
      document.querySelector('#natives-list').addEventListener('scroll', () => {
        if (isLoading) return;

        const container = document.querySelector('#natives-list');
        const scrollPosition = container.scrollTop + container.clientHeight;
        const scrollThreshold = container.scrollHeight - 100;

        if (scrollPosition >= scrollThreshold) {
          isLoading = true;
          loadMoreNatives();
          setTimeout(() => { isLoading = false; }, 100);
        }
      });

      document.getElementById('search').addEventListener('input', filterNatives);
      ['namespace-select', 'apiset-select', 'game-select'].forEach(id => {
        document.getElementById(id).addEventListener('change', filterNatives);
      });

      initNatives();
    </script>
  `;
}

function generateNativesListHtml(natives: Native[], language: Lang): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${generateStylesHtml()}
    </head>
    <body>
      ${generateControlsHtml(natives, language)}
      <div id="natives-list">
        <div class="natives-container">
          ${natives.map(native => `
            <div class="native hidden" 
                data-namespace="${native.namespace}" 
                data-apiset="${native.apiset}" 
                data-game="${native.game_support}">
              <h3>${native.name}</h3>
              <pre class="signature">${formatSignature(native, language)}</pre>
              <div class="meta">
                <span class="namespace">${native.namespace}</span>
                <span class="apiset">${native.apiset}</span>
                ${native.game_support ? `<span class="game">${native.game_support}</span>` : ''}
                ${native.is_rpc ? `<span class="rpc">RPC</span>` : ''}
              </div>
              ${native.description ? `<p class="description">${native.description}</p>` : ''}
              <a href="${native.docs_url}" target="_blank">Documentation →</a>
            </div>
          `).join('')}
        </div>
      </div>
      ${generateScriptHtml()}
    </body>
    </html>
  `;
}
