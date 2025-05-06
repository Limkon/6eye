#!/bin/bash

# --- 配置开始 ---
GH_USER="Limkon"                                     # GitHub 用户名
REPO_NAME="liuyanshi"                                # 仓库名
BRANCH="master"                                      # 分支
PROJECT_PARENT_DIR="/home/wwo"                       # 项目的父目录
FINAL_PROJECT_DIR="${PROJECT_PARENT_DIR}/${REPO_NAME}" # 最终部署的项目完整路径
BASE_TMP_DIR="/home/wwo/admin/tmp"                   # 用于存放本次运行临时目录的父目录
# --- 配置结束 ---

# 脚本出错时立即退出
set -e
# 管道中的任何命令失败都视为失败
set -o pipefail

# 确保基础临时目录存在且可写
if [ ! -d "$BASE_TMP_DIR" ]; then
  echo "❌ 错误：基础临时目录 '$BASE_TMP_DIR' 不存在。请创建它或修改脚本中的 BASE_TMP_DIR 变量。"
  exit 1
fi
if [ ! -w "$BASE_TMP_DIR" ]; then
  echo "❌ 错误：基础临时目录 '$BASE_TMP_DIR' 不可写。请检查权限。"
  exit 1
fi

# 创建一个唯一的临时工作目录
WORK_TMP_DIR=$(mktemp -d -p "$BASE_TMP_DIR" "tmp.install.${REPO_NAME}.XXXXXXXXXX")
if [ ! -d "$WORK_TMP_DIR" ]; then # mktemp 失败检查
    echo "❌ 错误: 创建临时工作目录失败于 '$BASE_TMP_DIR'。请检查 mktemp 是否工作正常以及 '$BASE_TMP_DIR' 权限。"
    exit 1
fi

# 定义清理函数
cleanup() {
  echo "ℹ️ 清理临时工作目录: $WORK_TMP_DIR"
  # 使用 rm -rf 时要格外小心，确保变量 WORK_TMP_DIR 已设置且不为空
  if [ -n "$WORK_TMP_DIR" ] && [ -d "$WORK_TMP_DIR" ] && [[ "$WORK_TMP_DIR" == "$BASE_TMP_DIR"/tmp.install.${REPO_NAME}.* ]]; then
    rm -rf "$WORK_TMP_DIR"
  else
    echo "⚠️ 警告: 由于 WORK_TMP_DIR ('$WORK_TMP_DIR') 无效或不符合预期格式，跳过自动清理。"
  fi
}

# 设置 trap，在脚本退出时执行清理函数
trap cleanup EXIT SIGINT SIGTERM

echo "🚀 开始安装项目..."
echo "--------------------------------------------------"
echo "👤 GitHub 用户名: $GH_USER"
echo "📦 仓库名: $REPO_NAME"
echo "🌿 分支: $BRANCH"
echo "🌍 最终项目部署目录: $FINAL_PROJECT_DIR"
echo "📂 本次运行的临时工作目录: $WORK_TMP_DIR"
echo "--------------------------------------------------"

# 检查 Node.js 和 npm 是否安装
echo "ℹ️ 检查 Node.js 和 npm 版本..."
if ! command -v node > /dev/null || ! command -v npm > /dev/null; then
  echo "❌ 错误: Node.js 或 npm 未安装或未在 PATH 中找到。"
  exit 1
fi
echo "✅ Node.js 版本: $(node -v)"
echo "✅ npm 版本: $(npm -v)"
echo "--------------------------------------------------"

# 下载项目
DOWNLOAD_URL="https://github.com/${GH_USER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.tar.gz"
ARCHIVE_NAME="${BRANCH}.tar.gz" # 通常是 master.tar.gz, main.tar.gz 等

echo "ℹ️ 准备下载项目源码从: $DOWNLOAD_URL"
echo "ℹ️ 将保存为: $WORK_TMP_DIR/$ARCHIVE_NAME"
if ! curl -sSL -o "$WORK_TMP_DIR/$ARCHIVE_NAME" "$DOWNLOAD_URL"; then
  echo "❌ 错误: 下载项目源码失败 (curl 命令执行失败)。请检查网络连接和URL。"
  # curl 本身也可能有非0退出码，set -e 会捕获
  exit 1
