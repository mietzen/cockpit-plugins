#!/usr/bin/env python3
import argparse
import getpass
import json
import os
import re
import shlex
import socket
import sys
from typing import Any, Dict

# Ensure local libexec directory and parent paths are resolvable
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from engine_adapter import detect_engines, get_adapter
from tls_manager import disable_tls, get_client_bundle, get_tls_status, setup_tls

MIN_PORT = 1
MAX_PORT = 65535
DEFAULT_LOG_TAIL = 200
DEFAULT_SHELL_CMD = "/bin/sh"
ALLOWED_ENGINES = ("docker", "podman")
CONTAINER_ID_REGEX = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")


# Resolve short hostname and effective user for SSH/context commands
def _get_host_and_user() -> Dict[str, str]:
    hostname = socket.gethostname().split(".")[0]
    user = os.environ.get("SUDO_USER") or os.environ.get("USER") or getpass.getuser()
    return {"hostname": hostname, "user": user}


def cmd_get_overview(args: argparse.Namespace) -> Dict[str, Any]:
    engines = detect_engines()
    active_engine = args.engine if args.engine and args.engine != "auto" else engines.get("active_engine", "docker")
    host_info = _get_host_and_user()

    if active_engine == "none" or (not engines["docker"]["installed"] and not engines["podman"]["installed"]):
        return {
            "status": "success",
            "engines": engines,
            "active_engine": "none",
            "hostname": host_info["hostname"],
            "user": host_info["user"],
            "containers": [],
            "images": [],
            "volumes": [],
            "networks": [],
        }

    adapter = get_adapter(active_engine)
    containers = adapter.list_containers()
    images = adapter.list_images()
    volumes = adapter.list_volumes()
    networks = adapter.list_networks()

    return {
        "status": "success",
        "engines": engines,
        "active_engine": active_engine,
        "hostname": host_info["hostname"],
        "user": host_info["user"],
        "containers": containers,
        "images": images,
        "volumes": volumes,
        "networks": networks,
    }


