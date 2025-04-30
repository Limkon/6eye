#!/bin/bash
set -e

echo "开始安装项目..."

# 获取当前目录
PROJECT_DIR=$(pwd)

# 拉取当前 GitHub 项目的 master 分支为压缩包
echo "拉取项目到当前目录（覆盖同名文件）..."
TEMP_DIR=$(mktemp -d)

# 获取当前 Git 项目远程地址
REPO_URL=$(git config --get remote.origin.url)

# 提取 GitHub 用户名和仓库名
if [[ "$REPO_URL" =~ github\.com[:/](.+)/(.+)\.git ]]; then
    USER="${BASH_REMATCH[1]}"
    REPO="${BASH_REMATCH[2]}"
else
    echo "无法识别的 GitHub 地址：$REPO_URL"
    exit 1
fi

# 拼接 master 分支 tar.gz 下载链接
TAR_URL="https://github.com/$USER/$REPO/archive/refs/heads/master.tar.gz"

echo "从仓库下载：$TAR_URL"
curl -L "$TAR_URL" | tar -xz -C "$TEMP_DIR" --strip-components=1

# 删除 .github 目录
rm -rf "$TEMP_DIR/.github"

# 强制覆盖本地文件
cp -rf "$TEMP_DIR"/. "$PROJECT_DIR"
rm -rf "$TEMP_DIR"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "Node.js 未检测到，开始安装 nvm 和 Node.js..."
    # 安装 nvm 到当前目录
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | NVM_DIR="$PROJECT_DIR/.nvm" bash
    # 加载 nvm
    export NVM_DIR="$PROJECT_DIR/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    # 安装 Node.js 18
    nvm install 18
else
    echo "Node.js 已安装，版本：$(node -v)"
fi

# 确保 Node 环境可用
export NVM_DIR="$PROJECT_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 安装项目依赖
echo "安装 npm 依赖..."
npm install

# 创建 autostart 文件夹
mkdir -p "$HOME/.config/autostart"

# 写开机启动的 .desktop 文件
echo "配置开机启动..."
cat > "$HOME/.config/autostart/tcr-startup.desktop" <<EOF
[Desktop Entry]
Type=Application
Exec=bash -c "cd $PROJECT_DIR && source $PROJECT_DIR/.nvm/nvm.sh && node server.js"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=TCR Chatroom Server
Comment=Start TCR Server automatically
EOF

echo "安装完成！下次开机登录后会自动启动服务器！"
echo "项目目录: $PROJECT_DIR"
