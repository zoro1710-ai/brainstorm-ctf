#!/usr/bin/env python3
"""
NODE ZERO - Stage 8 (finale): "Full Boot"

Unit Zero's body, for this last stretch, is a turtlesim turtle. Pilot it
through a square -- four straight legs, four turns, back close to where
you started -- and the full boot completes on its own.

Nothing here needs code changes.
"""

import base64
import math

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from turtlesim.msg import Pose

# A leg has to be at least this long (turtlesim units) before a turn counts,
# so small steering wobble while driving doesn't get mistaken for a corner.
MIN_LEG_DISTANCE = 1.5

# A turn has to change heading by at least this much to count as a corner.
TURN_THRESHOLD_DEG = 60.0

# After 4 corners, the turtle must be back within this distance of where it
# started the shape, and must have turned a total of ~360 degrees (with this
# much slack either way) -- i.e. a closed, roughly-convex quadrilateral.
CLOSE_DISTANCE = 1.5
TOTAL_TURN_TOLERANCE_DEG = 70.0

# Result once the shape is confirmed: the flag. Stored encoded so it isn't a
# plain `grep nodezero` away in the cloned repo -- only decoded at runtime.
_RESULT_B64 = (
    "VU5JVCBaRVJPIDo6IEZVTEwgQk9PVCBDT01QTEVURS4KU2lnbmFsIHJlY292ZXJlZC4gVW5p"
    "dCBaZXJvIGlzIGZ1bGx5IGF3YWtlLgoKbm9kZXplcm97c2lnbmFsX3JlY292ZXJlZH0KCkZp"
    "cnN0IGNyZXcgaGVyZSB3aW5zIHRoZSBraXQu"
)


def angle_diff_deg(a, b):
    """Smallest signed difference a-b, in degrees, wrapped to [-180, 180]."""
    d = math.degrees(a - b)
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return d


class SupervisorNode(Node):

    def __init__(self):
        super().__init__('supervisor_node')

        self._done = False
        self._leg_start_xy = None
        self._leg_heading = None
        self._corners = 0
        self._total_turn = 0.0

        self.create_subscription(Pose, '/turtle1/pose', self._on_pose, 10)
        self.status_pub = self.create_publisher(String, '/unit_zero/status', 10)
        self.create_timer(1.0, self._tick)

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO supervisor -- awaiting full boot')
        self.get_logger().info('  Pilot the turtle through a square to wake it.')
        self.get_logger().info('=' * 64)

    def _tick(self):
        if self._done:
            return
        msg = String()
        msg.data = (
            f'corners so far: {self._corners}/4, total turn: {self._total_turn:.0f} deg'
        )
        self.status_pub.publish(msg)

    def _on_pose(self, pose):
        if self._done:
            return

        if self._leg_start_xy is None:
            # First reading: this is where the shape itself begins (point A),
            # and also where the first leg starts.
            self._leg_start_xy = (pose.x, pose.y)
            self._leg_heading = pose.theta
            self._shape_start_xy = (pose.x, pose.y)
            return

        dist = math.hypot(pose.x - self._leg_start_xy[0], pose.y - self._leg_start_xy[1])
        turn = angle_diff_deg(pose.theta, self._leg_heading)

        if dist >= MIN_LEG_DISTANCE and abs(turn) >= TURN_THRESHOLD_DEG:
            self._corners += 1
            self._total_turn += abs(turn)
            self.get_logger().info(
                f'Corner {self._corners} detected (turned {turn:.0f} deg, '
                f'leg length {dist:.2f}).'
            )

            # Start the next leg from here.
            self._leg_start_xy = (pose.x, pose.y)
            self._leg_heading = pose.theta

            if self._corners >= 4:
                self._check_shape_complete(pose)

    def _check_shape_complete(self, pose):
        closing_dist = math.hypot(
            pose.x - self._shape_start_xy[0],
            pose.y - self._shape_start_xy[1],
        )
        turn_ok = abs(self._total_turn - 360.0) <= TOTAL_TURN_TOLERANCE_DEG
        close_ok = closing_dist <= CLOSE_DISTANCE

        if turn_ok and close_ok:
            self._done = True
            result = String()
            result.data = base64.b64decode(_RESULT_B64).decode('utf-8')
            self.status_pub.publish(result)
            self.get_logger().info('=' * 64)
            self.get_logger().info('  SQUARE CONFIRMED. UNIT ZERO FULLY AWAKE.')
            self.get_logger().info(result.data)
            self.get_logger().info('=' * 64)
        else:
            self.get_logger().warn(
                f'4 corners seen but shape not closed (closing distance '
                f'{closing_dist:.2f}, total turn {self._total_turn:.0f} deg) '
                '-- resetting, try again.'
            )
            self._corners = 0
            self._total_turn = 0.0
            self._shape_start_xy = (pose.x, pose.y)


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