def cmd_inspect_entity(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    return adapter.inspect_entity(args.kind, args.id)


def cmd_container_action(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    return adapter.container_action(args.id, args.action)


def cmd_check_shells(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    return adapter.check_shells(args.id)


def cmd_delete_entity(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    return adapter.delete_entity(args.kind, args.id, force=args.force)


def cmd_prune(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    if args.kind == "system":
        return adapter.system_prune(include_volumes=args.volumes)
    return adapter.prune_entity(args.kind, prune_all=args.all)


def cmd_get_tls_status(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    status = get_tls_status(engine)
    host_info = _get_host_and_user()
    status["hostname"] = host_info["hostname"]
    status["user"] = host_info["user"]
    return {"status": "success", "tls": status}


def _port_type(val: str) -> int:
    try:
        port = int(val)
    except ValueError:
        raise argparse.ArgumentTypeError(f"Invalid integer: {val}")
    if not (MIN_PORT <= port <= MAX_PORT):
        raise argparse.ArgumentTypeError(f"Port {port} out of range ({MIN_PORT}-{MAX_PORT})")
    return port


def cmd_setup_tls(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    if not (MIN_PORT <= args.port <= MAX_PORT):
        return {"status": "error", "error": f"Invalid port {args.port}: must be between {MIN_PORT} and {MAX_PORT}."}
    sans = [s.strip() for s in args.sans.split(",") if s.strip()] if args.sans else None
    return setup_tls(engine=engine, port=args.port, sans=sans)


def cmd_disable_tls(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    return disable_tls(engine=engine)


def cmd_get_client_bundle(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    return get_client_bundle(engine=engine)


def cmd_terminal(args: argparse.Namespace) -> None:
    # Validate target container engine
    if args.engine not in ALLOWED_ENGINES:
        raise ValueError(f"Invalid engine: {args.engine}")

    # Validate container identifier to prevent command injection
    if not args.container or not CONTAINER_ID_REGEX.match(args.container):
        raise ValueError(f"Invalid container ID: {args.container}")

    # Parse shell command tokens safely
    raw_cmd = args.command if args.command else DEFAULT_SHELL_CMD
    parts = shlex.split(raw_cmd)

    # Replace current process with container exec session
    exec_args = [args.engine, "exec", "-i", "-t", args.container, *parts]
    os.execvp(args.engine, exec_args)


def cmd_logs(args: argparse.Namespace) -> None:
    # Validate target container engine
    if args.engine not in ALLOWED_ENGINES:
        raise ValueError(f"Invalid engine: {args.engine}")

    # Validate container identifier to prevent command injection
    if not args.container or not CONTAINER_ID_REGEX.match(args.container):
        raise ValueError(f"Invalid container ID: {args.container}")

    # Validate tail line count
    tail_count = int(args.tail)
    if tail_count < 0:
        raise ValueError(f"Invalid tail value: {args.tail}")

    # Build streaming log command arguments
    log_args = [args.engine, "logs", "-f", "--tail", str(tail_count)]
    if args.timestamps:
        log_args.append("-t")

    log_args.append(args.container)

    # Replace current process with container logs stream
    os.execvp(args.engine, log_args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Cockpit Container Manager Backend Helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # get_overview
    p_overview = subparsers.add_parser("get_overview")
    p_overview.add_argument("--engine", default="auto", choices=["auto", "docker", "podman"])
    p_overview.set_defaults(func=cmd_get_overview)

    # terminal
    p_terminal = subparsers.add_parser("terminal")
    p_terminal.add_argument("--engine", default="docker", choices=ALLOWED_ENGINES)
    p_terminal.add_argument("--container", required=True, help="Container ID or name")
    p_terminal.add_argument("--command", default=DEFAULT_SHELL_CMD, help="Command to run")
    p_terminal.set_defaults(func=cmd_terminal)

    # logs
    p_logs = subparsers.add_parser("logs")
    p_logs.add_argument("--engine", default="docker", choices=ALLOWED_ENGINES)
    p_logs.add_argument("--container", required=True, help="Container ID or name")
    p_logs.add_argument("--tail", type=int, default=DEFAULT_LOG_TAIL, help="Lines from log tail")
    p_logs.add_argument("--timestamps", action="store_true", help="Show timestamps")
    p_logs.set_defaults(func=cmd_logs)

    # inspect_entity
    p_inspect = subparsers.add_parser("inspect_entity")
    p_inspect.add_argument("--engine", default="auto")
    p_inspect.add_argument("--kind", default="container", choices=["container", "image", "volume", "network"])
    p_inspect.add_argument("--id", required=True, help="Entity ID or name")
    p_inspect.set_defaults(func=cmd_inspect_entity)

    # container_action
    p_action = subparsers.add_parser("container_action")
    p_action.add_argument("--engine", default="auto")
    p_action.add_argument("--id", required=True, help="Container ID or name")
    p_action.add_argument("--action", required=True, choices=["start", "stop", "kill", "restart"])
    p_action.set_defaults(func=cmd_container_action)

    # check_shells
    p_shells = subparsers.add_parser("check_shells")
    p_shells.add_argument("--engine", default="auto")
    p_shells.add_argument("--id", required=True, help="Container ID or name")
    p_shells.set_defaults(func=cmd_check_shells)

    # delete_entity
    p_del = subparsers.add_parser("delete_entity")
    p_del.add_argument("--engine", default="auto")
    p_del.add_argument("--kind", required=True, choices=["container", "image", "volume", "network"])
    p_del.add_argument("--id", required=True, help="Entity ID or name")
    p_del.add_argument("--force", action="store_true", help="Force deletion")
    p_del.set_defaults(func=cmd_delete_entity)

    # prune
    p_prune = subparsers.add_parser("prune")
    p_prune.add_argument("--engine", default="auto")
    p_prune.add_argument("--kind", required=True, choices=["container", "image", "volume", "network", "system"])
    p_prune.add_argument("--all", action="store_true", help="Prune all unused, not just dangling")
    p_prune.add_argument("--volumes", action="store_true", help="Prune unused volumes in system prune")
    p_prune.set_defaults(func=cmd_prune)

    # get_tls_status
    p_tls_stat = subparsers.add_parser("get_tls_status")
    p_tls_stat.add_argument("--engine", default="docker", choices=["docker", "podman"])
    p_tls_stat.set_defaults(func=cmd_get_tls_status)

    # setup_tls
    p_setup_tls = subparsers.add_parser("setup_tls")
    p_setup_tls.add_argument("--engine", default="docker", choices=["docker", "podman"])
    p_setup_tls.add_argument("--port", type=_port_type, default=2376)
    p_setup_tls.add_argument("--sans", default="", help="Comma-separated Subject Alternative Names")
    p_setup_tls.set_defaults(func=cmd_setup_tls)

    # disable_tls
    p_dis_tls = subparsers.add_parser("disable_tls")
    p_dis_tls.add_argument("--engine", default="docker", choices=["docker", "podman"])
    p_dis_tls.set_defaults(func=cmd_disable_tls)

    # get_client_bundle
    p_bundle = subparsers.add_parser("get_client_bundle")
    p_bundle.add_argument("--engine", default="docker", choices=["docker", "podman"])
    p_bundle.set_defaults(func=cmd_get_client_bundle)

    parsed = parser.parse_args()
    try:
        res = parsed.func(parsed)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
