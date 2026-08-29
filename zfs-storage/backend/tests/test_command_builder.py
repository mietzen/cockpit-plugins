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

    def test_build_snapshot_clone(self):
        cmd = self.builder.build_snapshot_clone("tank/media@snap1", clone_path="tank/media-clone", properties={"compression": "lz4"})
        self.assertEqual(cmd, ["zfs", "clone", "-o", "compression=lz4", "tank/media@snap1", "tank/media-clone"])


if __name__ == "__main__":
    unittest.main()
