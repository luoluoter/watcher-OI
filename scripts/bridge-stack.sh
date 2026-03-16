#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
RUNTIME_DIR="${RUNTIME_DIR:-$ROOT_DIR/.runtime}"
TOOLS_DIR="${TOOLS_DIR:-$ROOT_DIR/.tools}"
FRP_INSTALL_DIR="${FRP_INSTALL_DIR:-$TOOLS_DIR/frp}"

NODE_BIN="${NODE_BIN:-node}"
FRPC_BIN="${FRPC_BIN:-frpc}"
FRPC_CONFIG="${FRPC_CONFIG:-$ROOT_DIR/frpc.toml}"
FRP_VERSION="${FRP_VERSION:-latest}"

BRIDGE_PORT="${BRIDGE_PORT:-8000}"
BRIDGE_ENTRY="${BRIDGE_ENTRY:-main.js}"
BRIDGE_LOG="${BRIDGE_LOG:-$RUNTIME_DIR/bridge.log}"
FRPC_LOG="${FRPC_LOG:-$RUNTIME_DIR/frpc.log}"
BRIDGE_PID_FILE="${BRIDGE_PID_FILE:-$RUNTIME_DIR/bridge.pid}"
FRPC_PID_FILE="${FRPC_PID_FILE:-$RUNTIME_DIR/frpc.pid}"

START_WAIT_SECONDS="${START_WAIT_SECONDS:-10}"
STOP_WAIT_SECONDS="${STOP_WAIT_SECONDS:-10}"

log() {
  printf '[watcher-stack] %s\n' "$*"
}

die() {
  log "$*"
  exit 1
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

ensure_tools_dir() {
  mkdir -p "$FRP_INSTALL_DIR"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

pid_is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid_file() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1

  local pid
  pid="$(tr -d '[:space:]' < "$pid_file")"
  [[ -n "$pid" ]] || return 1
  printf '%s\n' "$pid"
}

track_existing_pid() {
  local pid_file="$1"
  local pid="$2"
  printf '%s\n' "$pid" > "$pid_file"
}

tracked_pid() {
  local pid_file="$1"
  local pid
  pid="$(read_pid_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && pid_is_running "$pid"; then
    printf '%s\n' "$pid"
    return 0
  fi

  rm -f "$pid_file"
  return 1
}

bridge_port_pid() {
  lsof -tiTCP:"$BRIDGE_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

detect_bridge_pid() {
  local pid
  pid="$(tracked_pid "$BRIDGE_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid"
    return 0
  fi

  pid="$(bridge_port_pid)"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$cmd" == *"node"* && "$cmd" == *"$BRIDGE_ENTRY"* ]]; then
    track_existing_pid "$BRIDGE_PID_FILE" "$pid"
    printf '%s\n' "$pid"
    return 0
  fi

  return 1
}

detect_frpc_pid() {
  local pid
  pid="$(tracked_pid "$FRPC_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid"
    return 0
  fi

  while IFS= read -r line; do
    local scanned_pid scanned_cmd
    line="${line#"${line%%[![:space:]]*}"}"
    scanned_pid="${line%% *}"
    scanned_cmd="${line#* }"
    if [[ "$scanned_cmd" == *"frpc"* && "$scanned_cmd" == *"$FRPC_CONFIG"* ]]; then
      track_existing_pid "$FRPC_PID_FILE" "$scanned_pid"
      printf '%s\n' "$scanned_pid"
      return 0
    fi
  done < <(ps ax -o pid= -o command=)

  return 1
}

wait_for_pid() {
  local pid="$1"
  local timeout="$2"
  local elapsed=0

  while (( elapsed < timeout * 10 )); do
    if pid_is_running "$pid"; then
      return 0
    fi
    sleep 0.1
    ((elapsed += 1))
  done

  return 1
}

wait_for_bridge_ready() {
  local pid="$1"
  local timeout="$2"
  local elapsed=0

  while (( elapsed < timeout * 10 )); do
    if ! pid_is_running "$pid"; then
      return 1
    fi

    if [[ -n "$(bridge_port_pid)" ]]; then
      return 0
    fi

    sleep 0.1
    ((elapsed += 1))
  done

  return 1
}

require_dependencies() {
  command_exists "$NODE_BIN" || die "Missing node executable: $NODE_BIN"
  command_exists lsof || die "Missing lsof executable"
  [[ -f "$ROOT_DIR/$BRIDGE_ENTRY" ]] || die "Missing bridge entry: $ROOT_DIR/$BRIDGE_ENTRY"
}

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *)
      die "Unsupported operating system for auto-install: $os"
      ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      die "Unsupported CPU architecture for auto-install: $arch"
      ;;
  esac

  printf '%s_%s\n' "$os" "$arch"
}

