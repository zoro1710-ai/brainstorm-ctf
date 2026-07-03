#!/usr/bin/env python3
"""
NODE ZERO -- Stage 5 organizer tool: builds the mission_047 rosbag.

ORGANIZER-ONLY. Do not copy this file into node_zero_mission047/ (the folder
that gets pushed as the participant-facing repo) -- it contains the plaintext
message in the clear. Participants get the compiled rosbag only.

What it builds, inside <outdir>/mission_047/ (a normal rosbag2 sqlite3 bag):
  - a handful of ordinary telemetry topics (battery/imu/diagnostics) as noise
  - ONE obscure topic, /unit_zero/subcarrier, publishing std_msgs/String
    messages of the form "<index>:<character>" -- one character of the
    hidden message per message, written to the bag in SHUFFLED order (so
    playback order != solve order; the explicit index is what lets you
    reassemble it).

The hidden message is the Stage 5 flag plus the Stage 6 handoff. Change
MESSAGE below (and FLAG in challenges/L05-mission-047/challenge.yml to match)
if you regenerate for a live event. For TRUE per-team anti-share, adapt
challenges/_templates/per-team-randomizer.py instead of running this as-is
for every team.

Run:
    source /opt/ros/humble/setup.bash
    python3 _organizer_generate_bag.py [outdir]
"""
import os
import random
import shutil
import sys

import rclpy
from rclpy.serialization import serialize_message
import rosbag2_py
from std_msgs.msg import String
from sensor_msgs.msg import BatteryState, Imu
from diagnostic_msgs.msg import DiagnosticArray, DiagnosticStatus
from diagnostic_msgs.msg import KeyValue

FLAG = "nodezero{last_flight}"
MESSAGE = FLAG + " next: uplink_dump.txt. XOR key = tail of this flag."

SECRET_TOPIC = "/unit_zero/subcarrier"
BASE_NS = 1_700_000_000_000_000_000  # arbitrary epoch-ish start, nanoseconds


def build_writer(outdir: str, bag_name: str) -> rosbag2_py.SequentialWriter:
    bag_path = os.path.join(outdir, bag_name)
    if os.path.exists(bag_path):
        shutil.rmtree(bag_path)
    writer = rosbag2_py.SequentialWriter()
    storage_options = rosbag2_py.StorageOptions(uri=bag_path, storage_id="sqlite3")
    converter_options = rosbag2_py.ConverterOptions(
        input_serialization_format="cdr", output_serialization_format="cdr"
    )
    writer.open(storage_options, converter_options)
    return writer, bag_path


def create_topic(writer, name, msg_type_str):
    writer.create_topic(
        rosbag2_py.TopicMetadata(
            name=name, type=msg_type_str, serialization_format="cdr"
        )
    )


def write_msg(writer, topic, msg, t_ns):
    writer.write(topic, serialize_message(msg), t_ns)


def battery_msgs():
    out = []
    level = 0.91
    for i in range(20):
        m = BatteryState()
        level = max(0.05, level - 0.004)
        m.percentage = float(level)
        m.voltage = 15.8 - i * 0.01
        m.present = True
        out.append(m)
    return out


def imu_msgs():
    out = []
    for i in range(30):
        m = Imu()
        m.linear_acceleration.x = 0.01 * ((i % 5) - 2)
        m.linear_acceleration.y = 0.02 * ((i % 3) - 1)
        m.linear_acceleration.z = 9.81
        m.angular_velocity.z = 0.001 * (i % 7)
        out.append(m)
    return out


def diagnostic_msgs_list():
    out = []
    for i in range(15):
        m = DiagnosticArray()
        status = DiagnosticStatus()
        status.name = "unit_zero/recorder"
        status.level = DiagnosticStatus.OK
        status.message = "nominal"
        status.values = [KeyValue(key="uptime_s", value=str(i * 4))]
        m.status = [status]
        out.append(m)
    return out


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)

    rclpy.init()
    writer, bag_path = build_writer(outdir, "mission_047")

    create_topic(writer, "/battery_state", "sensor_msgs/msg/BatteryState")
    create_topic(writer, "/imu/data", "sensor_msgs/msg/Imu")
    create_topic(writer, "/diagnostics", "diagnostic_msgs/msg/DiagnosticArray")
    create_topic(writer, SECRET_TOPIC, "std_msgs/msg/String")

    # --- decoy telemetry, spread evenly across ~60s of "flight time" -------
    rng = random.Random(47)  # fixed seed -> reproducible decoy layout

    for i, m in enumerate(battery_msgs()):
        write_msg(writer, "/battery_state", m, BASE_NS + i * 3_000_000_000)
    for i, m in enumerate(imu_msgs()):
        write_msg(writer, "/imu/data", m, BASE_NS + i * 2_000_000_000)
    for i, m in enumerate(diagnostic_msgs_list()):
        write_msg(writer, "/diagnostics", m, BASE_NS + i * 4_000_000_000)

    # --- the secret channel: one character per message, index embedded, ---
    # --- written to the bag in SHUFFLED order so naive playback order is --
    # --- not solve order. -----------------------------------------------
    n = len(MESSAGE)
    order = list(range(n))
    rng.shuffle(order)
    for write_pos, char_idx in enumerate(order):
        ch = MESSAGE[char_idx]
        m = String()
        m.data = f"{char_idx}:{ch}"
        # timestamps assigned in shuffled (write) order, spread across the
        # same ~60s window, so `ros2 bag play` emits them out of solve-order.
        t_ns = BASE_NS + write_pos * int(60_000_000_000 / n)
        write_msg(writer, SECRET_TOPIC, m, t_ns)

    del writer
    rclpy.shutdown()

    print(f"[+] wrote {bag_path}")
    print(f"[+] secret topic: {SECRET_TOPIC}  ({n} messages, shuffled write order)")
    print(f"[+] hidden message ({n} chars): {MESSAGE!r}")


if __name__ == "__main__":
    main()
