#!/usr/bin/env python3
import argparse
import json
import os
import sys
from typing import List, Dict, Any

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

try:
    from .config_manager import (
        CodeServerConfig,
        get_user_config_path,
        parse_code_server_config,
        write_code_server_config,
    )
    from .service_manager import (
        get_binary_info,
        get_service_status,
        manage_service,
        install_code_server,
    )
except ImportError:
    from config_manager import (
        CodeServerConfig,
        get_user_config_path,
        parse_code_server_config,
        write_code_server_config,
    )
    from service_manager import (
        get_binary_info,
        get_service_status,
        manage_service,
        install_code_server,
    )


def handle_command(args: List[str]) -> Dict[str, Any]:
    parser = argparse.ArgumentParser(description="Cockpit Code Server Helper")
    subparsers = parser.add_subparsers(dest="action")

    # Status
    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--user", default=None)

    # Service
    service_parser = subparsers.add_parser("service")
    service_parser.add_argument("verb", choices=["start", "stop", "restart", "enable", "disable", "reload"])
    service_parser.add_argument("--user", default=None)

    # Save Config
    config_parser = subparsers.add_parser("save_config")
    config_parser.add_argument("--user", default=None)
    config_parser.add_argument("--data", required=True)

    # Install
    install_parser = subparsers.add_parser("install")
    install_parser.add_argument("--user", default=None)

    try:
        parsed = parser.parse_args(args)
    except SystemExit:
        return {"status": "error", "error": "Invalid arguments"}

    if parsed.action == "status":
        binary = get_binary_info()
        service = get_service_status(parsed.user)
        cfg_path = get_user_config_path(parsed.user)
        config = parse_code_server_config(cfg_path, parsed.user)

        return {
            "status": "ok",
            "binary": binary,
            "service": service,
            "config": config.to_dict(),
            "config_path": cfg_path,
        }

    elif parsed.action == "service":
        res = manage_service(parsed.verb, parsed.user)
        if res.get("success"):
            return {"status": "ok", "message": f"Service {parsed.verb} succeeded"}
        return {"status": "error", "error": res.get("error")}

    elif parsed.action == "save_config":
        try:
            data = json.loads(parsed.data)
            cfg = CodeServerConfig(
                bind_addr=data.get("bind_addr", "127.0.0.1:8080"),
                auth=data.get("auth", "none"),
                hashed_password=data.get("hashed_password"),
                cert=bool(data.get("cert", False)),
                disable_telemetry=bool(data.get("disable_telemetry", False)),
            )
            cfg_path = get_user_config_path(parsed.user)
            success = write_code_server_config(cfg_path, cfg, parsed.user)
            if success:
                return {"status": "ok", "message": "Configuration saved"}
            return {"status": "error", "error": "Failed to write configuration file"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    elif parsed.action == "install":
        res = install_code_server()
        if res.get("success"):
            return {"status": "ok", "message": "Code server installed successfully", "output": res.get("output")}
        return {"status": "error", "error": res.get("error"), "output": res.get("output")}

    return {"status": "error", "error": f"Unknown action: {parsed.action}"}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "No command specified"}))
        sys.exit(1)

    result = handle_command(sys.argv[1:])
    print(json.dumps(result))
    if result.get("status") == "error":
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
