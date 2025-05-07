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
cd "$PROJECT_DIR" # 确保后续操作在项目目录中

# --- 修改 Node.js 和 nvm 安装逻辑 ---
echo "🔧 配置项目独立的 Node.js v18 环境..."
export NVM_DIR="$PROJECT_DIR/.nvm" # 定义 NVM 的安装路径为项目本地

# 1. 确保 nvm 安装脚本存在或被下载
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "📦 nvm.sh 未在 $NVM_DIR 中找到，开始安装 nvm..."
    # 从 nvm 的 GitHub 仓库下载 install.sh 并执行，指定 NVM_DIR
    # 注意：原始脚本的 curl | bash 方法在 set -e 下如果 curl 失败（如网络问题）可能不会按预期退出
    # 更安全的方式是先下载再执行，或者确保 curl 失败时脚本能正确处理
    mkdir -p "$NVM_DIR" # 确保 NVM_DIR 存在
    if curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | NVM_INSTALL_SCRIPT_PATH="$NVM_DIR/install_nvm.sh" bash -s -- --no-use; then
        echo "✅ nvm 安装脚本执行完毕。"
        # NVM_DIR 环境变量在 install.sh 脚本执行时应该已经被考虑
        # install.sh 脚本会将 nvm 相关文件安装到 NVM_DIR
    else
        echo "❌ nvm 安装脚本下载或执行失败。"
        exit 1
    fi
else
    echo "✅ nvm.sh 已存在于 $NVM_DIR。"
fi

# 2. 加载 nvm
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "📂 加载 nvm 从 $NVM_DIR/nvm.sh..."
    \. "$NVM_DIR/nvm.sh" # 点命令 (source) 加载 nvm 函数到当前 shell
else
    echo "❌ 错误: $NVM_DIR/nvm.sh 未找到。nvm 可能未正确安装。"
    exit 1
fi

# 3. 安装并使用 Node.js v18
NODE_VERSION="18"
echo "📦 正在通过 nvm 安装/使用 Node.js v$NODE_VERSION..."
if nvm install "$NODE_VERSION"; then # nvm install 会在安装后自动 use 该版本
    nvm use "$NODE_VERSION" # 再次确认使用，确保当前 shell session 生效
    echo "✅ Node.js v$NODE_VERSION 已激活。"
else
    echo "❌ 错误: nvm未能安装 Node.js v$NODE_VERSION。"
    exit 1
fi
# --- Node.js 和 nvm 安装逻辑结束 ---

echo "🧩 当前使用 Node: $(which node) (版本: $(node -v))"
echo "🧩 当前使用 npm: $(which npm) (版本: $(npm -v))"

# 创建最小 package.json（如果不存在）
# 注意：如果仓库本身有 package.json，这一步会覆盖它，除非这里的判断逻辑修改
# 更好的做法是：如果仓库有 package.json，则使用它；否则，如果需要，才创建。
# 但原脚本逻辑是：如果复制后不存在 package.json，则创建一个空的。
# 考虑到 cp !(.*) 的行为，如果仓库根目录有 package.json，它会被复制过来。
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "📝 $PROJECT_DIR/package.json 未找到，创建空的 package.json。"
    echo "{}" > "$PROJECT_DIR/package.json"
else
    echo "👍 $PROJECT_DIR/package.json 已存在。"
fi

# 安装依赖
echo "📦 安装依赖..."
# 使用 --save 参数可以将依赖项添加到 package.json 中，这是一个好习惯
# 如果仓库中已有的 package.json 包含了这些依赖，单独执行 npm install 即可
# 但这里按原脚本逻辑逐个安装
if npm install axios express ws cookie-parser body-parser; then
    echo "✅ 依赖安装成功。"
else
    echo "❌ 依赖安装过程中发生错误。"
    # 由于 set -e，npm install 失败时脚本通常会直接退出。
    # 如果想让脚本继续（例如记录错误但不退出），需要移除 set -e 或修改错误处理。
    # 原脚本的 || echo "..." 会阻止 set -e 因 npm install 失败而退出。
    # 为了更清晰，这里用一个 if 语句。
    exit 1 # 如果依赖安装失败，则退出
fi

# 创建开机启动项
mkdir -p "$HOME/.config/autostart"
AUTOSTART_FILE="$HOME/.config/autostart/tcr-startup.desktop"
echo "🚀 创建开机启动项: $AUTOSTART_FILE"
cat > "$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Exec=bash -c "cd $PROJECT_DIR && source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && node server.js"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Chatroom Server (liuyanshi)
Comment=Start liuyanshi Server automatically using project nvm
EOF
chmod +x "$AUTOSTART_FILE" # 确保 desktop 文件可执行（某些桌面环境可能需要）

echo "✅ 项目安装完成！系统重启后将自动启动服务器 (liuyanshi)。"
echo "   请检查 $AUTOSTART_FILE 的内容。"
echo "   手动启动服务器: cd $PROJECT_DIR && source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && node server.js"