resolve_frp_version() {
  if [[ "$FRP_VERSION" != "latest" ]]; then
    printf '%s\n' "${FRP_VERSION#v}"
    return 0
  fi

  command_exists curl || die "Missing curl executable for frpc auto-install"

  local release_json version
  release_json="$(curl -fsSL https://api.github.com/repos/fatedier/frp/releases/latest)"
  version="$(printf '%s\n' "$release_json" | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p' | head -n 1)"
  [[ -n "$version" ]] || die "Failed to resolve latest frp version from GitHub release API"
  printf '%s\n' "$version"
}

installed_frpc_path() {
  local version="$1"
  local platform="$2"
  printf '%s/frp_%s_%s/frpc\n' "$FRP_INSTALL_DIR" "$version" "$platform"
}

download_and_extract_frpc() {
  local version="$1"
  local platform="$2"
  local archive_name="frp_${version}_${platform}.tar.gz"
  local url="https://github.com/fatedier/frp/releases/download/v${version}/${archive_name}"
  local archive_path="$FRP_INSTALL_DIR/$archive_name"
  local extract_dir="$FRP_INSTALL_DIR"

  command_exists curl || die "Missing curl executable for frpc auto-install"
  command_exists tar || die "Missing tar executable for frpc auto-install"

  log "downloading frpc v${version} for ${platform}"
  rm -f "$archive_path"
  curl -fL "$url" -o "$archive_path"
  tar -xzf "$archive_path" -C "$extract_dir"
  rm -f "$archive_path"
}

ensure_frpc_binary() {
  if command_exists "$FRPC_BIN"; then
    return 0
  fi

  if [[ "$FRPC_BIN" != "frpc" ]]; then
    die "Missing frpc executable: $FRPC_BIN"
  fi

  ensure_tools_dir

  local platform version local_frpc
  platform="$(detect_platform)"
  version="$(resolve_frp_version)"
  local_frpc="$(installed_frpc_path "$version" "$platform")"

  if [[ ! -x "$local_frpc" ]]; then
    download_and_extract_frpc "$version" "$platform"
  fi

  [[ -x "$local_frpc" ]] || die "frpc install failed: $local_frpc not found"
  FRPC_BIN="$local_frpc"
  log "using auto-installed frpc: $FRPC_BIN"
}

ensure_frpc_config() {
  if [[ -f "$FRPC_CONFIG" ]]; then
    return 0
  fi

  if [[ -f "$ROOT_DIR/frpc.toml.example" ]]; then
    cp "$ROOT_DIR/frpc.toml.example" "$FRPC_CONFIG"
    die "Created $FRPC_CONFIG from template. Fill in frps address/token/remotePort, then rerun."
  fi

  die "Missing frpc config: $FRPC_CONFIG"
}

start_bridge() {
  local pid
  pid="$(detect_bridge_pid 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    log "bridge already running (pid $pid, port $BRIDGE_PORT)"
    return 0
  fi

  local occupied_pid
  occupied_pid="$(bridge_port_pid)"
  if [[ -n "$occupied_pid" ]]; then
    local occupied_cmd
    occupied_cmd="$(ps -p "$occupied_pid" -o command= 2>/dev/null || true)"
    die "Port $BRIDGE_PORT is already in use by pid $occupied_pid: $occupied_cmd"
  fi

  : > "$BRIDGE_LOG"
  (
    cd "$ROOT_DIR"
    WATCHER_PORT="$BRIDGE_PORT" nohup "$NODE_BIN" "$BRIDGE_ENTRY" >> "$BRIDGE_LOG" 2>&1 &
    echo $! > "$BRIDGE_PID_FILE"
  )

  pid="$(read_pid_file "$BRIDGE_PID_FILE")"
  if wait_for_bridge_ready "$pid" "$START_WAIT_SECONDS"; then
    log "bridge started (pid $pid)"
    return 0
  fi

  rm -f "$BRIDGE_PID_FILE"
  tail -n 40 "$BRIDGE_LOG" || true
  die "bridge failed to become ready"
}

