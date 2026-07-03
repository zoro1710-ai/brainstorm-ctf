#!/usr/bin/env python3
"""
NODE ZERO - Stage 8 (finale): beacon.

Publishes a small "ready" signal the supervisor waits on before it will
accept a wake attempt. Nothing here needs code changes -- the durability
this publishes with is set by the launch file, not this file.
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from std_msgs.msg import Bool


class BeaconNode(Node):

    def __init__(self):
        super().__init__('beacon_node')

        self.declare_parameter('durability', 'transient_local')
        durability_str = self.get_parameter('durability').value
        durability = (
            DurabilityPolicy.TRANSIENT_LOCAL
            if durability_str == 'transient_local'
            else DurabilityPolicy.VOLATILE
        )
        qos = QoSProfile(
            depth=1,
            reliability=ReliabilityPolicy.RELIABLE,
            durability=durability,
        )
        self.pub = self.create_publisher(Bool, '/unit_zero/beacon_ready', qos)
        self.create_timer(1.0, self._tick)
        self.get_logger().info(f'Beacon up, durability={durability_str}')

    def _tick(self):
        msg = Bool()
        msg.data = True
        self.pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = BeaconNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
