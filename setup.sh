#!/bin/bash
set -e

echo "🚀 开始安装项目..."

# GitHub 仓库信息
GITHUB_USER="Limkon"
REPO_NAME="liuyanshi"
BRANCH="master"

echo "👤 GitHub 用户名: $GITHUB_USER"
echo "📦 仓库名: $REPO_NAME"
echo "🌿 分支: $BRANCH"

# 下载链接
TAR_URL="https://github.com/$GITHUB_USER/$REPO_NAME/archive/refs/heads/$BRANCH.tar.gz"
echo "📦 下载链接: $TAR_URL"

# 验证下载链接是否可访问
if ! curl -fsSL --head "$TAR_URL" >/dev/null 2>&1; then
    echo "❌ 错误：无法访问 $TAR_URL，可能是网络问题"
    exit 1
fi

# 获取当前目录
PROJECT_DIR=$(pwd)
echo "📁 项目目录: $PROJECT_DIR"

# 创建临时目录并解压项目
TEMP_DIR=$(mktemp -d)
echo "📂 临时目录: $TEMP_DIR"
if ! curl -fsSL "$TAR_URL" | tar -xz -C "$TEMP_DIR" --strip-components=1; then
    echo "❌ 错误：下载或解压 $TAR_URL 失败"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 删除 .github 目录（如果存在）
rm -rf "$TEMP_DIR/.github"

# 复制文件到项目目录，排除 . 开头文件
shopt -s extglob dotglob
cd "$TEMP_DIR"
if ! cp -rf !(.*) "$PROJECT_DIR"; then
    echo "❌ 错误：复制文件到 $PROJECT_DIR 失败"
    rm -rf "$TEMP_DIR"
    shopt -u extglob dotglob
    exit 1
fi
shopt -u extglob dotglob
rm -rf "$TEMP_DIR"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js（通过 nvm）..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | NVM_DIR="$PROJECT_DIR/.nvm" bash
    export NVM_DIR="$PROJECT_DIR/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 18
else
    echo "✅ Node.js 已安装：$(node -v)"
fi

# 加载 nvm 环境
export NVM_DIR="$PROJECT_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🧩 使用 Node: $(which node)"
echo "🧩 使用 npm: $(which npm)"

# 创建最小 package.json（如果不存在）
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "{}" > "$PROJECT_DIR/package.json"
fi

# 安装依赖
echo "📦 安装依赖..."
npm install axios || echo "⚠️ 安装 axios 失败"
npm install express || echo "⚠️ 安装 express 失败"
npm install ws || echo "⚠️ 安装 ws 失败"

# 创建开机启动项
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/tcr-startup.desktop" <<EOF
[Desktop Entry]
Type=Application
Exec=bash -c "cd $PROJECT_DIR && source $PROJECT_DIR/.nvm/nvm.sh && node server.js"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Chatroom Server
Comment=Start Server automatically
EOF

echo "✅ 项目安装完成！系统重启后将自动启动服务器。"
