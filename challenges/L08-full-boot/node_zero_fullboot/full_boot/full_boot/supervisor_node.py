#!/usr/bin/env python3
"""
NODE ZERO - Stage 8 (finale): "Full Boot"

Unit Zero's body is a turtlesim turtle. Bring it home: pilot it into the
recovery zone, make sure the beacon is ready, then call the full-boot
service with the key from Stage 7.

Nothing here needs code changes. The faults (if any) are in how this
workspace gets launched, not in this file.
"""

import base64
import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from std_msgs.msg import Bool, String
from turtlesim.msg import Pose
from full_boot_interfaces.srv import FullBoot

# The key is the word you recovered in Stage 7. Not written here in the
# clear -- the check is case-insensitive and whitespace-tolerant.
EXPECTED_KEY = "revive"

# Where Unit Zero needs to be piloted to, and how close counts as "there".
# The radius itself comes from a launch parameter (see below) -- this is
# just the target point, which is fixed.
TARGET_X = 8.0
TARGET_Y = 2.0

# Result once fully awake: the flag. Stored encoded so it isn't a plain
# `grep nodezero` away in the cloned repo -- only decoded at runtime, after
# a correct wake.
_RESULT_B64 = (
    "VU5JVCBaRVJPIDo6IEZVTEwgQk9PVCBDT01QTEVURS4KU2lnbmFsIHJlY292ZXJlZC4gVW5p"
    "dCBaZXJvIGlzIGZ1bGx5IGF3YWtlLgoKbm9kZXplcm97c2lnbmFsX3JlY292ZXJlZH0KCkZp"
    "cnN0IGNyZXcgaGVyZSB3aW5zIHRoZSBraXQu"
)


class SupervisorNode(Node):

    def __init__(self):
        super().__init__('supervisor_node')

        # How close (in turtlesim units) to TARGET_X/TARGET_Y counts as
        # "arrived". Meant to be a sane, generous default -- if it isn't,
        # that's a launch configuration problem, not something to fix here.
        self.declare_parameter('target_radius', 1.0)

        self._pose = None
        self._beacon_ready = False

        # Subscribed under a local name -- the launch file is responsible
        # for connecting this to the turtle's real pose topic.
        self.create_subscription(Pose, 'turtle_pose', self._on_pose, 10)

        # The beacon publishes with TRANSIENT_LOCAL durability by design, so
        # a supervisor that (re)starts after the beacon is already up still
        # gets the latest reading. This subscription requests the same --
        # if the beacon isn't publishing with matching durability, nothing
        # will ever arrive here (check `ros2 topic info -v` if that happens).
        beacon_qos = QoSProfile(
            depth=1,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
        )
        self.create_subscription(
            Bool, '/unit_zero/beacon_ready', self._on_beacon, beacon_qos
        )

        self.status_pub = self.create_publisher(String, '/unit_zero/status', 10)
        self.create_timer(1.0, self._tick)

        self.srv = self.create_service(
            FullBoot, '/unit_zero/full_boot', self._on_full_boot
        )

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO supervisor -- awaiting full boot')
        self.get_logger().info(f'  Recovery zone: ({TARGET_X}, {TARGET_Y})')
        self.get_logger().info('=' * 64)

    def _on_pose(self, msg):
        self._pose = msg

    def _on_beacon(self, msg):
        self._beacon_ready = bool(msg.data)

    def _distance(self):
        if self._pose is None:
            return None
        return math.hypot(self._pose.x - TARGET_X, self._pose.y - TARGET_Y)

    def _tick(self):
        radius = self.get_parameter('target_radius').value
        dist = self._distance()
        status = String()
        if dist is None:
            status.data = 'AWAITING POSE :: no pose data received yet.'
        else:
            status.data = (
                f'distance to recovery zone: {dist:.2f} (need <= {radius:.2f}) '
                f':: beacon_ready={self._beacon_ready}'
            )
        self.status_pub.publish(status)

    def _on_full_boot(self, request, response):
        key = request.key.strip().lower()
        radius = self.get_parameter('target_radius').value
        dist = self._distance()

        problems = []
        if key != EXPECTED_KEY:
            problems.append('wrong key')
        if not self._beacon_ready:
            problems.append('beacon not ready')
        if dist is None:
            problems.append('no pose data (turtle position unknown)')
        elif dist > radius:
            problems.append(f'turtle not in recovery zone (distance {dist:.2f} > {radius:.2f})')

        if problems:
            response.success = False
            response.message = 'REJECTED :: ' + '; '.join(problems)
        else:
            response.success = True
            response.message = base64.b64decode(_RESULT_B64).decode('utf-8')
        return response


def main(args=None):
    rclpy.init(args=args)
    node = SupervisorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
