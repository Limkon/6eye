#!/bin/bash
set -x # 开启执行跟踪
set -e # 脚本出错时立即退出 (这个应该已经有了)
set -o pipefail # 管道中的任何命令失败都视为失败 (这个应该已经有了)

# --- 配置开始 ---
GH_USER="Limkon"                                     # 从日志中获取的 GitHub 用户名
REPO_NAME="liuyanshi"                                # 从日志中获取的仓库名
BRANCH="master"                                      # 从日志中获取的分支
PROJECT_PARENT_DIR="/home/wwo"                       # 从日志中获取的 "项目目录"，假设最终项目放在这里的子目录中
FINAL_PROJECT_DIR="${PROJECT_PARENT_DIR}/${REPO_NAME}" # 最终部署的项目完整路径
BASE_TMP_DIR="/home/wwo/admin/tmp"                   # 从日志中获取的临时目录的父目录
# --- 配置结束 ---

# 脚本出错时立即退出
set -e
# 管道中的任何命令失败都视为失败
set -o pipefail

# 创建一个唯一的临时工作目录
# 确保 BASE_TMP_DIR 存在且可写
if [ ! -d "$BASE_TMP_DIR" ]; then
  echo "错误：基础临时目录 $BASE_TMP_DIR 不存在。请创建它或修改脚本中的 BASE_TMP_DIR 变量。"
  exit 1
fi
# mktemp 会在 BASE_TMP_DIR 下创建一个名为 tmp.XXXXXXXXXX 的唯一目录
WORK_TMP_DIR=$(mktemp -d -p "$BASE_TMP_DIR" "tmp.XXXXXXXXXX")

