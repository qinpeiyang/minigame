# Unity 构建说明

当前服务器是 Ubuntu arm64，Unity Hub 官方 Linux 源是 amd64 only，因此不能在本机安装并运行 Unity Editor。

在 amd64 构建机上：

1. 安装 Unity 2022.3 LTS + WebGL Build Support。
2. 打开 `UnityProject`。
3. Unity 会根据 `Packages/manifest.json` 拉取微信小游戏转换 SDK：
   `https://github.com/wechat-miniprogram/minigame-tuanjie-transform-sdk.git`
4. 执行菜单：`GiantCleaner / Build WebGL`。
5. 使用微信小游戏转换 SDK 导出，配置：
   - AppID: `wxcafe441891f7a49f`
   - 横屏 Landscape
   - 游戏名：巨物清洁工
6. 使用微信开发者工具或 miniprogram-ci 上传体验版。

命令行 WebGL 构建示例：

```bash
/opt/unity/Editor/Unity \
  -batchmode -quit \
  -projectPath /path/to/minigame/UnityProject \
  -executeMethod BuildWebGL.BuildBatch \
  -logFile /tmp/giant-cleaner-build.log
```
