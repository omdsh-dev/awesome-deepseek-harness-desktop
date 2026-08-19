# ADHD：开箱即用的 DeepSeek Harness 桌面版

**Author / Maintainer:** [@Zacklinkk](https://github.com/Zacklinkk)

ADHD 的全名是 **Awesome DeepSeek Harness Desktop**。

它把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 装进一个 Electron 桌面应用里。下载安装包、双击打开，就能使用 Harness，不需要自己安装 Node.js，不需要敲 `dsh web`，也不需要一直开着浏览器。

> ADHD 是社区项目，并非 DeepSeek 官方产品，也未得到 DeepSeek 官方背书。

## 支持哪些系统？

- Windows 10 / 11（64 位）
- macOS 12 Monterey 及以上（Apple 芯片或 Intel 64 位）
- Linux x64（实验性支持）

Windows 10+ 是 Electron 23 之后的官方支持范围。项目当前使用 Electron 43；macOS 构建使用 macOS 12 仍可运行的 Electron 43 系列。

## 普通用户怎么安装？

安装包会由 GitHub Actions 自动生成，并且只有在安装包真正启动、Harness 后台服务就绪、界面完成渲染后，构建才会显示成功。打开仓库的 **Actions** 页面，进入最近一次成功的 `Build desktop installers`，在页面底部下载自己系统对应的文件：

- Windows：下载 `ADHD-Windows-X64`，解压后运行 `.exe` 安装程序。
- Apple 芯片 Mac：下载 `ADHD-macOS-ARM64`，解压并打开 `.dmg`。
- Intel Mac：下载 `ADHD-macOS-X64`，解压并打开 `.dmg`。
- Linux x64：下载 `ADHD-Linux-X64`，解压后给 `.AppImage` 添加执行权限并运行。

目前安装包还没有购买商业代码签名证书：

- Windows 第一次打开可能出现 SmartScreen 提示，确认文件来自本仓库后，点击“更多信息”再选择“仍要运行”。
- macOS 第一次打开可能提示开发者未经验证。请在 Finder 中按住 Control 点击 ADHD，选择“打开”，然后再次确认。

## 第一次打开

1. 双击 ADHD。
2. 启动画面会停留几秒，应用正在后台启动 Harness。
3. 进入界面后，打开设置页配置模型和 API Key。
4. 选择或输入工作目录，就可以开始对话和执行任务。

ADHD 默认把 Harness 的配置、凭据和会话保存在应用自己的数据目录中，升级应用不会删除这些数据。

## 它到底做了什么？

```text
ADHD（Electron 桌面窗口）
  └─ 安装包自带的 Node.js
       └─ 官方 @deepseek-ai/dsh
            └─ 只监听 127.0.0.1 随机端口的 Harness Web 界面和 API
```

ADHD 没有重新实现 Harness。Harness 的 CLI、插件、API 和网页界面都直接来自官方 npm 包 [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh)。Electron 只负责显示窗口、启动后台服务，以及在退出时清理后台进程。

## 数据放在哪里？

- Windows：`%APPDATA%/adhd/dsh-home`
- macOS：`~/Library/Application Support/adhd/dsh-home`
- 日志：同一应用数据目录下的 `logs/dsh.log`

如果启动失败，先查看 `dsh.log`。提交 Issue 时请删除日志里的 API Key、Token、用户名和个人路径后再粘贴。

## 常见问题

### 打开后一直停在启动画面

最多等待 90 秒。如果随后弹出错误提示，请打开提示中给出的 `dsh.log`。最常见原因是安装包不完整，重新下载并解压通常可以解决。

### 需要自己安装 Node.js 或 DSH 吗？

不需要。安装包已经包含经过官方 SHA-256 清单校验的 Node.js，以及固定版本的官方 DSH npm 包。

### Harness 会开放到局域网吗？

不会。ADHD 强制绑定 `127.0.0.1`，并让操作系统随机选择空闲端口。

### 升级会丢失会话吗？

正常升级不会。用户数据和应用程序安装目录分开保存。但在删除应用数据目录之前，建议先备份重要会话。

## 给开发者

需要 Node.js 24+ 和 npm：

```bash
npm install
npm start
```

运行检查：

```bash
npm run check
```

构建当前系统的安装包：

```bash
npm run dist
```

构建脚本会下载与当前系统、CPU 架构匹配的 Node.js 24 LTS，使用 Node.js 官方 `SHASUMS256.txt` 验证后再放入安装包。Windows、macOS、Linux 必须分别在对应系统上原生构建；仓库中的 GitHub Actions 已经配置 Windows x64、macOS ARM64、macOS x64 和 Linux x64 四套 Runner。

可设置 `ADHD_WORKSPACE=/path/to/workspace` 覆盖开发环境的默认工作目录。

## 当前固定版本

| 组件 | 版本 |
| --- | --- |
| ADHD | `0.2.0` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` |
| Electron | `43.4.0` |
| 内置 Node.js | `v24.19.0`（Krypton LTS） |

DSH 目前仍是 RC 版本，变化很快。固定版本可以保证同一个 ADHD 版本每次构建得到一致的运行环境。

## 当前限制

- 安装包尚未进行 Windows Authenticode 或 Apple Developer ID 签名。
- 当前版本暂未提供应用内自动更新。
- 当前 CI 提供 Windows x64、macOS Apple Silicon、macOS Intel 和 Linux x64 安装包。
- 自动化 smoke 会启动打包后的 Electron 应用并验证 Harness UI；涉及真实 API 计费的模型对话仍需用户自行配置密钥后验证。

## 许可证

ADHD 使用 MIT License。DeepSeek Harness、Electron、Node.js 和其他依赖分别遵守各自的许可证。