# 定义清理函数
cleanup() {
  echo "ℹ️ 清理临时工作目录: $WORK_TMP_DIR"
  rm -rf "$WORK_TMP_DIR"
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
ARCHIVE_NAME="${BRANCH}.tar.gz"

echo "ℹ️ 下载项目源码从 $DOWNLOAD_URL 到 $WORK_TMP_DIR/$ARCHIVE_NAME ..."
# 使用 curl 下载， -L 跟随重定向，-s 静默模式，-S 显示错误，-o 输出到文件
if ! curl -sSL -o "$WORK_TMP_DIR/$ARCHIVE_NAME" "$DOWNLOAD_URL"; then
  echo "❌ 错误: 下载项目源码失败。"
  exit 1
fi
echo "✅ 下载完成。"
echo "--------------------------------------------------"

# 解压项目
echo "ℹ️ 解压 $ARCHIVE_NAME 到 $WORK_TMP_DIR ..."
# tar -xzf 解压 .tar.gz 文件，-C 指定解压目录，--strip-components=1 移除压缩包内的第一层目录
# GitHub 下载的压缩包通常会有一个顶层目录，如 REPO_NAME-BRANCH
# 我们先解压，然后找出这个目录名
tar -xzf "$WORK_TMP_DIR/$ARCHIVE_NAME" -C "$WORK_TMP_DIR"
EXTRACTED_DIR_NAME=$(tar -tzf "$WORK_TMP_DIR/$ARCHIVE_NAME" | head -1 | cut -f1 -d"/") # 获取压缩包内顶层目录名
PROJECT_SOURCE_DIR="$WORK_TMP_DIR/$EXTRACTED_DIR_NAME"

if [ ! -d "$PROJECT_SOURCE_DIR" ]; then
    echo "❌ 错误: 未找到解压后的项目源文件目录 $PROJECT_SOURCE_DIR。"
    exit 1
fi
echo "✅ 解压完成。项目源文件位于: $PROJECT_SOURCE_DIR"
echo "--------------------------------------------------"

# 进入项目源文件目录并安装依赖
echo "ℹ️ 进入目录 $PROJECT_SOURCE_DIR 并安装依赖..."
cd "$PROJECT_SOURCE_DIR" || { echo "❌ 错误: 无法进入目录 $PROJECT_SOURCE_DIR"; exit 1; }

echo "ℹ️ 当前工作目录: $(pwd)" # 确认我们已在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 在 $PROJECT_SOURCE_DIR 中未找到 package.json 文件。"
    echo "解压后的目录结构可能不符合预期，请检查 EXTRACTED_DIR_NAME 的获取逻辑。"
    exit 1
fi

echo "📦 执行 npm install..."
if ! npm install; then
  echo "⚠️ npm install 失败。"
  echo "ℹ️ 您之前的日志显示会尝试单独安装 axios，如果需要此逻辑，请在此处添加。"
  # 例如：
  # echo "📦 尝试单独安装 axios..."
  # if ! npm install axios; then
  #   echo "❌ 错误: 单独安装 axios 也失败了。"
  #   exit 1
  # fi
  # 如果 npm install 整体失败是不可接受的，则应该让脚本在这里退出
  exit 1 # 主要的 npm install 失败，则认为安装失败
fi
echo "✅ 依赖安装成功。"
echo "--------------------------------------------------"

# （可选）执行构建命令，如果项目需要构建
# echo "ℹ️ 执行构建命令 (例如 npm run build)..."
# if [ -f "package.json" ] && grep -q '"build":' package.json; then
#   if ! npm run build; then
#     echo "❌ 错误: 项目构建失败 (npm run build)。"
#     exit 1
#   fi
#   echo "✅ 项目构建成功。"
# else
#   echo "ℹ️ package.json 中未找到 build 脚本，跳过构建步骤。"
# fi
# echo "--------------------------------------------------"

# 部署项目到最终目录
echo "ℹ️ 部署项目到 $FINAL_PROJECT_DIR ..."
# 创建最终项目目录的父目录（如果不存在）
mkdir -p "$(dirname "$FINAL_PROJECT_DIR")"

# 清理旧的最终项目目录（如果存在且需要完全替换）
if [ -d "$FINAL_PROJECT_DIR" ]; then
  echo "ℹ️ 发现已存在的目录 $FINAL_PROJECT_DIR，将先删除它..."
  rm -rf "$FINAL_PROJECT_DIR"
fi

# 将构建好的项目（或整个源文件目录，取决于您的需求）复制/移动到最终目录
# 如果有构建步骤，通常是复制构建产物 (例如 dist 目录)
# 此处示例为复制整个当前目录（已是项目源文件目录）的内容
echo "ℹ️ 将 $PROJECT_SOURCE_DIR 的内容复制到 $FINAL_PROJECT_DIR ..."
# cp -R . "$FINAL_PROJECT_DIR" # 这种方式会把隐藏文件也复制过去
# 或者，如果想把整个 PROJECT_SOURCE_DIR 目录本身变成 FINAL_PROJECT_DIR:
mv "$PROJECT_SOURCE_DIR" "$FINAL_PROJECT_DIR" # 将解压后的目录直接重命名/移动为最终目录

# 如果采用 mv 的方式，需要调整 trap 中的清理逻辑，因为 WORK_TMP_DIR 下的 PROJECT_SOURCE_DIR 不再存在
# 或者，更常见的做法是复制：
# mkdir -p "$FINAL_PROJECT_DIR"
# cp -a ./* "$FINAL_PROJECT_DIR"/ # 复制当前目录所有内容（不含隐藏文件）到目标，如果需要隐藏文件用 shopt -s dotglob; cp -a ./* ...; shopt -u dotglob
# 为简单起见，我们假设将整个解压后的文件夹内容（包括它自己）移动过去，如果 FINAL_PROJECT_DIR 应该就是那个文件夹的话。
# 如果 FINAL_PROJECT_DIR 只是一个容器，那么应该:
# mkdir -p "$FINAL_PROJECT_DIR"
# rsync -a --delete ./ "$FINAL_PROJECT_DIR/" # 更推荐用rsync同步
# 采用 rsync 的方式:
mkdir -p "$FINAL_PROJECT_DIR"
echo "同步文件到 $FINAL_PROJECT_DIR 使用 rsync..."
if ! rsync -a --delete --exclude='.git' ./ "$FINAL_PROJECT_DIR/"; then # --exclude='.git' 排除 .git 目录
    echo "❌ 错误: 使用 rsync 同步文件失败。"
    exit 1
fi


echo "✅ 项目成功部署到 $FINAL_PROJECT_DIR。"
echo "--------------------------------------------------"
echo "🎉 安装和部署完成！"

# trap 会在脚本退出时自动执行 cleanup 函数，所以不需要在这里显式调用
exit 0