fi
if [ ! -s "$WORK_TMP_DIR/$ARCHIVE_NAME" ]; then # 检查文件是否为空或不存在
    echo "❌ 错误: 下载的文件 '$WORK_TMP_DIR/$ARCHIVE_NAME' 为空或不存在。"
    exit 1
fi
echo "✅ 下载完成。"
echo "--------------------------------------------------"

# 解压项目
echo "ℹ️ 准备解压 $ARCHIVE_NAME 到 $WORK_TMP_DIR ..."
# 捕获 tar 命令的输出（标准错误和标准输出合并）及其退出码
# 使用 eval 和临时文件来安全地捕获输出，避免某些情况下直接命令替换的问题，但简单场景下直接命令替换也可
tar_stderr_output=$(tar -xzf "$WORK_TMP_DIR/$ARCHIVE_NAME" -C "$WORK_TMP_DIR" 2>&1)
tar_exit_code=$?

if [ $tar_exit_code -ne 0 ]; then
  echo "❌ 错误: 'tar -xzf' 解压失败，退出码: $tar_exit_code"
  echo "tar 命令的输出/错误信息如下:"
  echo "-------------------- TAR OUTPUT START --------------------"
  echo "$tar_stderr_output"
  echo "-------------------- TAR OUTPUT END ----------------------"
  echo "请检查下载的压缩包 '$WORK_TMP_DIR/$ARCHIVE_NAME' 是否完整、磁盘空间是否充足以及 '$WORK_TMP_DIR' 的权限。"
  exit 1 # 手动退出，因为解压是关键步骤
else
  echo "✅ 'tar -xzf' 命令执行完毕 (退出码: $tar_exit_code)。"
  # 如果 tar 成功但仍然有输出到 stderr (例如某些警告)，也打印出来
  if [ -n "$tar_stderr_output" ]; then
    echo "tar 命令的输出 (可能包含警告信息):"
    echo "$tar_stderr_output"
  fi
fi

# 获取解压后生成的目录名 (GitHub通常是 REPO_NAME-BRANCH_NAME)
echo "ℹ️ 尝试确定解压后的顶层目录名..."
# 先用 tar -t 列出内容，再处理
# 注意：如果压缩包内有多个顶层条目或没有明确的单一顶层目录，此逻辑可能需要调整
list_tar_output_and_error=$(tar -tzf "$WORK_TMP_DIR/$ARCHIVE_NAME" 2>&1)
list_tar_exit_code=$?

if [ $list_tar_exit_code -ne 0 ]; then
    echo "❌ 错误: 'tar -tzf' (列出压缩包内容) 失败，退出码: $list_tar_exit_code"
    echo "tar -tzf 输出/错误信息:"
    echo "$list_tar_output_and_error"
    exit 1
fi

EXTRACTED_DIR_NAME=$(echo "$list_tar_output_and_error" | head -1 | cut -f1 -d"/")

if [ -z "$EXTRACTED_DIR_NAME" ]; then
    echo "❌ 错误: 无法从压缩包 '$WORK_TMP_DIR/$ARCHIVE_NAME' 中确定顶层目录名。"
    echo "tar -tzf 的输出可能为空或格式不符合预期。输出如下:"
    echo "$list_tar_output_and_error" # 显示实际输出帮助调试
    exit 1
fi
PROJECT_SOURCE_DIR="$WORK_TMP_DIR/$EXTRACTED_DIR_NAME"

if [ ! -d "$PROJECT_SOURCE_DIR" ]; then
    echo "❌ 错误: 预期解压后的项目源文件目录 '$PROJECT_SOURCE_DIR' 未找到。"
    echo "这可能意味着解压未按预期创建目录，或者 EXTRACTED_DIR_NAME ('$EXTRACTED_DIR_NAME') 解析不正确。"
    exit 1
fi
echo "✅ 解压完成。项目源文件位于: $PROJECT_SOURCE_DIR"
echo "--------------------------------------------------"

# 进入项目源文件目录并安装依赖
echo "ℹ️ 准备进入目录 '$PROJECT_SOURCE_DIR' ..."
cd "$PROJECT_SOURCE_DIR" || { echo "❌ 错误: 无法进入目录 '$PROJECT_SOURCE_DIR'"; exit 1; }

