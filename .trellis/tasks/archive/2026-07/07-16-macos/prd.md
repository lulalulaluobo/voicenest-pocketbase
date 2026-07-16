# 忽略 macOS 元数据文件

## Goal

让仓库忽略任意目录下的 macOS `.DS_Store` 文件，并将已经被 Git 跟踪的根目录 `.DS_Store` 从索引移除，但保留本地文件。

## What I already know

- 根 `.gitignore` 未包含 `.DS_Store` 规则。
- 根目录 `.DS_Store` 已被 Git 跟踪，其他目录中的同名文件当前显示为未跟踪。

## Requirements

- 使用一条标准 Git 忽略规则覆盖所有目录层级的 `.DS_Store`。
- 停止跟踪现有根目录 `.DS_Store`，不删除本地文件。

## Acceptance Criteria

- [x] `git check-ignore` 显示根目录及嵌套目录的 `.DS_Store` 均由根 `.gitignore` 忽略。
- [x] `git ls-files` 不再包含 `.DS_Store`。

## Out of Scope

- 不修改其他 macOS 元数据规则或清理本地文件。

## Technical Notes

- 受影响文件仅为根 `.gitignore` 与 Git 索引。
