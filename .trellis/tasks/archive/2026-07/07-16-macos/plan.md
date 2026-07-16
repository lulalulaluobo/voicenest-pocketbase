# 忽略 macOS 元数据文件实施计划

1. [x] 在根 `.gitignore` 添加标准 `.DS_Store` 忽略规则。
2. [x] 使用 `git rm --cached .DS_Store` 停止跟踪根目录文件，保留本地副本。
3. [x] 用 `git check-ignore` 与 `git ls-files` 验证任意层级均被忽略且无已跟踪项。
