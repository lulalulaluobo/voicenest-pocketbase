// admin_i18n.pb.js - PocketBase 官方管理后台中文化挂钩扩展 (支持中英切换且默认中文，并包含默认管理员改密强制弹窗)

// ==========================================
// 0. 安全防护：禁止删除初始管理员用户 & 禁止删除 users 集合
// ==========================================

// 禁止在 users 集合中删除 admin@example.com（初始管理员账号）
onRecordDeleteExecute((e) => {
  if (e.record.collection().name === "users") {
    const email = e.record.get("email");
    if (email === "admin@example.com") {
      throw new BadRequestError("禁止删除初始管理员账号 admin@example.com，请联系系统管理员。");
    }
  }
  e.next();
});

// 禁止删除 users 系统集合本身
onCollectionDeleteExecute((e) => {
  if (e.collection.name === "users") {
    throw new BadRequestError("禁止删除 users 系统集合，该集合为系统核心数据表。");
  }
  e.next();
});

// ==========================================
// 1. 超级管理员免旧密码直接重置 API
// ==========================================
routerAdd("POST", "/api/admin/reset-password", (c) => {
  // 获取当前已在管理后台登录的超级用户实体 (由内置中间件从请求头中解析)
  const admin = c.get("admin");
  if (!admin) {
    return c.json(401, { code: "UNAUTHORIZED", message: "仅限已登录的超级管理员调用" });
  }

  try {
    const body = JSON.parse(c.request().body);
    const newPassword = body.newPassword || "";

    if (newPassword.trim().length < 10) {
      return c.json(400, { code: "INVALID_PASSWORD", message: "新密码长度必须至少为 10 位" });
    }

    admin.setPassword(newPassword.trim());
    c.app.saveAdmin(admin);

    // 在 wechat_kv 表中写入改密成功标记以供前台检测
    try {
      let kvRecord;
      try {
        kvRecord = c.app.findFirstRecordByData("wechat_kv", "key", "admin:password_changed");
      } catch (_) {
        const collection = c.app.findCollectionByNameOrId("wechat_kv");
        kvRecord = new Record(collection);
        kvRecord.set("key", "admin:password_changed");
      }
      kvRecord.set("value", "true");
      c.app.save(kvRecord);
    } catch (kvErr) {
      // 即使 KV 写入失败，也仅在控制台输出警告，不阻断主流程改密成功返回
      console.log("[VoiceNest] 警告: 写入管理员改密标志失败: " + kvErr.message);
    }

    return c.json(200, { success: true, message: "超级管理员密码重置成功" });
  } catch (err) {
    return c.json(500, { code: "INTERNAL_ERROR", message: "重置密码失败: " + err.message });
  }
});

