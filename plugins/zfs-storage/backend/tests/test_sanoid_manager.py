#!/usr/bin/env python3
import unittest
from backend.sanoid_manager import (
    parse_sanoid_conf_file,
    update_sanoid_policy,
    remove_sanoid_policy,
    serialize_sanoid_conf,
)


class TestSanoidManager(unittest.TestCase):
    def test_parse_empty(self):
        res = parse_sanoid_conf_file("")
        self.assertEqual(res["policies"], [])
        self.assertEqual(res["templates"], {})

    def test_parse_full_config(self):
        raw = """# Global templates
[template_production]
frequently = 0
hourly = 36
daily = 30
monthly = 3
yearly = 0
autosnap = yes
autoprune = yes

[template_backup]
hourly = 0
daily = 7
monthly = 1
autosnap = no
autoprune = yes

# Datasets
[tank/vm_data]
use_template = production
hourly = 48
recursive = yes

[tank/backups]
use_template = backup
daily = 14
autosnap = yes
"""
        res = parse_sanoid_conf_file(raw)
        self.assertIn("production", res["templates"])
        self.assertIn("backup", res["templates"])
        self.assertEqual(len(res["policies"]), 2)

        vm = next(p for p in res["policies"] if p["dataset"] == "tank/vm_data")
        self.assertEqual(vm["use_template"], "production")
        self.assertEqual(vm["hourly"], 48)  # overridden
        self.assertEqual(vm["daily"], 30)   # inherited from production
        self.assertEqual(vm["recursive"], True)
        self.assertEqual(vm["autosnap"], True)

        bk = next(p for p in res["policies"] if p["dataset"] == "tank/backups")
        self.assertEqual(bk["use_template"], "backup")
        self.assertEqual(bk["daily"], 14)  # overridden
        self.assertEqual(bk["monthly"], 1) # inherited
        self.assertEqual(bk["autosnap"], True) # overridden

    def test_update_sanoid_policy_create(self):
        initial = """[template_production]
frequently = 0
hourly = 24
daily = 7

[tank/existing]
use_template = production
"""
        new_policy = {
            "dataset": "tank/new_ds",
            "use_template": "production",
            "hourly": 48,
            "daily": 14,
            "monthly": 2,
            "yearly": 0,
            "autosnap": True,
            "autoprune": True,
            "recursive": True,
        }
        updated = update_sanoid_policy(initial, new_policy)
        res = parse_sanoid_conf_file(updated)
        self.assertEqual(len(res["policies"]), 2)
        ds = next(p for p in res["policies"] if p["dataset"] == "tank/new_ds")
        self.assertEqual(ds["hourly"], 48)
        self.assertEqual(ds["daily"], 14)
        self.assertEqual(ds["recursive"], True)

    def test_update_sanoid_policy_edit(self):
        initial = """[tank/vm_data]
use_template = production
hourly = 24
daily = 7
autosnap = yes
"""
        edit_policy = {
            "dataset": "tank/vm_data",
            "hourly": 72,
            "daily": 30,
            "autosnap": False,
            "autoprune": True,
            "recursive": False,
        }
        updated = update_sanoid_policy(initial, edit_policy)
        res = parse_sanoid_conf_file(updated)
        self.assertEqual(len(res["policies"]), 1)
        ds = res["policies"][0]
        self.assertEqual(ds["dataset"], "tank/vm_data")
        self.assertEqual(ds["hourly"], 72)
        self.assertEqual(ds["daily"], 30)
        self.assertEqual(ds["autosnap"], False)
        self.assertEqual(ds["autoprune"], True)
        self.assertEqual(ds["recursive"], False)

    def test_remove_sanoid_policy(self):
        initial = """[template_default]
hourly = 24

[tank/first]
use_template = default

[tank/second]
use_template = default
"""
        updated = remove_sanoid_policy(initial, "tank/first")
        res = parse_sanoid_conf_file(updated)
        self.assertEqual(len(res["policies"]), 1)
        self.assertEqual(res["policies"][0]["dataset"], "tank/second")
        self.assertIn("default", res["templates"])

    def test_remove_nonexistent_policy(self):
        initial = "[tank/first]\nhourly = 24\n"
        updated = remove_sanoid_policy(initial, "tank/nonexistent")
        self.assertEqual(updated.strip(), initial.strip())

    def test_serialize_sanoid_conf(self):
        sections = {
            "template_demo": {
                "hourly": 24,
                "daily": 7,
                "autosnap": True,
                "autoprune": False,
            },
            "rpool/data": {
                "use_template": "demo",
                "recursive": True,
            },
        }
        rendered = serialize_sanoid_conf(sections)
        self.assertIn("[template_demo]", rendered)
        self.assertIn("hourly = 24", rendered)
        self.assertIn("autosnap = yes", rendered)
        self.assertIn("autoprune = no", rendered)
        self.assertIn("[rpool/data]", rendered)
        self.assertIn("use_template = demo", rendered)
        self.assertIn("recursive = yes", rendered)


if __name__ == "__main__":
    unittest.main()
