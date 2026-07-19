#!/usr/bin/env bash
# Packages the plugin into ai-chat-widget.zip for clients to upload via
# wp-admin → Plugins → Add New → Upload Plugin. The zip must contain the
# `ai-chat-widget/` folder at its root (WordPress installs a plugin folder,
# not loose files).
set -euo pipefail
cd "$(dirname "$0")"
rm -f ai-chat-widget.zip
zip -r ai-chat-widget.zip ai-chat-widget \
  -x '*.DS_Store' -x '__MACOSX/*'
echo "Built ai-chat-widget.zip"
