#!/usr/bin/env python3
import argparse
import json
import os
import sys
from typing import Any, Dict

# Ensure local libexec directory and parent paths are resolvable
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from engine_adapter import detect_engines, get_adapter
from tls_manager import disable_tls, get_client_bundle, get_tls_status, setup_tls


def cmd_get_overview(args: argparse.Namespace) -> Dict[str, Any]:
    engines = detect_engines()
    active_engine = args.engine if args.engine and args.engine != "auto" else engines.get("active_engine", "docker")

    if active_engine == "none" or (not engines["docker"]["installed"] and not engines["podman"]["installed"]):
        return {
            "status": "success",
            "engines": engines,
            "active_engine": "none",
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
        "containers": containers,
        "images": images,
        "volumes": volumes,
        "networks": networks,
    }


def cmd_container_action(args: argparse.Namespace) -> Dict[str, Any]:
    adapter = get_adapter(args.engine)
    return adapter.container_action(args.id, args.action)


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
    return {"status": "success", "tls": status}


def cmd_setup_tls(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    sans = [s.strip() for s in args.sans.split(",") if s.strip()] if args.sans else None
    return setup_tls(engine=engine, port=args.port, sans=sans)


def cmd_disable_tls(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    return disable_tls(engine=engine)


def cmd_get_client_bundle(args: argparse.Namespace) -> Dict[str, Any]:
    engine = args.engine or "docker"
    return get_client_bundle(engine=engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="Cockpit Container Manager Backend Helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # get_overview
    p_overview = subparsers.add_parser("get_overview")
    p_overview.add_argument("--engine", default="auto", choices=["auto", "docker", "podman"])
    p_overview.set_defaults(func=cmd_get_overview)

    # container_action
    p_action = subparsers.add_parser("container_action")
    p_action.add_argument("--engine", default="auto")
    p_action.add_argument("--id", required=True, help="Container ID or name")
    p_action.add_argument("--action", required=True, choices=["start", "stop", "kill", "restart"])
    p_action.set_defaults(func=cmd_container_action)

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
    p_setup_tls.add_argument("--port", type=int, default=2376)
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
