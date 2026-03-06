(function() {
    const vscode = acquireVsCodeApi();
    const searchInput = document.getElementById('searchInput');
    const clearSearchButton = document.getElementById('clearSearch');
    const resultsContainer = document.getElementById('results');

    let fileTree = [];
    let flatFiles = [];
    let searchTimeout;
    let searchDictionary = new Map();
    let entriesById = new Map();
    let entriesByUri = new Map();
    let activeFileUri;
    let activeFilePath;
    let compareSourceUri;
    let searchSelectionIndex = -1;

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu hidden';
    document.body.appendChild(contextMenu);

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });

    let isSearching = false;

    function updateClearButtonVisibility() {
        if (!clearSearchButton) {
            return;
        }

        const hasValue = searchInput.value.trim().length > 0;
        clearSearchButton.classList.toggle('visible', hasValue);
    }

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        updateClearButtonVisibility();
        clearTimeout(searchTimeout);

        if (query) {
            // Mostra o estado de carregamento "fazendo a busca"
            resultsContainer.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <div>Buscando...</div>
                </div>
            `;
        }

        searchTimeout = setTimeout(() => {
            filterFiles(query);
        }, 300); // Aumentei o delay para focar na digitação e exibir o loading
    });

    searchInput.addEventListener('keydown', (e) => {
        const query = searchInput.value.trim();
        if (!query) {
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveSearchSelection(1);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveSearchSelection(-1);
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            openSelectedSearchResult();
        }
    });

    clearSearchButton?.addEventListener('click', () => {
        searchInput.value = '';
        clearTimeout(searchTimeout);
        updateClearButtonVisibility();
        hideContextMenu();
        displayTreeView(fileTree);
        searchInput.focus();
    });

    document.addEventListener('click', (event) => {
        if (!contextMenu.contains(event.target)) {
            hideContextMenu();
        }
    });

    window.addEventListener('blur', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
    resultsContainer.addEventListener('scroll', hideContextMenu, { passive: true });
    searchInput.addEventListener('focus', hideContextMenu);

    // Handle messages from extension
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'fileTree':
                fileTree = message.tree || [];
                flatFiles = message.flatFiles || [];
                buildSearchDictionary(flatFiles);
                displayTreeView(fileTree);
                syncActiveFileSelection(true);
                updateClearButtonVisibility();
                break;
            case 'activeFileChanged':
                activeFileUri = message.uri;
                activeFilePath = getEntryPathByUri(activeFileUri);
                syncActiveFileSelection(true);
                break;
            case 'compareSourceChanged':
                compareSourceUri = message.uri;
                break;
            case 'focusSearch':
                searchInput.focus();
                searchInput.select();
                break;
        }
    });

    function filterFiles(query) {
        if (!query) {
            displayTreeView(fileTree);
            return;
        }

        const normalizedQuery = normalizeQuery(query);
        const matchedIds = [];

        for (const [key, id] of searchDictionary.entries()) {
            if (key.includes(normalizedQuery)) {
                matchedIds.push(id);
            }
        }

        let filtered = matchedIds
            .map(id => entriesById.get(id))
            .filter(Boolean);

        filtered.sort((a, b) => a.path.localeCompare(b.path));

        displayListView(filtered, query);
    }

    function buildSearchDictionary(entries) {
        searchDictionary = new Map();
        entriesById = new Map();
        entriesByUri = new Map();

        for (const entry of entries) {
            if (!entry || !entry.id) {
                continue;
            }

            const key = normalizeQuery(entry.searchKey || entry.path || entry.name || '');
            searchDictionary.set(key, entry.id);
            entriesById.set(entry.id, entry);
            entriesByUri.set(normalizeUriKey(entry.uri), entry);
        }
    }

    function getEntryPathByUri(uri) {
        if (!uri) {
            return undefined;
        }

        const entry = entriesByUri.get(normalizeUriKey(uri));
        return entry?.path;
    }

    function normalizeQuery(query) {
        return query
            .toLowerCase()
            .trim()
            .replace(/\//g, '\\');
    }

    function displayTreeView(tree) {
        searchSelectionIndex = -1;

        if (!tree || tree.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-icon" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                    </svg>
                    <div>No files found</div>
                </div>
            `;
            return;
        }

        const html = renderTreeLevel(tree, 0);
        resultsContainer.innerHTML = `<div class="tree-root">${html}</div>`;

        // Add click handlers
        attachTreeClickHandlers();
        syncActiveFileSelection(false);
    }

    function renderTreeLevel(nodes, depth) {
        return nodes.map(node => {
            const iconSvg = getFileIconSvg(node.name, node.type, false);
            const paddingLeft = depth * 16;

            if (node.type === 'folder') {
                return `
                    <div class="tree-item folder" data-path="${node.path}" data-uri="${node.uri}" data-type="folder" style="padding-left: ${paddingLeft}px">
                        <span class="tree-collapse-icon">▶</span>
                        <div class="tree-icon">${iconSvg}</div>
                        <span class="tree-label">${escapeHtml(node.name)}</span>
                    </div>
                    <div class="tree-children" data-parent="${node.path}" style="display: none;">
                        ${node.children ? renderTreeLevel(node.children, depth + 1) : ''}
                    </div>
                `;
            } else {
                return `
                    <div class="tree-item file" data-uri="${node.uri}" data-type="file" style="padding-left: ${paddingLeft + 16}px">
                        <span class="tree-collapse-placeholder"></span>
                        <div class="tree-icon">${iconSvg}</div>
                        <span class="tree-label">${escapeHtml(node.name)}</span>
                    </div>
                `;
            }
        }).join('');
    }

    function attachTreeClickHandlers() {
        attachContextMenuHandlers(document.querySelectorAll('.tree-item'));

        // Folder click handlers
        document.querySelectorAll('.tree-item.folder').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = item.dataset.path;
                const children = document.querySelector(`.tree-children[data-parent="${path}"]`);
                const icon = item.querySelector('.tree-collapse-icon');
                const folderIcon = item.querySelector('.tree-icon');
                const folderName = item.querySelector('.tree-label')?.textContent || '';

                if (children) {
                    const isExpanded = children.style.display !== 'none';
                    children.style.display = isExpanded ? 'none' : 'block';
                    if (icon) {
                        icon.textContent = isExpanded ? '▶' : '▼';
                    }
                    if (folderIcon) {
                        folderIcon.innerHTML = getFileIconSvg(folderName, 'folder', !isExpanded);
                    }
                }
            });
        });

        // File click handlers
        document.querySelectorAll('.tree-item.file').forEach(item => {
            item.addEventListener('click', () => {
                const uri = item.dataset.uri;
                vscode.postMessage({
                    type: 'openFile',
                    uri: uri
                });
            });
        });
    }

    function displayListView(results, query) {
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-icon" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                    </svg>
                    <div>No files found</div>
                </div>
            `;
            return;
        }

        const html = results.map(file => {
            const iconSvg = getFileIconSvg(file.name, file.type);
            const highlightedName = highlightMatch(file.name, query);
            const highlightedPath = highlightMatch(file.path, query);
            const itemClass = file.type === 'folder' ? 'folder-item' : 'file-item';

            return `
                <div class="${itemClass}" data-id="${file.id}" data-uri="${file.uri}" data-type="${file.type}">
                    <div class="file-icon">${iconSvg}</div>
                    <div class="file-info">
                        <div class="file-name">${highlightedName}</div>
                        <div class="file-path">${highlightedPath}</div>
                    </div>
                </div>
            `;
        }).join('');

        resultsContainer.innerHTML = html;

        const resultItems = getSearchResultItems();
        if (resultItems.length === 0) {
            searchSelectionIndex = -1;
        } else {
            const activeUriKey = normalizeUriKey(activeFileUri);
            const activeIndex = activeUriKey
                ? resultItems.findIndex(item => normalizeUriKey(item.dataset.uri) === activeUriKey)
                : -1;

            if (activeIndex >= 0) {
                searchSelectionIndex = activeIndex;
            } else if (searchSelectionIndex < 0 || searchSelectionIndex >= resultItems.length) {
                searchSelectionIndex = 0;
            }
        }

        applySearchSelection(false);

        // Add click handlers
        resultItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                searchSelectionIndex = index;
                applySearchSelection(false);
                openSearchItem(item);
            });
        });

        attachContextMenuHandlers(resultItems);

        syncActiveFileSelection(false);
    }

    function showContextMenu(entry, clientX, clientY) {
        const groups = buildContextMenuGroups(entry);
        const html = groups.map(group => {
            const buttons = group.map(item => {
                const disabled = item.disabled ? 'disabled' : '';
                return `<button class="context-menu-item" type="button" data-action="${item.action}" ${disabled}>${escapeHtml(item.label)}</button>`;
            }).join('');

            return `<div class="context-menu-group">${buttons}</div>`;
        }).join('');

        contextMenu.innerHTML = html;
        contextMenu.classList.remove('hidden');
        positionContextMenu(clientX, clientY);

        contextMenu.querySelectorAll('.context-menu-item').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                hideContextMenu();

                if (!action || button.disabled) {
                    return;
                }

                vscode.postMessage({
                    type: 'contextAction',
                    action,
                    uri: entry.uri,
                    path: entry.path,
                    entryType: entry.type
                });
            });
        });
    }

    function buildContextMenuGroups(entry) {
        const isFile = entry.type === 'file';
        const hasCompareSource = Boolean(compareSourceUri);
        const canCompare = isFile && hasCompareSource && normalizeUriKey(compareSourceUri) !== normalizeUriKey(entry.uri);

        const groups = [];

        if (isFile) {
            groups.push([
                { action: 'open', label: 'Open' },
                { action: 'openToSide', label: 'Open to the Side' }
            ]);
        }

        groups.push([
            { action: 'revealInOs', label: 'Reveal in File Explorer' },
            { action: 'revealInExplorer', label: 'Reveal in Explorer' },
            { action: 'openInTerminal', label: 'Open in Integrated Terminal' }
        ]);

        if (isFile) {
            groups.push([
                { action: 'selectForCompare', label: 'Select for Compare' },
                { action: 'compareWithSelected', label: 'Compare with Selected', disabled: !canCompare },
                { action: 'clearCompareSelection', label: 'Clear Compare Selection', disabled: !hasCompareSource }
            ]);
        }

        groups.push([
            { action: 'copyPath', label: 'Copy Path' },
            { action: 'copyRelativePath', label: 'Copy Relative Path' }
        ]);

        groups.push([
            { action: 'rename', label: 'Rename...' },
            { action: 'duplicate', label: 'Duplicate' },
            { action: 'delete', label: 'Delete' }
        ]);

        return groups;
    }

    function positionContextMenu(clientX, clientY) {
        const margin = 8;
        const menuRect = contextMenu.getBoundingClientRect();
        const maxLeft = window.innerWidth - menuRect.width - margin;
        const maxTop = window.innerHeight - menuRect.height - margin;
        const left = Math.max(margin, Math.min(clientX, maxLeft));
        const top = Math.max(margin, Math.min(clientY, maxTop));

        contextMenu.style.left = `${left}px`;
        contextMenu.style.top = `${top}px`;
    }

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
        contextMenu.innerHTML = '';
    }

    function attachContextMenuHandlers(items) {
        items.forEach(item => {
            item.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const entry = getEntryFromElement(item);
                if (!entry || !entry.uri) {
                    return;
                }

                showContextMenu(entry, event.clientX, event.clientY);
            });
        });
    }

    function getEntryFromElement(item) {
        const id = item.dataset.id;
        const type = item.dataset.type;
        const uri = item.dataset.uri;
        const entry = id ? entriesById.get(id) : entriesByUri.get(normalizeUriKey(uri));

        return {
            id,
            type,
            uri,
            path: item.dataset.path || entry?.path || getEntryPathByUri(uri),
            name: entry?.name || item.querySelector('.tree-label, .file-name')?.textContent || ''
        };
    }

    function syncActiveFileSelection(shouldScroll) {
        const selectedClass = 'active-file';
        document.querySelectorAll(`.${selectedClass}`).forEach(element => {
            element.classList.remove(selectedClass);
        });

        if (!activeFileUri) {
            return;
        }

        activeFilePath = getEntryPathByUri(activeFileUri);

        if (document.querySelector('.tree-root')) {
            expandTreeToPath(activeFilePath);
        }

        const targetUriKey = normalizeUriKey(activeFileUri);
        let visibleTarget;

        document.querySelectorAll('[data-uri]').forEach(element => {
            const elementUri = element.dataset.uri;
            if (!elementUri) {
                return;
            }

            if (normalizeUriKey(elementUri) === targetUriKey) {
                element.classList.add(selectedClass);

                if (!visibleTarget && isVisible(element)) {
                    visibleTarget = element;
                }
            }
        });

        if (shouldScroll && visibleTarget) {
            visibleTarget.scrollIntoView({ block: 'nearest' });
        }
    }

    function normalizeUriKey(uri) {
        if (!uri) {
            return '';
        }

        try {
            return decodeURIComponent(uri).trim().toLowerCase();
        } catch {
            return String(uri).trim().toLowerCase();
        }
    }

    function isVisible(element) {
        return element.getClientRects().length > 0;
    }

    function expandTreeToPath(pathValue) {
        const normalizedPath = normalizePath(pathValue);
        if (!normalizedPath) {
            return;
        }

        const parts = normalizedPath.split('/').slice(0, -1);
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            const folderItem = document.querySelector(`.tree-item.folder[data-path="${cssEscape(currentPath)}"]`);
            const children = document.querySelector(`.tree-children[data-parent="${cssEscape(currentPath)}"]`);

            if (!folderItem || !children || children.style.display !== 'none') {
                continue;
            }

            children.style.display = 'block';

            const collapseIcon = folderItem.querySelector('.tree-collapse-icon');
            if (collapseIcon) {
                collapseIcon.textContent = '▼';
            }

            const folderIcon = folderItem.querySelector('.tree-icon');
            const folderName = folderItem.querySelector('.tree-label')?.textContent || '';
            if (folderIcon) {
                folderIcon.innerHTML = getFileIconSvg(folderName, 'folder', true);
            }
        }
    }

    function cssEscape(value) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }

        return String(value);
    }

    function getSearchResultItems() {
        return Array.from(resultsContainer.querySelectorAll('.file-item, .folder-item'));
    }

    function moveSearchSelection(offset) {
        const items = getSearchResultItems();
        if (items.length === 0) {
            searchSelectionIndex = -1;
            return;
        }

        if (searchSelectionIndex < 0 || searchSelectionIndex >= items.length) {
            searchSelectionIndex = offset >= 0 ? 0 : items.length - 1;
        } else {
            searchSelectionIndex = (searchSelectionIndex + offset + items.length) % items.length;
        }

        applySearchSelection(true);
    }

    function applySearchSelection(shouldScroll) {
        const selectedClass = 'search-selected';
        const items = getSearchResultItems();

        items.forEach(item => item.classList.remove(selectedClass));

        if (searchSelectionIndex < 0 || searchSelectionIndex >= items.length) {
            return;
        }

        const selectedItem = items[searchSelectionIndex];
        selectedItem.classList.add(selectedClass);

        if (shouldScroll) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    function openSelectedSearchResult() {
        const items = getSearchResultItems();
        if (items.length === 0) {
            return;
        }

        if (searchSelectionIndex < 0 || searchSelectionIndex >= items.length) {
            searchSelectionIndex = 0;
            applySearchSelection(false);
        }

        openSearchItem(items[searchSelectionIndex]);
    }

    function openSearchItem(item) {
        const type = item.dataset.type;
        if (!type) {
            return;
        }

        let uri = item.dataset.uri;

        if (type === 'folder') {
            const entryId = item.dataset.id;
            const folderEntry = entryId ? entriesById.get(entryId) : undefined;
            uri = findFileToOpenInFolder(folderEntry);
        }

        if (!uri) {
            return;
        }

        vscode.postMessage({
            type: 'openFile',
            uri: uri
        });
    }

    function findFileToOpenInFolder(folderEntry) {
        if (!folderEntry || folderEntry.type !== 'folder') {
            return undefined;
        }

        const normalizedFolderPath = normalizePath(folderEntry.path);
        const filesInFolder = flatFiles
            .filter(entry => entry.type === 'file' && isInsideFolder(entry.path, normalizedFolderPath))
            .sort((a, b) => a.path.localeCompare(b.path));

        if (filesInFolder.length === 0) {
            return undefined;
        }

        const directFiles = filesInFolder.filter(entry => isDirectChild(entry.path, normalizedFolderPath));
        const indexFile = directFiles.find(entry => isIndexFile(entry.name))
            || filesInFolder.find(entry => isIndexFile(entry.name));
        const fallbackFile = directFiles[0] || filesInFolder[0];

        return (indexFile || fallbackFile)?.uri;
    }

    function isInsideFolder(filePath, folderPath) {
        const normalizedFilePath = normalizePath(filePath);
        if (!folderPath) {
            return normalizedFilePath.length > 0;
        }

        return normalizedFilePath.startsWith(`${folderPath}/`);
    }

    function isDirectChild(filePath, folderPath) {
        const normalizedFilePath = normalizePath(filePath);
        const fileDir = normalizedFilePath.split('/').slice(0, -1).join('/');
        return fileDir === folderPath;
    }

    function isIndexFile(fileName) {
        const normalizedName = (fileName || '').toLowerCase();
        return normalizedName === 'index' || normalizedName.startsWith('index.');
    }

    function normalizePath(value) {
        return (value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    }

    function getFileIconSvg(filename, type, isOpenFolder = false) {
        const nameLower = filename.toLowerCase();
        
        if (type === 'folder') {
            const openShape = '<path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v1h20V8c0-1.1-.9-2-2-2zm2 3H2l2 9c.2.9 1 1.5 1.9 1.5h12.2c.9 0 1.7-.6 1.9-1.5L22 9z"/>';
            const closedShape = '<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>';

            const folderRules = [
                { names: ['src', 'source', 'app', 'apps'], color: '#4B905B' },
                { names: ['public', 'static', 'wwwroot', 'assets', 'media', 'images', 'img', 'icons'], color: '#42A5F5' },
                { names: ['docs', 'doc', 'documentation'], color: '#5C6BC0' },
                { names: ['test', 'tests', '__tests__', 'spec', 'specs', 'cypress', 'e2e'], color: '#8E24AA' },
                { names: ['components', 'component', 'pages', 'views', 'layouts', 'ui'], color: '#26A69A' },
                { names: ['config', 'configs', 'settings', '.vscode', '.github', '.husky'], color: '#90A4AE' },
                { names: ['scripts', 'script', 'tools', 'bin'], color: '#7E57C2' },
                { names: ['dist', 'out', 'build', 'release', 'target'], color: '#FFB74D' },
                { names: ['node_modules', 'vendor', 'packages'], color: '#E57373' },
                { names: ['database', 'db', 'migrations', 'seeders'], color: '#26C6DA' }
            ];

            const matchedRule = folderRules.find(rule => rule.names.includes(nameLower));
            const fillColor = matchedRule?.color || '#78909C';
            const iconShape = isOpenFolder ? openShape : closedShape;
            return `<svg viewBox="0 0 24 24" fill="${fillColor}">${iconShape}</svg>`;
        }

        const ext = filename.split('.').pop()?.toLowerCase();

        // Exact match files
        if (nameLower === 'package.json') {
            return `<svg viewBox="0 0 24 24" fill="#CB3837"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm4-4H7v-2h9v2zm0-4H7V7h9v2z"/></svg>`;
        }
        if (nameLower === 'readme.md') {
            return `<svg viewBox="0 0 24 24" fill="#083fa1"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 14.5l-3-3 1.4-1.4L9 11.7l5.6-5.6L16 7.5l-7 7z"/></svg>`;
        }

        // Keep existing icons based on extension
        const icons = {
            'ts': `<svg class="icon-ts" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3178c6"/><path d="M10 6v6h-1V9.5c0-.8-.7-1.5-1.5-1.5S6 8.7 6 9.5V12H5V6h1v1c.3-.6.9-1 1.5-1s1.2.4 1.5 1V6h1zm4 0c-.6.3-1 .9-1 1.5V6h-1v6h1V9c0-.6.4-1 1-1s1 .4 1 1v3h1V8c0-1.1-.9-2-2-2z" fill="#fff"/></svg>`,
            'tsx': `<svg class="icon-ts" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3178c6"/><text x="1" y="12" font-size="8" font-weight="bold" fill="#fff">TSX</text></svg>`,
            'js': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#f7df1e"/><rect x="7" y="4" width="2" height="8" fill="#000"/><rect x="4" y="4" width="2" height="5" fill="#000"/></svg>`,
            'jsx': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#61dafb"/><path d="M8 3l-2 1.5v4l2 1.5 2-1.5v-4L8 3zm0 2l1 .5v2l-1 .5-1-.5v-2l1-.5z" fill="#000"/><circle cx="5.5" cy="11.5" r="1.5" fill="#000"/><circle cx="10.5" cy="11.5" r="1.5" fill="#000"/></svg>`,
            'json': `<svg class="icon-json" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#f7df1e"/><path d="M4 6h2v4H4V6zm3 0h2v4H7V6zm3 0h2v4h-2V6z" fill="#000"/><text x="3.5" y="13" font-size="4" font-weight="bold" fill="#000">{}</text></svg>`,
            'md': `<svg class="icon-md" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#083fa1"/><path d="M4 4h8v2H4V4zm0 3h8v1H4V7zm0 2h5v1H4V9zm0 2h3v1H4v-1zm6-4h2v5h-2V7z" fill="#fff"/></svg>`,
            'html': `<svg class="icon-html" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#e34c26"/><text x="1" y="12" font-size="7" font-weight="bold" fill="#fff">HTML</text></svg>`,
            'css': `<svg class="icon-css" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#563d7c"/><text x="2" y="12" font-size="7" font-weight="bold" fill="#fff">CSS</text></svg>`,
            'svg': `<svg class="icon-svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#ffb13b"/><path d="M4 4l3 1 2-1 3 1v6l-3 2-2-1-3 1V4z" fill="#fff"/></svg>`,
            'png': `<svg class="icon-png" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#a074c4"/><circle cx="5" cy="6" r="1.5" fill="#fff"/><path d="M2 10l2-2 2 2 2-2 3 2 3-2v3H2v-3z" fill="#fff"/><text x="9" y="14" font-size="3" fill="#fff">PNG</text></svg>`,
            'jpg': `<svg class="icon-jpg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#a074c4"/><circle cx="5" cy="6" r="1.5" fill="#fff"/><path d="M2 10l2-2 2 2 2-2 3 2 3-2v3H2v-3z" fill="#fff"/><text x="8.5" y="14" font-size="3" fill="#fff">JPG</text></svg>`,
            'jpeg': `<svg class="icon-jpg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#a074c4"/><circle cx="5" cy="6" r="1.5" fill="#fff"/><path d="M2 10l2-2 2 2 2-2 3 2 3-2v3H2v-3z" fill="#fff"/></svg>`,
            'gif': `<svg class="icon-png" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#a074c4"/><circle cx="5" cy="6" r="1.5" fill="#fff"/><path d="M2 10l2-2 2 2 2-2 3 2 3-2v3H2v-3z" fill="#fff"/><text x="9" y="14" font-size="3" fill="#fff">GIF</text></svg>`,
            'webp': `<svg class="icon-png" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#a074c4"/><circle cx="5" cy="6" r="1.5" fill="#fff"/><path d="M2 10l2-2 2 2 2-2 3 2 3-2v3H2v-3z" fill="#fff"/></svg>`,
            'py': `<svg class="icon-py" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3572A5"/><path d="M8 3c-1.5 0-3 .5-3 2v2h2V5c0-.5.5-1 1-1s1 .5 1 1v5c0 1.5-1.5 2-3 2v2c2.5 0 4-1.5 4-3V5c0-1.5-1.5-2-2-2zm-2 8v-2H4v2c0 1.5-1.5 2-3 2v2c2.5 0 4-1.5 4-3v-1z" fill="#ffd43b"/></svg>`,
            'java': `<svg class="icon-java" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#b07219"/><path d="M5 4c0-1 1-2 3-2s3 1 3 2v6c0 1-1 1-1 1H6s-1 0-1-1V4zm1 1v5h4V5H6zm-1 8c0 .5.5 1 1 1h4c.5 0 1-.5 1-1v-1H5v1z" fill="#fff"/></svg>`,
            'go': `<svg class="icon-go" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00ADD8"/><path d="M4 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4zm0 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" fill="#fff"/></svg>`,
            'rs': `<svg class="icon-rs" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#dea584"/><path d="M4 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4zm2.5 1h3l-1.5 2h3l-3.5 4h3l-2-3h3l-2-3z" fill="#000"/></svg>`,
            'php': `<svg class="icon-php" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4F5D95"/><circle cx="4" cy="8" r="2" fill="#fff"/><circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="12" cy="8" r="2" fill="#fff"/><text x="1.5" y="14" font-size="5" font-weight="bold" fill="#fff">PHP</text></svg>`,
            'rb': `<svg class="icon-rb" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#701516"/><path d="M8 3L5 5v6l3 2 3-2V5l-3-2z" fill="#fff"/></svg>`,
            'swift': `<svg class="icon-swift" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#F05138"/><path d="M3 12c3-2 6-4 10-4 2 0 3 1 3 1s-2-2-5-2c-4 0-7 3-8 5z" fill="#fff"/></svg>`,
            'xml': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#0060ac"/><text x="0.5" y="12" font-size="6" font-weight="bold" fill="#fff">XML</text></svg>`,
            'yml': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#cb171e"/><text x="0.5" y="12" font-size="6" font-weight="bold" fill="#fff">YML</text></svg>`,
            'yaml': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#cb171e"/><text x="0" y="12" font-size="5" font-weight="bold" fill="#fff">YAML</text></svg>`,
            'lock': `<svg class="icon-lock" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#ff6b6b"/><path d="M5 7V6c0-1.7 1.3-3 3-3s3 1.3 3 3v1h1v5H4V7h1zm2 0V6c0-.6.4-1 1-1s1 .4 1 1v1H7z" fill="#fff"/></svg>`,
            'env': `<svg class="icon-env" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#f1e05a"/><path d="M3 5h10v1H3V5zm0 3h10v1H3V8zm0 3h6v1H3v-1z" fill="#000"/></svg>`,
            'txt': `<svg class="icon-default" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6e6e6e"/><path d="M4 4h8v1H4V4zm0 2h8v1H4V6zm0 2h5v1H4V8z" fill="#fff"/></svg>`,
            'pdf': `<svg class="icon-pdf" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#ff4d4d"/><text x="1" y="12" font-size="7" font-weight="bold" fill="#fff">PDF</text></svg>`,
            'zip': `<svg class="icon-zip" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6d8086"/><path d="M7 3h2v1H7V3zm0 2h2v1H7V5zm0 2h2v1H7V7zm0 2h2v1H7V9z" fill="#fff"/></svg>`,
            'tar': `<svg class="icon-zip" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6d8086"/><path d="M7 3h2v1H7V3zm0 2h2v1H7V5zm0 2h2v1H7V7zm0 2h2v1H7V9z" fill="#fff"/><text x="10" y="14" font-size="3" fill="#fff">TAR</text></svg>`,
            'gz': `<svg class="icon-zip" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6d8086"/><path d="M7 3h2v1H7V3zm0 2h2v1H7V5zm0 2h2v1H7V7zm0 2h2v1H7V9z" fill="#fff"/></svg>`,
            'rar': `<svg class="icon-zip" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6d8086"/><path d="M7 3h2v1H7V3zm0 2h2v1H7V5zm0 2h2v1H7V7zm0 2h2v1H7V9z" fill="#fff"/><text x="10" y="14" font-size="3" fill="#fff">RAR</text></svg>`,
            '7z': `<svg class="icon-zip" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6d8086"/><path d="M7 3h2v1H7V3zm0 2h2v1H7V5zm0 2h2v1H7V7zm0 2h2v1H7V9z" fill="#fff"/></svg>`,
            'vue': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#41b883"/><path d="M8 3L4 10h2l2-4 2 4h2L8 3z" fill="#fff"/></svg>`,
            'svelte': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#ff3e00"/><path d="M8 3l-3 3 1.5 1.5L8 6l1.5 1.5L11 6l-3-3zm0 4l-3 3 1.5 1.5L8 10l1.5 1.5L11 10l-3-3z" fill="#fff"/></svg>`,
            'dart': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#0175c2"/><path d="M8 3L5 6v4l3 3 3-3V6l-3-3z" fill="#fff"/></svg>`,
            'c': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#555555"/><text x="4.5" y="12" font-size="7" font-weight="bold" fill="#fff">C</text></svg>`,
            'cpp': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00599c"/><text x="1" y="12" font-size="6" font-weight="bold" fill="#fff">C++</text></svg>`,
            'h': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#555555"/><text x="3.5" y="12" font-size="6" font-weight="bold" fill="#fff">H</text></svg>`,
            'hpp': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00599c"/><text x="1" y="12" font-size="5" font-weight="bold" fill="#fff">H++</text></svg>`,
            'cs': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#68217a"/><text x="0.5" y="12" font-size="6" font-weight="bold" fill="#fff">C#</text></svg>`,
            'scss': `<svg class="icon-css" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#c76494"/><text x="1" y="12" font-size="5" font-weight="bold" fill="#fff">SCSS</text></svg>`,
            'sass': `<svg class="icon-css" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#c76494"/><text x="0.5" y="12" font-size="5" font-weight="bold" fill="#fff">SASS</text></svg>`,
            'less': `<svg class="icon-css" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#1a2b3c"/><text x="2" y="12" font-size="5" font-weight="bold" fill="#fff">LESS</text></svg>`,
            'sql': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00758f"/><text x="1" y="12" font-size="5" font-weight="bold" fill="#fff">SQL</text></svg>`,
            'db': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00758f"/><path d="M4 5h8v2H4V5zm0 3h8v2H4V8zm0 3h8v2H4v-2z" fill="#fff"/></svg>`,
            'sh': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4eaa25"/><text x="0.5" y="12" font-size="5" font-weight="bold" fill="#fff">SHELL</text></svg>`,
            'bash': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4eaa25"/><text x="0.5" y="12" font-size="5" font-weight="bold" fill="#fff">BASH</text></svg>`,
            'zsh': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4eaa25"/><text x="0.5" y="12" font-size="5" font-weight="bold" fill="#fff">ZSH</text></svg>`,
            'fish': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4eaa25"/><path d="M4 8l3-2v4l-3-2zm4-2l3-2v4l-3-2z" fill="#fff"/></svg>`,
            'ps1': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#012456"/><text x="0.5" y="12" font-size="4" font-weight="bold" fill="#fff">PS1</text></svg>`,
            'toml': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#9c4221"/><text x="1" y="12" font-size="5" font-weight="bold" fill="#fff">TOML</text></svg>`,
            'ini': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6e6e6e"/><text x="2" y="12" font-size="5" font-weight="bold" fill="#fff">INI</text></svg>`,
            'cfg': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6e6e6e"/><text x="1" y="12" font-size="4" font-weight="bold" fill="#fff">CONF</text></svg>`,
            'log': `<svg class="icon-default" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#6e6e6e"/><path d="M4 4h8v1H4V4zm0 2h8v1H4V6zm0 2h5v1H4V8z" fill="#fff"/></svg>`,
            'map': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#ccc"/><path d="M3 3h10v10H3V3zm2 2h6v6H5V5z" fill="#666"/></svg>`,
            'wasm': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#654ff0"/><text x="0.5" y="12" font-size="4" font-weight="bold" fill="#fff">WASM</text></svg>`,
            'graphql': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#e10098"/><polygon points="8,2 13,5 13,11 8,14 3,11 3,5" fill="#fff"/></svg>`,
            'proto': `<svg class="icon-js" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#0c2e5a"/><text x="1" y="12" font-size="4" font-weight="bold" fill="#fff">PROTO</text></svg>`,
            'docker': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2496ed"/><path d="M4 6h2v2H4V6zm3 0h2v2H7V6zm3 0h2v2h-2V6zM6 8h2v2H6V8zm3 0h2v2H9V8z" fill="#fff"/></svg>`,
            'dockerfile': `<svg class="icon-xml" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2496ed"/><path d="M3 6h2v2H3V6zm3 0h2v2H6V6zm3 0h2v2H9V6zm-5 2h2v2H4V8zm3 0h2v2H7V8z" fill="#fff"/></svg>`
        };

        return icons[ext] || `<svg class="icon-default" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2v12h10V2H3zm1 1h8v10H4V3zm2 2v6h6V5H6z"/></svg>`;
    }

    function highlightMatch(text, query) {
        if (!query) return escapeHtml(text);

        const queryParts = query.split(/[\/\\]/).filter(p => p.length > 0);
        let result = escapeHtml(text);

        queryParts.forEach(part => {
            const escapedPart = escapeRegex(part);
            const regex = new RegExp(`(${escapedPart})`, 'gi');
            result = result.replace(regex, '<span class="match-highlight">$1</span>');
        });

        return result;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
})();
