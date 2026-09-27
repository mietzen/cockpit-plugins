#!/usr/bin/env python3
"""
Sanoid Configuration Manager.
Parses, creates, updates, and deletes dataset snapshot schedules in /etc/sanoid/sanoid.conf.
"""
from typing import Any, Dict, List, Optional

TEMPLATE_PREFIX = "template_"
DEFAULT_TEMPLATE_NAME = "default"

BOOL_TRUE_VALUES = frozenset({"yes", "true", "1", "on"})
BOOL_FALSE_VALUES = frozenset({"no", "false", "0", "off"})

KNOWN_POLICY_KEYS = (
    "use_template",
    "frequently",
    "hourly",
    "daily",
    "monthly",
    "yearly",
    "autosnap",
    "autoprune",
    "recursive",
    "process_children_only",
)


def _parse_val(val_str: str) -> Any:
    """Parses INI value to boolean, integer, or raw string."""
    clean = val_str.strip()
    clean_lower = clean.lower()

    if clean_lower in BOOL_TRUE_VALUES:
        return True
    if clean_lower in BOOL_FALSE_VALUES:
        return False
    if clean_lower.isdigit():
        return int(clean_lower)

    return clean


def _format_val(val: Any) -> str:
    """Formats Python value into Sanoid INI compatible string."""
    if isinstance(val, bool):
        return "yes" if val else "no"
    return str(val)


def parse_sanoid_raw_sections(raw: str) -> Dict[str, Dict[str, Any]]:
    """Parses raw sanoid.conf into an ordered map of sections and key-value properties."""
    sections: Dict[str, Dict[str, Any]] = {}
    current_section: Optional[str] = None
    current_props: Dict[str, Any] = {}

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", ";")):
            continue

        if line.startswith("[") and line.endswith("]"):
            if current_section is not None:
                sections[current_section] = current_props
            current_section = line[1:-1].strip()
            current_props = {}
            continue

        if "=" in line and current_section is not None:
            parts = line.split("=", 1)
            key = parts[0].strip().lower()
            val = _parse_val(parts[1])
            current_props[key] = val

    if current_section is not None:
        sections[current_section] = current_props

    return sections


def parse_sanoid_conf_file(raw: str) -> Dict[str, Any]:
    """Parses sanoid configuration string returning templates, policies, and raw sections."""
    sections = parse_sanoid_raw_sections(raw)

    templates: Dict[str, Dict[str, Any]] = {}
    for sec_name, props in sections.items():
        if sec_name.startswith(TEMPLATE_PREFIX):
            tpl_name = sec_name[len(TEMPLATE_PREFIX):].strip()
            templates[tpl_name] = props

    policies: List[Dict[str, Any]] = []
    for sec_name, props in sections.items():
        if sec_name.startswith(TEMPLATE_PREFIX):
            continue

        resolved: Dict[str, Any] = {}
        tpl_name = props.get("use_template")
        if tpl_name and tpl_name in templates:
            resolved.update(templates[tpl_name])

        resolved.update(props)

        policy_entry: Dict[str, Any] = {
            "dataset": sec_name,
            **resolved,
        }
        if tpl_name:
            policy_entry["use_template"] = tpl_name

        policies.append(policy_entry)

    return {
        "templates": templates,
        "policies": policies,
        "raw_sections": sections,
    }


def serialize_sanoid_conf(sections: Dict[str, Dict[str, Any]]) -> str:
    """Serializes section dictionary to Sanoid INI format with clean section headers."""
    lines: List[str] = []

    for sec_name, props in sections.items():
        lines.append(f"[{sec_name}]")
        for key, val in props.items():
            if val is not None and val != "":
                lines.append(f"{key} = {_format_val(val)}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def update_sanoid_policy(conf_content: str, policy: Dict[str, Any]) -> str:
    """Adds or updates a dataset schedule section in the configuration string."""
    dataset = policy.get("dataset", "").strip()
    if not dataset:
        raise ValueError("Dataset name is required to save Sanoid policy")

    sections = parse_sanoid_raw_sections(conf_content)

    existing_props = sections.get(dataset, {})
    new_props: Dict[str, Any] = {}

    for k in KNOWN_POLICY_KEYS:
        if k in policy and policy[k] is not None:
            new_props[k] = policy[k]
        elif k in existing_props and k not in policy:
            new_props[k] = existing_props[k]

    sections[dataset] = new_props
    return serialize_sanoid_conf(sections)


def remove_sanoid_policy(conf_content: str, dataset: str) -> str:
    """Removes a dataset schedule section from the configuration string."""
    clean_ds = dataset.strip()
    if not clean_ds:
        return conf_content

    sections = parse_sanoid_raw_sections(conf_content)
    if clean_ds in sections:
        del sections[clean_ds]
        return serialize_sanoid_conf(sections)

    return conf_content
