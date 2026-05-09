document.addEventListener('DOMContentLoaded', () => {
    let profiles = [];
    let currentProfile = null;
    let pathStack = []; 
    let currentDirFiles = []; 
    let currentPathUrl = ""; 
    
    // --- 新增：用于存放被“剪切”的文件数组 ---
    let clipboard = []; 

    const accountList = document.getElementById('accountList');
    const configForm = document.getElementById('configForm');
    const fileList = document.getElementById('fileList');
    const breadcrumb = document.getElementById('breadcrumb');
    const searchInput = document.getElementById('searchInput');
    
    const newFolderBtn = document.getElementById('newFolderBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileUploader = document.getElementById('fileUploader');
    
    // --- 新增：剪切、粘贴、全选 按钮 ---
    const cutBtn = document.getElementById('cutBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const selectAllCheckbox = document.getElementById('selectAll');

    const previewModal = document.getElementById('previewModal');
    const previewTitle = document.getElementById('previewTitle');
    const closePreviewBtn = document.getElementById('closePreviewBtn');
    const imagePreview = document.getElementById('imagePreview');
    const textEditor = document.getElementById('textEditor');
    const modalFooter = document.getElementById('modalFooter');
    const saveEditBtn = document.getElementById('saveEditBtn');
    let currentEditingFile = null; 

    loadProfiles();

    searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        renderFiles(!keyword ? currentDirFiles : currentDirFiles.filter(f => f.name.toLowerCase().includes(keyword)));
    });

    // ==========================================
    // 高级操作及弹窗事件绑定
    // ==========================================
    newFolderBtn.addEventListener('click', () => createFolder());
    uploadBtn.addEventListener('click', () => fileUploader.click());
    fileUploader.addEventListener('change', (e) => uploadFiles(e.target.files));

    // --- 新增：绑定剪切、粘贴与全选事件 ---
    cutBtn.addEventListener('click', () => cutSelectedFiles());
    pasteBtn.addEventListener('click', () => pasteFiles());
    selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.item-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    closePreviewBtn.addEventListener('click', () => {
        previewModal.style.display = 'none';
        imagePreview.src = ''; 
        currentEditingFile = null;
    });

    saveEditBtn.addEventListener('click', async () => {
        if (!currentEditingFile) return;
        const newText = textEditor.value;
        showMsg("正在保存...", false);
        try {
            const response = await fetch(currentEditingFile.fullUrl, {
                method: 'PUT',
                headers: { 'Authorization': getAuth() },
                body: newText
            });
            if (!response.ok && response.status !== 201 && response.status !== 204) throw new Error(`HTTP ${response.status}`);
            showMsg("✅ 保存成功！", true);
            previewModal.style.display = 'none';
            loadDirectory(currentPathUrl); 
        } catch (err) {
            alert("保存失败: " + err.message);
            showMsg("保存失败", true);
        }
    });

    textEditor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault(); 
            saveEditBtn.click();
        }
    });

    // ==========================================
    // 1. 账号管理
    // ==========================================
    function loadProfiles() {
        chrome.storage.local.get(['webdavProfiles'], (res) => {
            profiles = res.webdavProfiles || [];
            renderProfiles();
        });
    }
    function saveProfiles() { chrome.storage.local.set({ webdavProfiles: profiles }, () => renderProfiles()); }

    function renderProfiles() {
        accountList.innerHTML = '';
        profiles.forEach((p) => {
            const div = document.createElement('div');
            div.className = `account-item ${currentProfile?.id === p.id ? 'active' : ''}`;
            div.innerHTML = `
                <div class="account-info">
                    <div class="account-name">${p.name}</div>
                    <div class="account-url">${p.url}</div>
                </div>
                <div class="account-actions">
                    <button class="del-btn">删除</button>
                </div>
            `;

            div.querySelector('.account-info').addEventListener('click', () => {
                currentProfile = p;
                renderProfiles(); 
                pathStack = [{ name: p.name, url: p.url }];
                
                // 切换网盘时，清空剪贴板
                clipboard = [];
                pasteBtn.style.display = 'none';

                loadDirectory(p.url);
            });

            div.querySelector('.del-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if(confirm(`确定删除 "${p.name}" 吗？`)) {
                    profiles = profiles.filter(item => item.id !== p.id);
                    if(currentProfile?.id === p.id) {
                        currentProfile = null;
                        fileList.innerHTML = '';
                        breadcrumb.innerHTML = '等待选择网盘...';
                        toggleToolbar(false);
                    }
                    saveProfiles();
                }
            });
            accountList.appendChild(div);
        });
    }

    document.getElementById('addProfileBtn').addEventListener('click', () => configForm.style.display = 'block');
    document.getElementById('cancelProfileBtn').addEventListener('click', () => configForm.style.display = 'none');
    document.getElementById('saveProfileBtn').addEventListener('click', () => {
        const name = document.getElementById('confName').value.trim();
        let url = document.getElementById('confUrl').value.trim();
        const user = document.getElementById('confUser').value.trim();
        const pass = document.getElementById('confPass').value.trim();

        if(!name || !url || !user || !pass) return showMsg('请填写完整信息');
        if(!url.endsWith('/')) url += '/';

        profiles.push({ id: Date.now().toString(), name, url, user, pass });
        saveProfiles();
        configForm.style.display = 'none';
    });

    // ==========================================
    // 工具函数
    // ==========================================
    function getAuth() { return 'Basic ' + btoa(currentProfile.user + ":" + currentProfile.pass); }
    function toggleToolbar(enabled) {
        searchInput.disabled = !enabled;
        newFolderBtn.disabled = !enabled;
        uploadBtn.disabled = !enabled;
        cutBtn.disabled = !enabled;
        if (!enabled) selectAllCheckbox.checked = false;
    }
    
    function formatSize(bytes) {
        if (!bytes) return '-';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    // ==========================================
    // 2. WebDAV 核心解析与渲染
    // ==========================================
    async function loadDirectory(targetUrl) {
        showMsg("正在加载...", false); 
        currentPathUrl = targetUrl;
        renderBreadcrumb();
        fileList.innerHTML = '<div style="padding: 20px; color: #666;">加载中...</div>';
        toggleToolbar(false);
        searchInput.value = '';

        const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:">
                <D:prop><D:displayname/><D:resourcetype/><D:getcontentlength/><D:getlastmodified/></D:prop>
            </D:propfind>`;

        try {
            const response = await fetch(targetUrl, {
                method: 'PROPFIND',
                headers: { 'Authorization': getAuth(), 'Depth': '1' },
                body: xmlBody
            });

            if (!response.ok) throw new Error(`HTTP 错误: ${response.status}`);
            const xmlText = await response.text();
            parseAndRender(xmlText, targetUrl);
            showMsg("加载成功", true); 
            toggleToolbar(true);
        } catch (error) {
            fileList.innerHTML = `<div style="padding: 20px; color: red;">加载失败: ${error.message}</div>`;
            showMsg("加载失败", true);
        }
    }

    function parseAndRender(xmlString, baseUrl) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const responses = xmlDoc.getElementsByTagNameNS("*", "response");
        
        let files = [];
        for (let i = 1; i < responses.length; i++) {
            const href = responses[i].getElementsByTagNameNS("*", "href")[0]?.textContent || "";
            const prop = responses[i].getElementsByTagNameNS("*", "prop")[0];
            if (!prop) continue;

            const nameNode = prop.getElementsByTagNameNS("*", "displayname")[0];
            let name = nameNode ? nameNode.textContent : decodeURIComponent(href.split('/').filter(Boolean).pop());
            const isDir = prop.getElementsByTagNameNS("*", "collection").length > 0;
            
            const sizeNode = prop.getElementsByTagNameNS("*", "getcontentlength")[0];
            const size = sizeNode ? parseInt(sizeNode.textContent) : 0;
            
            const dateNode = prop.getElementsByTagNameNS("*", "getlastmodified")[0];
            const lastMod = dateNode ? dateNode.textContent : "";

            const fullUrl = new URL(href, currentProfile.url).href;
            files.push({ name, isDir, fullUrl, size, lastMod });
        }

        files.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        currentDirFiles = files;
        renderFiles(files);
    }

    function renderFiles(filesToRender) {
        fileList.innerHTML = '';
        if (filesToRender.length === 0) {
            fileList.innerHTML = '<div style="padding: 20px; color: #999;">文件夹为空</div>';
            return;
        }

        filesToRender.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            
            // --- 修改：第一列加入了 checkbox ---
            div.innerHTML = `
                <div class="file-checkbox">
                    <input type="checkbox" class="item-checkbox" data-url="${file.fullUrl}" data-name="${file.name}" data-isdir="${file.isDir}">
                </div>
                <div class="file-name-col">
                    <div class="file-icon">${file.isDir ? '📁' : '📄'}</div>
                    <div class="file-name ${file.isDir ? 'folder' : ''}" title="${file.name}">${file.name}</div>
                </div>
                <div class="file-size">${file.isDir ? '-' : formatSize(file.size)}</div>
                <div class="file-date">${formatDate(file.lastMod)}</div>
                <div class="file-actions"></div>
            `;

            const actionsDiv = div.querySelector('.file-actions');

            if (file.isDir) {
                div.querySelector('.file-name').addEventListener('click', () => {
                    pathStack.push({ name: file.name, url: file.fullUrl });
                    loadDirectory(file.fullUrl);
                });
            } else {
                div.querySelector('.file-name').addEventListener('click', () => openPreview(file));

                const btnDl = document.createElement('button');
                btnDl.textContent = '下载';
                btnDl.onclick = () => downloadWebDAVFile(file);
                actionsDiv.appendChild(btnDl);
            }

            const btnRename = document.createElement('button');
            btnRename.textContent = '重命名';
            btnRename.onclick = () => renameWebDAVFile(file);
            actionsDiv.appendChild(btnRename);

            const btnDel = document.createElement('button');
            btnDel.textContent = '删除';
            btnDel.className = 'btn-danger';
            btnDel.onclick = () => deleteWebDAVFile(file);
            actionsDiv.appendChild(btnDel);

            fileList.appendChild(div);
        });
    }

    function renderBreadcrumb() {
        breadcrumb.innerHTML = '';
        pathStack.forEach((pathNode, index) => {
            const span = document.createElement('span');
            span.textContent = pathNode.name;
            span.onclick = () => {
                pathStack = pathStack.slice(0, index + 1);
                loadDirectory(pathNode.url);
            };
            breadcrumb.appendChild(span);
            if (index < pathStack.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'separator';
                sep.textContent = ' / ';
                breadcrumb.appendChild(sep);
            }
        });
    }

    // ==========================================
    // 3. 高级文件操作 (新增移动逻辑)
    // ==========================================
    
    // 【新增】收集勾选的文件到剪贴板
    function cutSelectedFiles() {
        const checkedBoxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkedBoxes.length === 0) {
            alert("请先勾选需要移动的文件或文件夹！");
            return;
        }

        clipboard = Array.from(checkedBoxes).map(cb => ({
            url: cb.dataset.url,
            name: cb.dataset.name,
            isDir: cb.dataset.isdir === 'true'
        }));

        pasteBtn.style.display = 'inline-block'; // 显示粘贴按钮
        pasteBtn.innerText = `📋 粘贴 (${clipboard.length})`;
        
        // 清除全选框状态
        selectAllCheckbox.checked = false;
        document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
        
        showMsg(`已剪切 ${clipboard.length} 个项目，请进入目标文件夹后点击右上角"粘贴"`, false);
        setTimeout(() => { document.getElementById('globalMsg').style.display = 'none'; }, 4000);
    }

    // 【新增】在当前目录批量执行移动操作
    async function pasteFiles() {
        if (clipboard.length === 0) return;
        
        showMsg(`⏳ 正在移动 ${clipboard.length} 个项目...`, false);
        let successCount = 0;
        let failCount = 0;

        for (const item of clipboard) {
            // 构造目标 URL
            let destUrl = currentPathUrl + encodeURIComponent(item.name);
            if (item.isDir && !destUrl.endsWith('/')) destUrl += '/';

            // 防呆：如果是同一个目录，跳过
            if (item.url === destUrl) {
                successCount++;
                continue; 
            }

            try {
                const response = await fetch(item.url, {
                    method: 'MOVE',
                    headers: { 'Authorization': getAuth(), 'Destination': destUrl }
                });
                
                if (response.ok || response.status === 201 || response.status === 204) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                console.error("移动出错", err);
                failCount++;
            }
        }

        // 移动完毕，清空剪贴板并隐藏按钮
        clipboard = [];
        pasteBtn.style.display = 'none';
        
        if (failCount === 0) {
            showMsg(`✅ 成功移动 ${successCount} 个项目`, true);
        } else {
            showMsg(`⚠️ 移动结束: 成功 ${successCount} 个，失败 ${failCount} 个`, true);
        }
        
        loadDirectory(currentPathUrl); // 刷新目录看到新文件
    }

    async function createFolder() {
        const folderName = prompt("请输入新文件夹名称:");
        if (!folderName) return;
        showMsg("正在创建...", false);
        const targetUrl = currentPathUrl + encodeURIComponent(folderName) + "/";
        try {
            const response = await fetch(targetUrl, { method: 'MKCOL', headers: { 'Authorization': getAuth() } });
            if (!response.ok && response.status !== 201) throw new Error(`HTTP ${response.status}`);
            loadDirectory(currentPathUrl); 
        } catch (err) { alert("创建失败: " + err.message); showMsg("", true); }
    }

    function uploadFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0]; 
        const targetUrl = currentPathUrl + encodeURIComponent(file.name);
        toggleToolbar(false);
        showMsg(`⏳ 准备上传: ${file.name}...`, false);

        const xhr = new XMLHttpRequest();
        xhr.open('PUT', targetUrl, true);
        xhr.setRequestHeader('Authorization', getAuth());

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                showMsg(`⏳ 正在上传: ${file.name} (${percentComplete}%)`, false);
            }
        };
        xhr.onload = function() {
            if (xhr.status === 201 || xhr.status === 204 || xhr.status === 200) {
                showMsg("✅ 上传成功！", true);
                loadDirectory(currentPathUrl);
            } else {
                showMsg(`❌ 上传失败: HTTP ${xhr.status}`, true);
                toggleToolbar(true);
            }
        };
        xhr.onerror = function() { showMsg("❌ 上传发生网络错误", true); toggleToolbar(true); };
        xhr.send(file);
        fileUploader.value = ''; 
    }

    async function deleteWebDAVFile(file) {
        const type = file.isDir ? '文件夹' : '文件';
        if (!confirm(`⚠️ 警告: 确定要彻底删除${type} "${file.name}" 吗？此操作无法撤销！`)) return;
        showMsg("正在删除...", false);
        try {
            const response = await fetch(file.fullUrl, { method: 'DELETE', headers: { 'Authorization': getAuth() } });
            if (!response.ok && response.status !== 204) throw new Error(`HTTP ${response.status}`);
            loadDirectory(currentPathUrl); 
        } catch (err) { alert("删除失败: " + err.message); showMsg("", true); }
    }

    async function downloadWebDAVFile(file) {
        showMsg(`开始下载: ${file.name}...`, false);
        try {
            const response = await fetch(file.fullUrl, { headers: { 'Authorization': getAuth() } });
            if (!response.ok) throw new Error('下载失败');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            chrome.downloads.download({ url: url, filename: file.name, saveAs: true }, () => {
                URL.revokeObjectURL(url);
                showMsg("已触发下载", true);
            });
        } catch (err) { alert(err.message); showMsg("", true); }
    }

    async function renameWebDAVFile(file) {
        const newName = prompt(`将 "${file.name}" 重命名为:`, file.name);
        if (!newName || newName === file.name) return;
        showMsg("正在处理...", false);
        const parts = file.fullUrl.split('/');
        if (file.isDir) {
            parts.pop(); parts.pop();
            parts.push(encodeURIComponent(newName)); parts.push('');
        } else {
            parts.pop(); 
            parts.push(encodeURIComponent(newName));
        }
        const destinationUrl = parts.join('/');

        try {
            const response = await fetch(file.fullUrl, {
                method: 'MOVE',
                headers: { 'Authorization': getAuth(), 'Destination': destinationUrl }
            });
            if (!response.ok && response.status !== 201 && response.status !== 204) throw new Error(`HTTP ${response.status}`);
            loadDirectory(currentPathUrl);
        } catch (err) { alert("重命名失败: " + err.message); showMsg("", true); }
    }

    async function openPreview(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
        const textExts = ['txt', 'md', 'json', 'js', 'html', 'css', 'xml', 'csv', 'py', 'ini', 'conf'];

        previewTitle.textContent = file.name;
        imagePreview.style.display = 'none';
        textEditor.style.display = 'none';
        modalFooter.style.display = 'none';
        
        if (imageExts.includes(ext)) {
            showMsg("正在加载图片...", false);
            try {
                const response = await fetch(file.fullUrl, { headers: { 'Authorization': getAuth() } });
                if (!response.ok) throw new Error('读取失败');
                const blob = await response.blob();
                imagePreview.src = URL.createObjectURL(blob);
                imagePreview.style.display = 'block';
                previewModal.style.display = 'flex';
                showMsg("✅ 加载完成", true);
            } catch (err) { alert("图片加载失败"); showMsg("", true); }

        } else if (textExts.includes(ext)) {
            showMsg("正在读取文本...", false);
            try {
                const response = await fetch(file.fullUrl, { headers: { 'Authorization': getAuth() } });
                if (!response.ok) throw new Error('读取失败');
                const text = await response.text();
                textEditor.value = text;
                textEditor.style.display = 'block';
                modalFooter.style.display = 'block';
                currentEditingFile = file;
                previewModal.style.display = 'flex';
                showMsg("✅ 加载完成", true);
            } catch (err) { alert("文本读取失败"); showMsg("", true); }

        } else {
            downloadWebDAVFile(file);
        }
    }

    let msgTimeout;
    function showMsg(text, autoHide = true) {
        const msgDiv = document.getElementById('globalMsg');
        msgDiv.textContent = text;
        msgDiv.style.display = 'block';
        clearTimeout(msgTimeout); 
        if (autoHide) {
            msgTimeout = setTimeout(() => { msgDiv.style.display = 'none'; }, 2000);
        }
    }
});