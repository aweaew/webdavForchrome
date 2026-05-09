// 等待整个弹窗界面加载完毕后再绑定事件
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('openBtn');
    
    if (btn) {
        btn.addEventListener('click', function() {
            // 动态获取当前插件内部 index.html 的绝对真实路径
            const targetUrl = chrome.runtime.getURL('index.html');
            chrome.tabs.create({ url: targetUrl });
        });
    }
});