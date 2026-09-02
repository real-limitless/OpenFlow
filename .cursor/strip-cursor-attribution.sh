#!/usr/bin/env bash
# Per-boot Cloud Agent hygiene: keep Cursor attribution off commits.
# Invoked from .cursor/environment.json `start`.
set -euo pipefail

HOOKS_ROOT="${HOOKS_ROOT:-/home/ubuntu/.cursor/agent-hooks}"
REAPER_PIDFILE="${REAPER_PIDFILE:-/tmp/openflow-no-cursor-attribution-reaper.pid}"
REAPER_LOG="${REAPER_LOG:-/tmp/openflow-no-cursor-attribution-reaper.log}"
STRIP_HOOK_NAME="commit-msg.cursor.zz-strip-attribution"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STRIP_SRC="${HERE}/hooks/commit-msg-strip-cursor-attribution"

purge_coauthor_files() {
  if [ ! -d "${HOOKS_ROOT}" ]; then
    return 0
  fi
  find "${HOOKS_ROOT}" \( \
    -name 'commit-msg.cursor.co-author' -o \
    -name '*co-author*' \
  \) -type f -delete 2>/dev/null || true
}

install_strip_hooks() {
  if [ ! -f "${STRIP_SRC}" ]; then
    echo "strip-cursor-attribution: missing ${STRIP_SRC}" >&2
    return 1
  fi
  if [ ! -d "${HOOKS_ROOT}" ]; then
    return 0
  fi
  local dir
  for dir in "${HOOKS_ROOT}"/*/; do
    [ -d "${dir}" ] || continue
    # Skip installing into a directory that is not a hook set.
    [ -e "${dir}/.dispatcher" ] || [ -e "${dir}/commit-msg" ] || continue
    install -m 0755 "${STRIP_SRC}" "${dir}${STRIP_HOOK_NAME}"
  done
}

override_cursor_git_identity() {
  local name email
  name="$(git config --global --get user.name || true)"
  email="$(git config --global --get user.email || true)"
  if [ "${email}" = "cursoragent@cursor.com" ] || [ "${name}" = "Cursor Agent" ]; then
    git config --global user.name "Chen Chiu"
    git config --global user.email "chenchiu9@gmail.com"
  fi
}

prove_hooks_gone() {
  local leftover
  leftover="$(find "${HOOKS_ROOT}" \( \
    -name 'commit-msg.cursor.co-author' -o \
    -name '*co-author*' \
  \) -type f 2>/dev/null || true)"
  if [ -n "${leftover}" ]; then
    echo "strip-cursor-attribution: FAIL — co-author hook files still present:" >&2
    printf '%s\n' "${leftover}" >&2
    return 1
  fi
  echo "strip-cursor-attribution: OK — no commit-msg.cursor.co-author or *co-author* files under ${HOOKS_ROOT}"
}

start_reaper() {
  if [ -f "${REAPER_PIDFILE}" ]; then
    local old
    old="$(cat "${REAPER_PIDFILE}" 2>/dev/null || true)"
    if [ -n "${old}" ] && kill -0 "${old}" 2>/dev/null; then
      echo "strip-cursor-attribution: reaper already running (pid ${old})"
      return 0
    fi
    rm -f "${REAPER_PIDFILE}"
  fi

  # Cursor may rewrite commit-msg.cursor.co-author at commit time.
  # Keep a small poller so the file does not remain on disk.
  nohup bash -c "
    set -eu
    HOOKS_ROOT='${HOOKS_ROOT}'
    STRIP_SRC='${STRIP_SRC}'
    STRIP_HOOK_NAME='${STRIP_HOOK_NAME}'
    while true; do
      if [ -d \"\${HOOKS_ROOT}\" ]; then
        find \"\${HOOKS_ROOT}\" \\( -name 'commit-msg.cursor.co-author' -o -name '*co-author*' \\) -type f -delete 2>/dev/null || true
        for dir in \"\${HOOKS_ROOT}\"/*/; do
          [ -d \"\${dir}\" ] || continue
          [ -e \"\${dir}/.dispatcher\" ] || [ -e \"\${dir}/commit-msg\" ] || continue
          if [ -f \"\${STRIP_SRC}\" ]; then
            install -m 0755 \"\${STRIP_SRC}\" \"\${dir}\${STRIP_HOOK_NAME}\"
          fi
        done
      fi
      sleep 2
    done
  " >"${REAPER_LOG}" 2>&1 &
  echo $! >"${REAPER_PIDFILE}"
  disown || true
  echo "strip-cursor-attribution: reaper started (pid $(cat "${REAPER_PIDFILE}"))"
}

purge_coauthor_files
install_strip_hooks
override_cursor_git_identity
start_reaper
purge_coauthor_files
prove_hooks_gone
