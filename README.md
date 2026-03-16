# PhysAI Paper Assistant

<p align="center">
  <img src="icons/icon128.png" alt="PhysAI Logo" width="128" height="128">
</p>

<p align="center">
  <strong>专为物理论文阅读、投喂、写作设计的私人AI论文助手</strong>
</p>

<p align="center">
  <a href="#features">功能</a> •
  <a href="#installation">安装</a> •
  <a href="#usage">使用指南</a> •
  <a href="#configuration">配置</a> •
  <a href="#privacy">隐私</a>
</p>

---

## ✨ 功能特性

### 📖 阅读模式 (Reading Mode)
- 自动检测学术论文页面 (arXiv, APS, Nature, ScienceDirect等)
- 基于向量嵌入 + 余弦相似度计算，自动浮现相关论文
- 显示相关度分数 (0-100%) 和匹配点
- 支持PDF预览和下载

### 📥 投喂模式 (Feed Mode)
- 拖拽上传PDF文件
- 使用 pdf.js 完整提取文本
- PDF二进制存入 IndexedDB，完全本地私有
- 调用 LLM 生成结构化摘要 (JSON格式)

### ✍️ 写作模式 (Writing Mode)
- 输入论文主题或草稿片段
- 自动调用相关度计算，列出可借鉴论文
- 生成 PRL/PRX/Nature Physics 风格 LaTeX 代码
- 一键复制、下载、或打开 Overleaf
- 生成科研图表的 Gemini Prompt

---

## 🔧 安装

### 方法 1: 从源码安装 (推荐)

1. **克隆或下载本项目**
   ```bash
   git clone https://github.com/your-repo/PhysAI-Paper-Assistant.git
   ```

2. **打开 Chrome 扩展管理页面**
   - 在地址栏输入: `chrome://extensions/`
   - 或点击 Chrome 菜单 → 更多工具 → 扩展程序

3. **启用开发者模式**
   - 点击右上角的「开发者模式」开关

4. **加载未打包的扩展程序**
   - 点击「加载已解压的扩展程序」
   - 选择项目的 `PhysAI-Paper-Assistant` 文件夹

5. **固定到工具栏**
   - 点击扩展程序图标旁的「固定」按钮

### 方法 2: 打包安装

1. 在扩展程序页面点击「打包扩展程序」
2. 选择扩展程序根目录
3. 生成 `.crx` 文件后拖入 Chrome 安装

---

## 📖 使用指南

### 首次设置

1. **点击插件图标** → 点击 ⚙️ **设置** 按钮
2. **配置 API Key**:
   - 选择 LLM Provider (OpenAI/Gemini/Grok/Claude)
   - 输入对应的 API Key
   - 选择 Chat Model 和 Embedding Model
3. **点击保存** 💾

### 投喂论文

1. 点击插件图标 → 切换到 **Feed** 标签
2. 拖拽 PDF 文件到上传区域，或点击选择文件
3. 等待处理完成 (提取文本 → 生成摘要 → 生成向量 → 保存)
4. 论文会自动添加到 Library

### 阅读论文

1. 打开学术论文页面 (如 arXiv.org)
2. 插件会自动检测并显示侧边栏
3. 侧边栏会显示与当前论文相关的已投喂论文
4. 显示相关度分数和详细匹配点

### AI 写作

1. 点击插件图标 → 切换到 **Writer** 标签
2. 输入论文主题或草稿
3. 可选: 勾选使用已存储论文作为参考
4. 点击 **Generate LaTeX** 生成论文
5. 使用 **Copy** / **Download** / **Open Overleaf** 快捷操作

### 生成图表 Prompt

1. 在 Writer 面板描述你想要的图表
2. 点击 **Generate Figure**
3. 复制生成的 Prompt 到 Google Gemini

---

## ⚙️ 配置说明

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| LLM Provider | 大语言模型提供商 | OpenAI |
| API Key | 各平台API密钥 | - |
| Chat Model | 对话模型 | gpt-4o |
| Embedding Provider | 向量嵌入提供商 | OpenAI |
| Embedding Model | 嵌入模型 | text-embedding-3-small |
| Similarity Threshold | 相关度阈值 (70%推荐) | 70% |

---

## 🔒 隐私说明

- **100% 本地私有**: 所有数据存储在浏览器 IndexedDB 中
- **无服务器通信**: API Key 仅用于调用 LLM 服务商
- **不收集数据**: 插件不会收集任何用户数据
- **完全离线**: 除 LLM API 外，无其他网络请求

---

## 📋 系统要求

- Chrome 浏览器 (90+ 版本)
- API Key (OpenAI/Gemini/Grok/Claude 之一)
- 网络连接 (用于 LLM API 调用)

---

## 📁 项目结构

```
PhysAI-Paper-Assistant/
├── manifest.json          # 扩展清单 (Manifest V3)
├── background/
│   └── background.js      # 后台服务脚本
├── content/
│   ├── content.js         # 内容脚本 (侧边栏)
│   ├── content.css       # 侧边栏样式
│   └── pdf-viewer.js     # PDF查看器
├── popup/
│   ├── index.html        # 弹窗页面
│   ├── popup.js          # 弹窗逻辑
│   └── styles.css        # 弹窗样式
├── settings/
│   ├── index.html        # 设置页面
│   ├── settings.js       # 设置逻辑
│   └── styles.css        # 设置样式
├── lib/
│   └── pdf.js/           # PDF.js 库
├── icons/                # 扩展图标
└── README.md             # 本文件
```

---

## 🐛 问题排查

### 扩展无法加载
- 确保已启用「开发者模式」
- 检查是否有语法错误 (查看控制台)

### API 调用失败
- 确认 API Key 正确
- 检查网络连接
- 确认 API 配额充足

### 侧边栏不显示
- 确保在支持的学术网站 (arXiv, APS, Nature 等)
- 刷新页面重试

---

## 📄 许可证

MIT License

---

<p align="center">
  Made with ⚛️ for Physics Researchers
</p>
