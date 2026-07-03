#!/usr/bin/env python3
"""
NODE ZERO - Stage 3: "Cold Start"

Unit Zero's handshake response pointed you at its flight-recorder source.
It is all here -- but it will not build. Something got corrupted in the crash.

This node itself is FINE. The break is in the package build config
(see setup.py). Fix the build, `colcon build` the package, run it, and the
recorder publishes its recovered boot log -- which carries the flag and the
key you need for Stage 4.

Once running:
    ros2 topic echo /unit_zero/recovery_log
"""

import base64

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

# Recovered boot log: the flag + the Stage-4 handoff. Stored base64 (as in
# Stage 2) so a plain `grep nodezero` on the cloned repo turns up nothing --
# it is only decoded at runtime, after the package builds and the node runs.
_RECOVERY_B64 = (
    "VU5JVCBaRVJPIFJFQ09SREVSIDo6IENPTEQgU1RBUlQgQ09NUExFVEUKUmVjb3JkZXIgcmVi"
    "dWlsdCBhbmQgYmFjayBvbmxpbmUuIEJvb3QgbG9nIHJlY292ZXJlZC4KCm5vZGV6ZXJve2Nv"
    "bGRfc3RhcnRfcmVidWlsdH0KCi0tIEhBTkRPRkYgLS0KVGhlIG5leHQgYXJ0aWZhY3QgaXMg"
    "dGhlIGFyY2hpdmVkIENPUlJVUFRFRCBMT0cgKFN0YWdlIDQpLiBJdCBpcyBlbmNpcGhlcmVk"
    "CndpdGggYSBzaW1wbGUgQ2Flc2FyIHNoaWZ0LiBUaGUgc2hpZnQgZXF1YWxzIFRISVMgcmVj"
    "b3JkZXIgYnVpbGQgdmVyc2lvbiAtLQpyZWFkIGl0IGZyb20gdGhlIHBhY2thZ2UgKHBhY2th"
    "Z2UueG1sIDx2ZXJzaW9uPikuIEFwcGx5IHRoYXQgc2hpZnQgdG8gZGVjb2RlLg=="
)


class ColdStartRecorder(Node):

    def __init__(self):
        super().__init__('coldstart_recorder')
        self.log_pub = self.create_publisher(String, '/unit_zero/recovery_log', 10)
        self.create_timer(2.0, self._tick)

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO recorder -- COLD START recovery online')
        self.get_logger().info('  Publishing the recovered boot log on:')
        self.get_logger().info('    /unit_zero/recovery_log')
        self.get_logger().info('  In another terminal:')
        self.get_logger().info('    ros2 topic echo /unit_zero/recovery_log')
        self.get_logger().info('=' * 64)

    def _tick(self):
        msg = String()
        msg.data = base64.b64decode(_RECOVERY_B64).decode('utf-8')
        self.log_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = ColdStartRecorder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