echo "ℹ️ 当前工作目录: $(pwd)"
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 在当前目录 ('$(pwd)') 中未找到 package.json 文件。"
    echo "请检查项目结构和解压过程是否正确。"
    exit 1
fi

echo "📦 准备执行 'npm install'..."
# 捕获 npm install 的输出和错误
npm_install_output_and_error=$(npm install 2>&1)
npm_install_exit_code=$?

if [ $npm_install_exit_code -ne 0 ]; then
  echo "❌ 错误: 'npm install' 失败，退出码: $npm_install_exit_code"
  echo "npm install 的输出/错误信息如下:"
  echo "-------------------- NPM INSTALL OUTPUT START --------------------"
  echo "$npm_install_output_and_error"
  echo "-------------------- NPM INSTALL OUTPUT END ----------------------"
  # 您之前的日志显示会尝试单独安装 axios，如果需要此逻辑，请在此处添加。
  # 但通常，如果 npm install 整体失败，意味着项目的依赖环境有问题。
  exit 1 # 主要的 npm install 失败，则认为安装失败
fi
echo "✅ 依赖安装成功。"
if [ -n "$npm_install_output_and_error" ]; then # 即使成功，npm install也可能有大量输出
    echo "npm install 的输出:"
    echo "$npm_install_output_and_error"
fi
echo "--------------------------------------------------"

# （可选）执行构建命令，如果项目需要构建
# echo "ℹ️ 准备执行构建命令 (例如 npm run build)..."
# if [ -f "package.json" ] && grep -q '"build":' package.json; then # 简单检查是否有build脚本
#   npm_build_output_and_error=$(npm run build 2>&1)
#   npm_build_exit_code=$?
#   if [ $npm_build_exit_code -ne 0 ]; then
#     echo "❌ 错误: 项目构建失败 (npm run build)，退出码: $npm_build_exit_code"
#     echo "npm run build 的输出/错误信息如下:"
#     echo "$npm_build_output_and_error"
#     exit 1
#   fi
#   echo "✅ 项目构建成功。"
#   if [ -n "$npm_build_output_and_error" ]; then
#     echo "npm run build 的输出:"
#     echo "$npm_build_output_and_error"
#   fi
# else
#   echo "ℹ️ package.json 中未找到 build 脚本，跳过构建步骤。"
# fi
# echo "--------------------------------------------------"

# 部署项目到最终目录
echo "ℹ️ 准备部署项目到 '$FINAL_PROJECT_DIR' ..."
# 创建最终项目目录的父目录（如果不存在），-p 会创建所有必要的父目录
mkdir -p "$FINAL_PROJECT_DIR" # rsync 会创建 FINAL_PROJECT_DIR 本身，但其父目录需要存在

# 使用 rsync 同步文件
# -a: 归档模式，递归、保留符号链接、权限、时间戳、所有者和组（如果可能）
# --delete: 删除目标目录中存在但源目录中不存在的文件，使目标与源完全一致
# --exclude='.git': 排除 .git 目录（通常不需要部署 .git 目录）
# ./ (源目录末尾的斜杠很重要，表示复制目录内容而非目录本身)
echo "ℹ️ 同步文件从 '$(pwd)' 到 '$FINAL_PROJECT_DIR' 使用 rsync..."
rsync_output_and_error=$(rsync -a --delete --exclude='.git' ./ "$FINAL_PROJECT_DIR/" 2>&1)
rsync_exit_code=$?

if [ $rsync_exit_code -ne 0 ]; then
    echo "❌ 错误: 使用 rsync 同步文件失败，退出码: $rsync_exit_code"
    echo "rsync 的输出/错误信息如下:"
    echo "$rsync_output_and_error"
    exit 1
fi
echo "✅ 项目成功部署到 '$FINAL_PROJECT_DIR'。"
if [ -n "$rsync_output_and_error" ]; then
    echo "rsync 的输出:"
    echo "$rsync_output_and_error"
fi
echo "--------------------------------------------------"
echo "🎉 安装和部署完成！"

# trap 会在脚本退出时自动执行 cleanup 函数
exit 0
