import unittest
from backend.command_builder import (
    CommandBuilder,
    VDevConfig,
    VDevType,
    AshiftType,
    ScrubAction,
    TrimAction,
    CompressionType,
    DatasetType,
)


class TestCommandBuilder(unittest.TestCase):

    def setUp(self):
        self.builder = CommandBuilder()

    def test_build_pool_create_stripe(self):
        vdevs = [VDevConfig(type=VDevType.DATA, devices=["/dev/sdb", "/dev/sdc"])]
        cmd = self.builder.build_pool_create(
            name="tank",
            vdevs=vdevs,
            ashift=AshiftType.ASHIFT_12,
            compression=CompressionType.LZ4,
        )
        self.assertEqual(cmd, ["zpool", "create", "-o", "ashift=12", "-O", "compression=lz4", "tank", "/dev/sdb", "/dev/sdc"])

    def test_build_pool_create_mirror_with_cache_and_log(self):
        vdevs = [
            VDevConfig(type=VDevType.MIRROR, devices=["/dev/sdb", "/dev/sdc"]),
            VDevConfig(type=VDevType.LOG, devices=["/dev/sdd"]),
            VDevConfig(type=VDevType.CACHE, devices=["/dev/sde"]),
        ]
        cmd = self.builder.build_pool_create(
            name="datapool",
            vdevs=vdevs,
            ashift=AshiftType.ASHIFT_12,
            compression=CompressionType.ZSTD,
        )
        expected = [
            "zpool", "create", "-o", "ashift=12", "-O", "compression=zstd",
            "datapool",
            "mirror", "/dev/sdb", "/dev/sdc",
            "log", "/dev/sdd",
            "cache", "/dev/sde"
        ]
        self.assertEqual(cmd, expected)

    def test_build_pool_destroy(self):
        cmd = self.builder.build_pool_destroy("tank", force=True)
        self.assertEqual(cmd, ["zpool", "destroy", "-f", "tank"])

    def test_build_pool_export(self):
        cmd = self.builder.build_pool_export("tank", force=False)
        self.assertEqual(cmd, ["zpool", "export", "tank"])

    def test_build_pool_import(self):
        cmd = self.builder.build_pool_import(name="tank", force=True)
        self.assertEqual(cmd, ["zpool", "import", "-d", "/dev/disk/by-id", "-f", "tank"])

    def test_build_pool_scrub_start(self):
        cmd = self.builder.build_pool_scrub("tank", action=ScrubAction.START)
        self.assertEqual(cmd, ["zpool", "scrub", "tank"])

    def test_build_pool_scrub_stop(self):
        cmd = self.builder.build_pool_scrub("tank", action=ScrubAction.STOP)
        self.assertEqual(cmd, ["zpool", "scrub", "-s", "tank"])

    def test_build_pool_scrub_pause(self):
        cmd = self.builder.build_pool_scrub("tank", action=ScrubAction.PAUSE)
        self.assertEqual(cmd, ["zpool", "scrub", "-p", "tank"])

    def test_build_pool_trim_start(self):
        cmd = self.builder.build_pool_trim("tank", action=TrimAction.START, device="/dev/sdb")
        self.assertEqual(cmd, ["zpool", "trim", "tank", "/dev/sdb"])

    def test_build_pool_trim_stop(self):
        cmd = self.builder.build_pool_trim("tank", action=TrimAction.STOP)
        self.assertEqual(cmd, ["zpool", "trim", "-c", "tank"])

    def test_build_pool_attach(self):
        cmd = self.builder.build_pool_attach("tank", existing_device="/dev/sdb", new_device="/dev/sdc")
        self.assertEqual(cmd, ["zpool", "attach", "tank", "/dev/sdb", "/dev/sdc"])

    def test_build_pool_detach(self):
        cmd = self.builder.build_pool_detach("tank", device="/dev/sdc")
        self.assertEqual(cmd, ["zpool", "detach", "tank", "/dev/sdc"])

    def test_build_pool_replace(self):
        cmd = self.builder.build_pool_replace("tank", old_device="/dev/sdb", new_device="/dev/sdd")
        self.assertEqual(cmd, ["zpool", "replace", "tank", "/dev/sdb", "/dev/sdd"])

    def test_build_pool_set_property(self):
        cmd = self.builder.build_pool_set_property("tank", prop="autoexpand", value="on")
        self.assertEqual(cmd, ["zpool", "set", "autoexpand=on", "tank"])

    def test_build_dataset_create_filesystem(self):
        cmd = self.builder.build_dataset_create(
            path="tank/media",
            type=DatasetType.FILESYSTEM,
            properties={"compression": "lz4", "recordsize": "1M"}
        )
        self.assertEqual(cmd, ["zfs", "create", "-o", "compression=lz4", "-o", "recordsize=1M", "tank/media"])

    def test_build_dataset_create_zvol(self):
        cmd = self.builder.build_dataset_create_zvol(
            path="tank/vm-disk",
            size="20G",
            volblocksize="16k",
            sparse=True,
            properties={"compression": "zstd"}
        )
        self.assertEqual(cmd, ["zfs", "create", "-s", "-V", "20G", "-b", "16k", "-o", "compression=zstd", "tank/vm-disk"])

    def test_build_dataset_destroy(self):
        cmd = self.builder.build_dataset_destroy("tank/media", recursive=True, force=True)
        self.assertEqual(cmd, ["zfs", "destroy", "-r", "-f", "tank/media"])

    def test_build_snapshot_create(self):
        cmd = self.builder.build_snapshot_create("tank/media", snapshot_name="snap1", recursive=True)
        self.assertEqual(cmd, ["zfs", "snapshot", "-r", "tank/media@snap1"])

    def test_build_snapshot_rollback(self):
        cmd = self.builder.build_snapshot_rollback("tank/media@snap1", destroy_intermediate=True)
        self.assertEqual(cmd, ["zfs", "rollback", "-r", "tank/media@snap1"])

    def test_build_pool_create_all_vdev_types(self):
        vdevs = [
            VDevConfig(type=VDevType.DATA, devices=["/dev/sda"]),
            VDevConfig(type=VDevType.STRIPE, devices=["/dev/sdb"]),
            VDevConfig(type=VDevType.MIRROR, devices=["/dev/sdc", "/dev/sdd"]),
            VDevConfig(type=VDevType.RAIDZ1, devices=["/dev/sde", "/dev/sdf", "/dev/sdg"]),
            VDevConfig(type=VDevType.RAIDZ2, devices=["/dev/sdh", "/dev/sdi", "/dev/sdj", "/dev/sdk"]),
            VDevConfig(type=VDevType.RAIDZ3, devices=["/dev/sdl", "/dev/sdm", "/dev/sdn", "/dev/sdo", "/dev/sdp"]),
            VDevConfig(type=VDevType.LOG, devices=["/dev/sdq"]),
            VDevConfig(type=VDevType.CACHE, devices=["/dev/sdr"]),
            VDevConfig(type=VDevType.SPARE, devices=["/dev/sds"]),
            VDevConfig(type=VDevType.SPECIAL, devices=["/dev/sdt"]),
            VDevConfig(type=VDevType.DEDUP, devices=["/dev/sdu"]),
        ]
        cmd = self.builder.build_pool_create(
            name="bigpool",
            vdevs=vdevs,
            ashift=AshiftType.ASHIFT_12,
            altroot="/mnt/alt",
            mountpoint="/mnt/bigpool",
            compression=CompressionType.ZSTD,
            properties={"autoexpand": "on", "dedup": "on"},
            force=True
        )
        self.assertIn("raidz1", cmd)
        self.assertIn("raidz2", cmd)
        self.assertIn("raidz3", cmd)
        self.assertIn("special", cmd)
        self.assertIn("dedup", cmd)
        self.assertIn("-o", cmd)
        self.assertIn("autoexpand=on", cmd)
        self.assertIn("-O", cmd)
        self.assertIn("dedup=on", cmd)

    def test_build_pool_disk_operations(self):
        self.assertEqual(self.builder.build_pool_clear("tank", device="/dev/sda"), ["zpool", "clear", "tank", "/dev/sda"])
        self.assertEqual(self.builder.build_pool_trim("tank", action=TrimAction.START, device="/dev/sda"), ["zpool", "trim", "tank", "/dev/sda"])
        self.assertEqual(self.builder.build_pool_offline("tank", "/dev/sda"), ["zpool", "offline", "tank", "/dev/sda"])
        self.assertEqual(self.builder.build_pool_online("tank", "/dev/sda"), ["zpool", "online", "tank", "/dev/sda"])
        self.assertEqual(self.builder.build_pool_detach("tank", "/dev/sda"), ["zpool", "detach", "tank", "/dev/sda"])
        self.assertEqual(self.builder.build_pool_attach("tank", "/dev/sda", "/dev/sdb"), ["zpool", "attach", "tank", "/dev/sda", "/dev/sdb"])
        self.assertEqual(self.builder.build_pool_replace("tank", "/dev/sda", "/dev/sdb"), ["zpool", "replace", "tank", "/dev/sda", "/dev/sdb"])


if __name__ == "__main__":
    unittest.main()

