// admin_i18n.pb.js - PocketBase 官方管理后台中文化挂钩扩展 (支持中英切换且默认中文)

// 注册 /_/vn_i18n.js 静态脚本路由，提供客户端汉化核心及悬浮切换器
// v0.23+ 回调签名：参数为 event e（不再用 echo.Context c）
routerAdd("GET", "/_/vn_i18n.js", (e) => {
  const jsContent = `(function() {
    // 1. 初始化偏好 (默认中文)
    let lang = localStorage.getItem("vn_admin_lang") || "zh";
    
    // 2. 翻译对照辞典
    const dict = {
      // 侧边栏及主导航
      "Collections": "数据集合配置",
      "Logs": "系统访问日志",
      "Settings": "系统参数设置",
      "Admins": "管理员账户",
      "Admin accounts": "管理员账户管理",
      "Logs & Statistics": "日志与统计分析",
      
      // 集合属性与规则类
      "Search collections...": "搜索集合...",
      "New collection": "新建数据集合",
      "System collections": "系统数据集合",
      "Records": "数据记录列表",
      "API Rules": "API 访问权限规则",
      "Schema": "字段结构定义 (Schema)",
      "Indexes": "数据索引优化",
      "System collection": "系统内置集合",
      
      // 操作按钮类
      "New record": "新建记录",
      "Create": "创建记录",
      "Delete": "删除",
      "Save": "保存",
      "Save changes": "保存修改",
      "Cancel": "取消",
      "Search records...": "搜索当前数据...",
      "Sort by": "排序规则",
      "Delete collection": "删除当前集合",
      "Edit collection": "编辑当前集合",
      "Export collection": "导出集合声明",
      "Import collections": "导入集合声明",
      "Toggle sidebar": "切换侧边栏",
      "Duplicate": "复制记录",
      "Next": "下一页",
      "Prev": "上一页",
      "Clear": "清空",
      "Reset": "重置",
      "Download": "下载",
      "Upload": "上传",
      
      // 字段类型
      "Plain text": "纯文本 (Text)",
      "Number": "数字 (Number)",
      "Bool": "布尔值 (Bool)",
      "Email": "电子邮箱 (Email)",
      "Url": "URL 链接 (Url)",
      "Date": "日期时间 (Date)",
      "Select": "单选/多选 (Select)",
      "File": "媒体文件 (File)",
      "Relation": "关系关联 (Relation)",
      "Json": "JSON 对象 (Json)",
      "Password": "安全密码 (Password)",
      
      // 设置项大项
      "Application": "应用程序属性",
      "Mail settings": "邮件发送 (SMTP)",
      "File storage": "媒体文件存储",
      "Token options": "JWT Token 选项",
      "Auth providers": "第三方 Auth 接入",
      "Backups": "数据备份与还原",
      
      // 弹窗提示与状态
      "Success": "操作成功",
      "Error": "发生错误",
      "Warning": "安全警告",
      "Are you sure?": "您确定要继续吗？",
      "This action cannot be undone.": "此操作将永久生效且无法撤销，请谨慎处理！",
      "Confirm": "确认",
      "Confirm delete": "确认删除",
      
      // 管理员登录页
      "PocketBase Admin Login": "VoiceNest PocketBase 管理后台",
      "Password": "管理员密码",
      "Login": "安全登录",
      "Forgot password?": "忘记密码？"
    };

    // 3. 执行翻译方法
    function translate(text) {
      if (!text) return text;
      const trimmed = text.trim();
      if (dict[trimmed]) {
        return text.replace(trimmed, dict[trimmed]);
      }
      return text;
    }
    
    // 递归遍历 DOM 树节点
    function walk(node) {
      if (node.nodeType === 3) { // 文本节点
        const parent = node.parentNode;
        if (parent) {
          const tag = parent.tagName.toLowerCase();
          // 绝对不能翻译代码区块、输入框与样式代码，以防代码被篡改或打字时被清空
          if (tag === 'code' || tag === 'pre' || tag === 'textarea' || tag === 'script' || tag === 'style') {
            return;
          }
        }
        const translated = translate(node.nodeValue);
        if (translated !== node.nodeValue) {
          node.nodeValue = translated;
        }
      } else if (node.nodeType === 1) { // 元素节点
        // 翻译 placeholder 属性
        if (node.tagName.toLowerCase() === 'input' || node.tagName.toLowerCase() === 'textarea') {
          const placeholder = node.getAttribute('placeholder');
          if (placeholder) {
            const translated = translate(placeholder);
            if (translated !== placeholder) {
              node.setAttribute('placeholder', translated);
            }
          }
        }
        
        // 遍历所有子节点
        for (let child = node.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
      }
    }
    
    // 4. 监听 DOM 树动态变化 (适配 Svelte SPA 异步渲染)
    let observer;
    function startObserver() {
      if (observer) return;
      walk(document.body);
      
      observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => walk(node));
          } else if (mutation.type === 'characterData') {
            walk(mutation.target);
          }
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    
    function stopObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    // 5. 注入精致的毛玻璃悬浮语言切换器 UI
    function injectLangSelector() {
      const style = document.createElement("style");
      style.innerHTML = \`
        #vn-lang-selector {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 99999;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 11px;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          cursor: pointer;
          user-select: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          align-items: center;
          gap: 6px;
          color: #444;
          font-weight: 500;
        }
        #vn-lang-selector:hover {
          background: rgba(255, 255, 255, 0.95);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
        }
        #vn-lang-selector:active {
          transform: translateY(0);
        }
        .dark-mode-detected #vn-lang-selector {
          background: rgba(30, 30, 30, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ddd;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        .dark-mode-detected #vn-lang-selector:hover {
          background: rgba(40, 40, 40, 0.95);
        }
      \`;
      document.head.appendChild(style);
      
      const el = document.createElement("div");
      el.id = "vn-lang-selector";
      el.innerText = lang === "zh" ? "🌐 语言: 简体中文" : "🌐 Lang: English";
      el.addEventListener("click", () => {
        if (lang === "zh") {
          lang = "en";
          localStorage.setItem("vn_admin_lang", "en");
          el.innerText = "🌐 Lang: English";
          stopObserver();
          window.location.reload(); // 重载页面以完整恢复为官方英文排版
        } else {
          lang = "zh";
          localStorage.setItem("vn_admin_lang", "zh");
          el.innerText = "🌐 语言: 简体中文";
          startObserver();
        }
      });
      document.body.appendChild(el);
    }
    
    // 6. 辅助暗色模式特征检测
    function detectDarkMode() {
      if (document.body.classList.contains("dark") || 
          document.documentElement.getAttribute("data-theme") === "dark" ||
          window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark-mode-detected");
      }
    }
    
    function init() {
      detectDarkMode();
      injectLangSelector();
      if (lang === "zh") {
        startObserver();
      }
    }
    
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();`;

  return e.string(200, jsContent, "application/javascript; charset=utf-8");
});

// 历史上曾重写 GET /_/ 注入汉化脚本，但该路由与 PocketBase 内置的
// GET /_/{path...} 静态资源路由冲突，会导致 PB 启动时 panic。
// 已删除该重写块。如需启用汉化，可在浏览器控制台手动执行：
//   var s=document.createElement('script');s.src='/_/vn_i18n.js';document.head.appendChild(s);
// 或后续通过 OnAdminsListViewBeforeRender 等 view render hook 正确注入。
