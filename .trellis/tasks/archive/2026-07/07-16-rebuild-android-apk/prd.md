# 重新构建 Android APK

## Goal

使用当前已验证的前端代码重新构建 Android debug APK，使安装包包含公众号默认封面上传等最新 Web 资源。

## Requirements

- 先运行前端生产构建，再同步 Capacitor Android 资源。
- 构建 debug APK 并报告其绝对路径。
- 不提交 APK、构建产物或本地测试 Worker/KV 配置。

## Acceptance Criteria

- [x] 前端构建与 Capacitor 同步成功。
- [x] debug APK 构建成功且文件存在。

## Out of Scope

- 不安装到设备、不修改签名配置、不发布商店。
