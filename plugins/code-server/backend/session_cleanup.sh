#!/bin/sh
if [ "$PAM_SERVICE" = "cockpit" ] && [ "$PAM_TYPE" = "close_session" ] && [ -n "$PAM_USER" ]; then
    /usr/libexec/cockpit-code-server/code_server_helper.py session_cleanup --user "$PAM_USER" >/dev/null 2>&1 || true
fi
exit 0
