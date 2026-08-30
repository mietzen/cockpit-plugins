import unittest
from backend.parsers import (
    parse_zpool_list,
    parse_zpool_status,
    parse_zpool_properties,
    parse_zfs_list,
    parse_zfs_snapshots,
    parse_lsblk,
    parse_smartctl,
    parse_arcstats,
)


class TestParsers(unittest.TestCase):

    def test_parse_zpool_list(self):
        raw = "testpool\t10737418240\t107479040\t10629939200\t0\t1\t1.00x\tONLINE\t-\t1234567890123456\n"
        pools = parse_zpool_list(raw)
        self.assertEqual(len(pools), 1)
        p = pools[0]
        self.assertEqual(p["name"], "testpool")
        self.assertEqual(p["size"], 10737418240)
        self.assertEqual(p["alloc"], 107479040)
        self.assertEqual(p["free"], 10629939200)
        self.assertEqual(p["frag"], 0)
        self.assertEqual(p["cap"], 1)
        self.assertEqual(p["dedup"], 1.0)
        self.assertEqual(p["health"], "ONLINE")
        self.assertEqual(p["guid"], "1234567890123456")

    def test_parse_zpool_status(self):
        raw = """  pool: testpool
 state: ONLINE
  scan: scrub repaired 0B in 00:00:02 with 0 errors on Fri Aug 28 12:00:00 2026
config:

\tNAME        STATE     READ WRITE CKSUM
\ttestpool    ONLINE       0     0     0
\t  /dev/sdb  ONLINE       0     0     0

errors: No known data errors
"""
        status = parse_zpool_status(raw)
        self.assertEqual(status["name"], "testpool")
        self.assertEqual(status["state"], "ONLINE")
        self.assertEqual(status["scan"]["function"], "scrub")
        self.assertEqual(status["scan"]["state"], "finished")
        self.assertEqual(len(status["vdevs"]), 1)
        self.assertEqual(status["vdevs"][0]["name"], "/dev/sdb")
        self.assertEqual(status["vdevs"][0]["state"], "ONLINE")
        self.assertEqual(status["vdevs"][0]["read"], 0)
        self.assertEqual(status["vdevs"][0]["write"], 0)
        self.assertEqual(status["vdevs"][0]["cksum"], 0)

    def test_parse_zpool_status_mirror_and_cache(self):
        raw = """  pool: datapool
 state: ONLINE
  scan: resilver in progress since Fri Aug 28 14:00:00 2026
	1.50G scanned at 500M/s, 1.00G issued at 300M/s, 10.0G total
	1.00G resilvered, 10.00% done, 00:00:30 to go
config:

\tNAME          STATE     READ WRITE CKSUM
\tdatapool      ONLINE       0     0     0
\t  mirror-0    ONLINE       0     0     0
\t    /dev/sdb  ONLINE       0     0     0
\t    /dev/sdc  ONLINE       0     0     0
\tcache
\t  /dev/sdd    ONLINE       0     0     0
\tlogs
\t  /dev/sde    ONLINE       0     0     0
\tspares
\t  /dev/sdf    AVAIL   

errors: No known data errors
"""
        status = parse_zpool_status(raw)
        self.assertEqual(status["name"], "datapool")
        self.assertEqual(status["state"], "ONLINE")
        self.assertEqual(status["scan"]["function"], "resilver")
        self.assertEqual(status["scan"]["state"], "in_progress")
        self.assertEqual(status["scan"]["percentage"], 10.0)
        
        # Check vdev categories
        data_vdevs = status["vdevs"]
        self.assertEqual(len(data_vdevs), 1)
        self.assertEqual(data_vdevs[0]["name"], "mirror-0")
        self.assertEqual(len(data_vdevs[0]["children"]), 2)
        
        self.assertEqual(len(status["cache"]), 1)
        self.assertEqual(status["cache"][0]["name"], "/dev/sdd")
        self.assertEqual(len(status["logs"]), 1)
        self.assertEqual(status["logs"][0]["name"], "/dev/sde")
        self.assertEqual(len(status["spares"]), 1)
        self.assertEqual(status["spares"][0]["name"], "/dev/sdf")

    def test_parse_zfs_list(self):
        raw = "tank\tfilesystem\t1000000\t9000000\t100000\t/tank\tyes\ton\t1.50x\toff\toff\t-\ton\tstandard\t10000000\tnone\t131072\t-\t-\t-\n"
        datasets = parse_zfs_list(raw)
        self.assertEqual(len(datasets), 1)
        ds = datasets[0]
        self.assertEqual(ds["name"], "tank")
        self.assertEqual(ds["type"], "filesystem")
        self.assertEqual(ds["used"], 1000000)
        self.assertEqual(ds["avail"], 9000000)
        self.assertEqual(ds["refer"], 100000)
        self.assertEqual(ds["mountpoint"], "/tank")
        self.assertEqual(ds["mounted"], True)
        self.assertEqual(ds["compression"], "on")
        self.assertEqual(ds["compressratio"], 1.5)
        self.assertEqual(ds["dedup"], "off")

    def test_parse_zfs_snapshots(self):
        raw = "tank@snap1\t1724850000\t102400\t204800\t-\n"
        snaps = parse_zfs_snapshots(raw)
        self.assertEqual(len(snaps), 1)
        s = snaps[0]
        self.assertEqual(s["name"], "tank@snap1")
        self.assertEqual(s["dataset"], "tank")
        self.assertEqual(s["snapshot_name"], "snap1")
        self.assertEqual(s["creation"], 1724850000)
        self.assertEqual(s["used"], 102400)
        self.assertEqual(s["refer"], 204800)

    def test_parse_arcstats(self):
        raw = """c                               4    4194304000
c_min                           4    1048576000
c_max                           4    8388608000
size                            4    3145728000
hits                            4    10000
misses                          4    1000
demand_data_hits                4    7000
demand_data_misses              4    800
"""
        stats = parse_arcstats(raw)
        self.assertEqual(stats["target_size"], 4194304000)
        self.assertEqual(stats["min_size"], 1048576000)
        self.assertEqual(stats["max_size"], 8388608000)
        self.assertEqual(stats["size"], 3145728000)
        self.assertAlmostEqual(stats["hit_ratio"], 0.909, places=2)

    def test_parse_zpool_properties(self):
        raw = "testpool\tashift\t12\tlocal\ntestpool\tautotrim\ton\tlocal\n"
        props = parse_zpool_properties(raw)
        self.assertEqual(props["ashift"], "12")
        self.assertEqual(props["autotrim"], "on")

    def test_parse_lsblk(self):
        raw = """{
            "blockdevices": [
                {
                    "name": "sda",
                    "kname": "sda",
                    "path": "/dev/sda",
                    "size": 107374182400,
                    "rota": false,
                    "type": "disk",
                    "tran": "sata",
                    "serial": "123456",
                    "wwn": "0x5002538",
                    "model": "Samsung SSD",
                    "mountpoint": null,
                    "fstype": "zfs_member",
                    "uuid": "abcdef",
                    "hotplug": false,
                    "children": [
                        {
                            "name": "sda1",
                            "kname": "sda1",
                            "path": "/dev/sda1",
                            "size": 10737418240,
                            "rota": false,
                            "type": "part",
                            "mountpoint": "/boot"
                        }
                    ]
                }
            ]
        }"""
        disks = parse_lsblk(raw)
        self.assertEqual(len(disks), 1)
        self.assertEqual(disks[0]["name"], "sda")
        self.assertEqual(len(disks[0]["children"]), 1)

    def test_parse_smartctl(self):
        smart_data = {
            "smartctl": {"messages": [{"string": "PASSED"}]},
            "device": {"type": "sat"},
            "smart_status": {"passed": True},
            "temperature": {"current": 35},
            "model_name": "Samsung SSD",
            "serial_number": "S123",
        }
        import json
        res = parse_smartctl(json.dumps(smart_data))
        self.assertEqual(res["health"], "PASSED")
        self.assertEqual(res["temperature"], 35)
        self.assertEqual(res["model"], "Samsung SSD")

    def test_parse_zpool_status_resilver_and_special_vdevs(self):
        raw = """  pool: tank
 state: DEGRADED
status: One or more devices has experienced an unrecoverable error.
action: Replace the device using 'zpool replace'.
  scan: resilver in progress since Sun Aug 30 12:00:00 2026
	45.5% done, 01:23:45 to go
config:

	NAME        STATE     READ WRITE CKSUM
	tank        DEGRADED     0     0     0
	  mirror-0  DEGRADED     0     0     0
	    sda     ONLINE       0     0     0
	    sdb     UNAVAIL      0     0     0
	special
	  sdc       ONLINE       0     0     0
	dedup
	  sdd       ONLINE       0     0     0
	spares
	  sde       AVAIL        0     0     0

errors: No known data errors
"""
        parsed = parse_zpool_status(raw)
        self.assertEqual(parsed["state"], "DEGRADED")
        self.assertIn("One or more devices", parsed["status"])
        self.assertIn("Replace the device", parsed["action"])
        self.assertEqual(parsed["scan"]["function"], "resilver")
        self.assertEqual(parsed["scan"]["percentage"], 45.5)
        self.assertEqual(len(parsed["special"]), 1)
        self.assertEqual(len(parsed["dedup"]), 1)
        self.assertEqual(len(parsed["spares"]), 1)
        self.assertEqual(parsed["errors"], "No known data errors")

    def test_parse_zpool_status_scan_none(self):
        raw = """  pool: tank
 state: ONLINE
  scan: none requested
config:

	NAME        STATE     READ WRITE CKSUM
	tank        ONLINE       0     0     0
	  sda       ONLINE       0     0     0

errors: No known data errors
"""
        parsed = parse_zpool_status(raw)
        self.assertEqual(parsed["scan"]["function"], "none")
        self.assertEqual(parsed["scan"]["state"], "none")


if __name__ == "__main__":
    unittest.main()