start_frpc() {
  local pid
  pid="$(detect_frpc_pid 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    log "frpc already running (pid $pid)"
    return 0
  fi

  : > "$FRPC_LOG"
  (
    cd "$ROOT_DIR"
    nohup "$FRPC_BIN" -c "$FRPC_CONFIG" >> "$FRPC_LOG" 2>&1 &
    echo $! > "$FRPC_PID_FILE"
  )

  pid="$(read_pid_file "$FRPC_PID_FILE")"
  if wait_for_pid "$pid" "$START_WAIT_SECONDS"; then
    log "frpc started (pid $pid)"
    return 0
  fi

  rm -f "$FRPC_PID_FILE"
  tail -n 40 "$FRPC_LOG" || true
  die "frpc failed to stay alive"
}

stop_one() {
  local name="$1"
  local pid_file="$2"
  local pid="$3"

  if [[ -z "$pid" ]]; then
    log "$name is not running"
    rm -f "$pid_file"
    return 0
  fi

  kill "$pid" 2>/dev/null || true

  local elapsed=0
  while (( elapsed < STOP_WAIT_SECONDS * 10 )); do
    if ! pid_is_running "$pid"; then
      rm -f "$pid_file"
      log "$name stopped"
      return 0
    fi
    sleep 0.1
    ((elapsed += 1))
  done

  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pid_file"
  log "$name force-stopped"
}

status_one() {
  local name="$1"
  local pid="$2"
  local extra="$3"
  if [[ -n "$pid" ]]; then
    log "$name: running (pid $pid${extra})"
  else
    log "$name: stopped${extra}"
  fi
}

show_logs() {
  ensure_runtime_dir
  local lines="${1:-50}"
  log "bridge log: $BRIDGE_LOG"
  tail -n "$lines" "$BRIDGE_LOG" 2>/dev/null || true
  log "frpc log: $FRPC_LOG"
  tail -n "$lines" "$FRPC_LOG" 2>/dev/null || true
}

start_all() {
  ensure_runtime_dir
  ensure_frpc_config
  require_dependencies
  ensure_frpc_binary
  start_bridge
  start_frpc
}

stop_all() {
  ensure_runtime_dir
  stop_one "frpc" "$FRPC_PID_FILE" "$(detect_frpc_pid 2>/dev/null || true)"
  stop_one "bridge" "$BRIDGE_PID_FILE" "$(detect_bridge_pid 2>/dev/null || true)"
}

status_all() {
  ensure_runtime_dir
  status_one "bridge" "$(detect_bridge_pid 2>/dev/null || true)" ", port $BRIDGE_PORT"
  status_one "frpc" "$(detect_frpc_pid 2>/dev/null || true)" ", config $FRPC_CONFIG"
}

usage() {
  cat <<'EOF'
Usage:
  scripts/bridge-stack.sh start
  scripts/bridge-stack.sh stop
  scripts/bridge-stack.sh restart
  scripts/bridge-stack.sh status
  scripts/bridge-stack.sh logs [lines]

Environment overrides:
  FRPC_BIN      default: frpc
  FRPC_CONFIG   default: ./frpc.toml
  FRP_VERSION   default: latest
  NODE_BIN      default: node
  BRIDGE_PORT   default: 8000
  RUNTIME_DIR   default: ./.runtime
EOF
}

main() {
  local command="${1:-start}"
  case "$command" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      start_all
      ;;
    status)
      status_all
      ;;
    logs)
      show_logs "${2:-50}"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
