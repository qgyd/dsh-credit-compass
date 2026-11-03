# 余额罗盘 · Credits Compass

一个 DeepSeek Harness 侧边栏插件：在侧栏底部（设置按钮上方那一行，和内置「插件」按钮并排）显示**当前所选模型对应账户**的剩余额度。

![icon](icon.svg)

## 它解决什么问题

Harness 里同时挂着多个 provider —— WorkBuddy 的积分包、DeepSeek 官方账户的钱包。你在输入框里切换模型，但余额是需要主动去看的另一件事。这个插件把「当前模型 → 对应账户 → 剩余多少」这条链路缩短成瞥一眼侧边栏：

| 当前模型所属 provider | 显示内容 | 数据来源 |
| --- | --- | --- |
| `workbuddy` | 剩余额度（如 `1,074`） | `/plugins/dsh-connect-workbuddy/usage?region=cn` 的 `credits.total` |
| `workbuddy-global` | 剩余额度 | 同上的 `region=global` |
| 其他 provider（DeepSeek 官方等） | 账户余额（如 `¥42.50`） | `remote.account.getBalance()` 的钱包数组 |

数字会在你切换模型后自动跟着换。**未登录、接口失败、或该账户读不到余额时，整个格子不渲染** —— 一个和数据打架的数字比没有数字更糟。

## 功能

- **跟随模型**：读 `ctx.modelDirectories.directoryFor(sessionId)` 里那个 store（和输入框旁的模型选择器同源），provider 变了就换数据源。
- **自动择币**：DeepSeek 账户同时有 CNY 和 USD 两个钱包，默认按系统区域（`navigator.language` 的 region 子标签 → 时区 → 语言族，三级回退）决定显示哪个；区域钱包为空时改显实际有钱的那个币种，绝不显示一个光秃秃的 `0`。
- **手动指定币种**：明细面板里可选「自动 / ¥ 人民币 / $ 美元」，选择存 `localStorage`，跨会话保留。
- **明细面板**：点格子展开 380px 浮层，列出每个额度包的剩余量、总额、到期/刷新时间，或每个币种钱包的余额与赠送额度。
- **手动刷新**：格子和面板标题栏各有一个刷新按钮，转圈表示正在拉取。
- **窄轨适配**：侧边栏折叠成 56px 轨时退化为 36px 圆形图标。
- **5 分钟自动轮询**：和 WorkBuddy 自己客户端的节奏一致，可手动提前刷新。

## 安装

把仓库克隆到任意位置，然后在 DSH 里用 plugin manager 安装这个目录：

```bash
git clone https://github.com/qgyd/dsh-credit-compass.git
```

```
plugin_manager action: install_bundle
  target: <克隆下来的绝对路径>
```

安装后刷新页面即可。插件会写进当前 profile，对该 profile 的所有会话生效。

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | 声明 `dsh.bundle.patch` 与 `dsh.client`（`platform: web`） |
| `cordis.patch.yml` | 一行 Host 挂载行；`dsh-client-modules` 靠它把 `dsh.client` 挂到裸包名对应的 Loader 行上 |
| `index.js` | Host half，空实现（整个插件是浏览器侧的一格） |
| `client.js` | 全部实现：数据读取、provider 感知、币种选择、格子与明细面板 |
| `locale/{zh,en}.json` | 插件列表里的标题与描述 |
| `icon.svg` | 罗盘图标 |

`client.js` 整体包在一个 IIFE 里，这一行不能丢：combo script 把多个包的 `client.js` 拼进同一个 classic script，共享全局词法作用域，顶层 `const` 撞名会让整个启动被 boot audit 拒绝。

## 兼容与降级

- 没装 `dsh-connect-workbuddy` → WorkBuddy 分支读不到，格子隐藏；官方钱包分支照常工作。
- WorkBuddy 未登录 → 该 region 返回 `signed-out`，格子隐藏。
- 官方账户未登录或返回非 `ready` → 官方分支隐藏。
- `modelDirectories` 不可用（会话还没有 scope/binding）→ 回退到「先 cn 再 global 再官方钱包」的顺序探测。
- 请求失败时**保留上一次的数字**，只有明确读不到才隐藏 —— 短暂网络抖动不该让格子闪一下消失。

## 许可

MIT
