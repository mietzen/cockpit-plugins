#!/usr/bin/env python3
"""
Normalizes RPM package headers for bit-for-bit build reproducibility.
Clamps RPMTAG_BUILDTIME to SOURCE_DATE_EPOCH and updates signature header digests.
"""
import argparse
import hashlib
import os
import struct
import sys


def normalize_rpm(rpm_path: str, epoch: int) -> None:
    with open(rpm_path, "rb") as f:
        rpm_bytes = f.read()

    if len(rpm_bytes) < 112:
        return

    # Lead is 96 bytes
    lead = rpm_bytes[:96]

    # Signature Header (starts at 96)
    sig_magic, sig_ver, sig_res, sig_n, sig_size = struct.unpack(">3sB4sII", rpm_bytes[96:112])
    sig_hdr_size = 16 + sig_n * 16 + sig_size
    sig_full_end = 96 + sig_hdr_size
    main_offset = (sig_full_end + 7) & ~7

    if len(rpm_bytes) < main_offset + 16:
        return

    # Main Header
    main_magic, main_ver, main_res, main_n, main_size = struct.unpack(">3sB4sII", rpm_bytes[main_offset:main_offset+16])
    main_hdr_raw_size = 16 + main_n * 16 + main_size
    main_full_end = main_offset + main_hdr_raw_size

    main_data = bytearray(rpm_bytes[main_offset:main_full_end])
    payload = rpm_bytes[main_full_end:]

    # Clamp RPMTAG_BUILDTIME (tag 1006) in Main Header
    main_idx_start = 16
    main_store_start = 16 + main_n * 16
    for i in range(main_n):
        tag, tag_type, val_offset, count = struct.unpack(">IIII", main_data[main_idx_start + i*16 : main_idx_start + (i+1)*16])
        if tag == 1006:  # RPMTAG_BUILDTIME
            struct.pack_into(">I", main_data, main_store_start + val_offset, int(epoch))
            break

    # Recalculate deterministic digests
    main_hdr_bytes = bytes(main_data)
    main_sha1 = hashlib.sha1(main_hdr_bytes).hexdigest().encode("ascii") + b"\x00"
    main_sha256 = hashlib.sha256(main_hdr_bytes).hexdigest().encode("ascii") + b"\x00"
    full_md5 = hashlib.md5(main_hdr_bytes + payload).digest()

    # Update Signature Header digests
    sig_data = bytearray(rpm_bytes[96:sig_full_end])
    sig_idx_start = 16
    sig_store_start = 16 + sig_n * 16
    for i in range(sig_n):
        tag, tag_type, val_offset, count = struct.unpack(">IIII", sig_data[sig_idx_start + i*16 : sig_idx_start + (i+1)*16])
        if tag == 269:  # RPMSIGTAG_SHA1 (SHA1 of Header)
            sig_data[sig_store_start + val_offset : sig_store_start + val_offset + len(main_sha1)] = main_sha1
        elif tag == 273:  # RPMSIGTAG_SHA256 (SHA256 of Header)
            sig_data[sig_store_start + val_offset : sig_store_start + val_offset + len(main_sha256)] = main_sha256
        elif tag == 1000:  # RPMSIGTAG_SIZE (size of Header + Payload)
            struct.pack_into(">I", sig_data, sig_store_start + val_offset, len(main_hdr_bytes) + len(payload))
        elif tag == 1004:  # RPMSIGTAG_MD5 (MD5 of Header + Payload)
            sig_data[sig_store_start + val_offset : sig_store_start + val_offset + 16] = full_md5

    pad = b"\x00" * (main_offset - sig_full_end)
    normalized_bytes = lead + bytes(sig_data) + pad + main_hdr_bytes + payload

    with open(rpm_path, "wb") as f:
        f.write(normalized_bytes)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clamp RPM header timestamps for reproducible builds")
    parser.add_argument("rpm_file", help="Path to RPM package")
    parser.add_argument("--epoch", type=int, default=0, help="Unix epoch timestamp")
    args = parser.parse_args()

    epoch = args.epoch or int(os.environ.get("SOURCE_DATE_EPOCH", 0)) or 0
    normalize_rpm(args.rpm_file, epoch)


if __name__ == "__main__":
    main()
