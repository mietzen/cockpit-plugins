from enum import Enum


class ZPoolHealth(str, Enum):
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    FAULTED = "FAULTED"
    OFFLINE = "OFFLINE"
    UNAVAIL = "UNAVAIL"
    SUSPENDED = "SUSPENDED"


class VDevType(str, Enum):
    DATA = "data"
    STRIPE = "stripe"
    MIRROR = "mirror"
    RAIDZ1 = "raidz1"
    RAIDZ2 = "raidz2"
    RAIDZ3 = "raidz3"
    DRAID1 = "draid1"
    DRAID2 = "draid2"
    DRAID3 = "draid3"
    SPECIAL = "special"
    DEDUP = "dedup"
    CACHE = "cache"
    LOG = "log"
    SPARE = "spare"


class AshiftType(int, Enum):
    ASHIFT_AUTO = 0
    ASHIFT_9 = 9
    ASHIFT_12 = 12
    ASHIFT_13 = 13
    ASHIFT_14 = 14


class DatasetType(str, Enum):
    FILESYSTEM = "filesystem"
    VOLUME = "volume"
    SNAPSHOT = "snapshot"
    BOOKMARK = "bookmark"


class CompressionType(str, Enum):
    ON = "on"
    OFF = "off"
    LZ4 = "lz4"
    GZIP = "gzip"
    ZSTD = "zstd"
    ZLE = "zle"
    LZJB = "lzjb"


class DedupType(str, Enum):
    OFF = "off"
    ON = "on"
    VERIFY = "verify"
    SHA256 = "sha256"
    SKEIN = "skein"
    EDONR = "edonr"
    BLAKE3 = "blake3"


class ScrubAction(str, Enum):
    START = "start"
    STOP = "stop"
    PAUSE = "pause"


class TrimAction(str, Enum):
    START = "start"
    STOP = "stop"
    SUSPEND = "suspend"