// ==========================================
// 2. 静态中文化 JS 注入脚本定义 (含强制改密遮罩与重设密码控制面板)
// ==========================================
routerAdd("GET", "/_/vn_i18n.js", (e) => {
  // 后端先从 wechat_kv 里检测是否已经执行过改密
  let needsReset = true;
  try {
    const record = $app.findFirstRecordByData("wechat_kv", "key", "admin:password_changed");
    if (record && record.get("value") === "true") {
      needsReset = false;
    }
  } catch (_) {
    // 没找到代表尚未修改默认密码，needsReset 保持为 true
  }

  const jsContent = `(function() {
    const NEEDS_RESET_PASSWORD = ${needsReset};

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

    // 5. 注入一键改密与中英文切换面板 UI
    function injectLangSelector() {
      const style = document.createElement("style");
      style.innerHTML = \`
        #vn-lang-container {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 99999;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 14px;
          padding: 10px 14px;
          font-size: 11px;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: #444;
          transition: all 0.3s ease;
        }
        .dark-mode-detected #vn-lang-container {
          background: rgba(30, 30, 30, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ddd;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }
        .vn-btn {
          background: #07c160;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 500;
        }
        .vn-btn:hover {
          opacity: 0.9;
        }
        .vn-input {
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid #ddd;
          background: white;
          color: black;
          font-size: 10px;
        }
        .dark-mode-detected .vn-input {
          background: #444;
          border: 1px solid #555;
          color: white;
        }
      \`;
      document.head.appendChild(style);
      
      const container = document.createElement("div");
      container.id = "vn-lang-container";
      
      // 切换语言按钮
      const langBtn = document.createElement("div");
      langBtn.style.cursor = "pointer";
      langBtn.style.fontWeight = "bold";
      langBtn.innerText = lang === "zh" ? "🌐 语言: 简体中文 (点击切换)" : "🌐 Lang: English (Click)";
      langBtn.addEventListener("click", () => {
        if (lang === "zh") {
          localStorage.setItem("vn_admin_lang", "en");
          window.location.reload();
        } else {
          localStorage.setItem("vn_admin_lang", "zh");
          window.location.reload();
        }
      });
      container.appendChild(langBtn);

      // 免密码重设超级管理员密码输入区
      const hr = document.createElement("hr");
      hr.style.margin = "4px 0";
      hr.style.border = "none";
      hr.style.borderTop = "1px solid rgba(0,0,0,0.08)";
      container.appendChild(hr);

      const label = document.createElement("div");
      label.innerText = "🔑 免旧密码修改超级密码：";
      label.style.fontSize = "10px";
      label.style.color = "#777";
      container.appendChild(label);

      const inputGroup = document.createElement("div");
      inputGroup.style.display = "flex";
      inputGroup.style.gap = "4px";

      const pwInput = document.createElement("input");
      pwInput.type = "password";
      pwInput.className = "vn-input";
      pwInput.placeholder = "输入新密码 (≥10位)";
      pwInput.style.width = "110px";
      inputGroup.appendChild(pwInput);

      const saveBtn = document.createElement("button");
      saveBtn.className = "vn-btn";
      saveBtn.innerText = "修改";
      saveBtn.addEventListener("click", async () => {
        const val = pwInput.value.trim();
        if (val.length < 10) {
          alert("密码长度必须至少为 10 位");
          return;
        }
        try {
          const authData = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
          const token = authData.token || "";
          
          const response = await fetch("/api/admin/reset-password", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Admin " + token
            },
            body: JSON.stringify({ newPassword: val })
          });
          const res = await response.json();
          if (response.ok) {
            alert("✅ 管理员密码重置成功！下一次请使用新密码登录。");
            pwInput.value = "";
            // 如果存在强制修改遮罩，同步移除
            const modal = document.getElementById("vn-reset-modal");
            if (modal) modal.remove();
          } else {
            alert("⚠️ 修改失败: " + (res.message || "权限不足"));
          }
        } catch (err) {
          alert("⚠️ 请求失败: " + err.message);
        }
      });
      inputGroup.appendChild(saveBtn);
      container.appendChild(inputGroup);

      document.body.appendChild(container);
    }

    // 6. 首次登录强制修改管理员初始密码弹窗 UI 注入
    function injectResetPasswordModal() {
      if (document.getElementById("vn-reset-modal")) return;

      const el = document.createElement("div");
      el.id = "vn-reset-modal";
      el.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); z-index: 100000; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif;";
      
      el.innerHTML = \`
        <div style="background: white; padding: 32px; border-radius: 16px; width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 16px; border: 1px solid rgba(0,0,0,0.06); text-align: center;" id="vn-reset-card">
            <div style="font-size: 36px; margin-bottom: 4px;">🔒</div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #333;" id="vn-reset-title">设置您的新管理员密码</h3>
            <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.5;" id="vn-reset-desc">安全建议：为了确保您的语音收件箱系统绝对安全，请立即修改您的超级管理员默认密码！</p>
            <input type="password" id="vn-reset-pw" placeholder="输入新密码 (至少 10 位)" style="padding: 11px 14px; border-radius: 10px; border: 1px solid #ddd; font-size: 14px; background: white; color: black; outline: none; width: 100%; box-sizing: border-box;" />
            <button id="vn-reset-submit" style="background: #07c160; color: white; border: none; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; transition: opacity 0.2s; width: 100%;">立即修改并激活</button>
            <div id="vn-reset-error" style="color: #ff4d4f; font-size: 12px; display: none; text-align: left; margin-top: 4px;"></div>
         </div>
      \`;
      
      document.body.appendChild(el);

      // 适配暗色模式
      const isDark = document.documentElement.classList.contains("dark-mode-detected");
      if (isDark) {
        const card = document.getElementById("vn-reset-card");
        const title = document.getElementById("vn-reset-title");
        const desc = document.getElementById("vn-reset-desc");
        const input = document.getElementById("vn-reset-pw");
        if (card) card.style.background = "#1e1e1e";
        if (card) card.style.borderColor = "rgba(255,255,255,0.08)";
        if (title) title.style.color = "#eee";
        if (desc) desc.style.color = "#aaa";
        if (input) {
          input.style.background = "#333";
          input.style.borderColor = "#444";
          input.style.color = "white";
        }
      }

      // 绑定重设事件
      const submitBtn = document.getElementById("vn-reset-submit");
      const pwInput = document.getElementById("vn-reset-pw");
      const errorDiv = document.getElementById("vn-reset-error");

      submitBtn.addEventListener("click", async () => {
        const val = pwInput.value.trim();
        if (val.length < 10) {
          errorDiv.innerText = "⚠️ 密码长度必须至少为 10 位";
          errorDiv.style.display = "block";
          return;
        }
        errorDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.innerText = "正在提交...";

        try {
          const authData = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
          const token = authData.token || "";

          const response = await fetch("/api/admin/reset-password", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Admin " + token
            },
            body: JSON.stringify({ newPassword: val })
          });
          const res = await response.json();
          if (response.ok) {
            alert("✅ 默认密码修改成功！请牢记您的新管理员密码。");
            el.remove(); // 直接剥离弹窗遮罩，完美复原页面控制权限！
          } else {
            errorDiv.innerText = "⚠️ 修改失败: " + (res.message || "权限拒绝");
            errorDiv.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.innerText = "立即修改并激活";
          }
        } catch (err) {
          errorDiv.innerText = "⚠️ 网络连接失败: " + err.message;
          errorDiv.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.innerText = "立即修改并激活";
        }
      });
    }
    
    // 7. 辅助暗色模式特征检测
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

      // 检测管理员是否已登录，如已登录且仍用着默认密码，强制弹出遮罩限制操作
      const isAuth = !!localStorage.getItem("pocketbase_auth");
      if (isAuth && typeof NEEDS_RESET_PASSWORD !== "undefined" && NEEDS_RESET_PASSWORD) {
        injectResetPasswordModal();
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

// ==========================================
// 3. 精准重写 GET /_/index.html 避开路由冲突 Panic
// ==========================================
routerAdd("GET", "/_/index.html", (e) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PocketBase 管理后台</title>
    <link rel="icon" type="image/svg+xml" href="images/logo.svg" />
    <link rel="stylesheet" href="css/style.css" />
    <script src="/_/vn_i18n.js"></script>
</head>
<body class="light">
    <div id="app"></div>
    <script type="module" crossorigin src="js/app.js"></script>
</body>
</html>`;
  
  return e.html(200, html);
});
