#!/usr/bin/env python3
"""
NODE ZERO - Stage 2: "Sign of Life"

You recovered Unit Zero's WAKE WORD in Stage 1. This node is the bot's
handshake process: it boots DORMANT and will not respond until it hears
the correct wake word.

Nothing here needs code changes. Everything you need is exposed through
the normal ROS 2 command-line tools (topics + parameters) from the
training. Discover the interface, set the wake word, and the unit answers.
"""

import base64

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from rcl_interfaces.msg import SetParametersResult

# The wake word is the codename you recovered in Stage 1. It is NOT written
# here in the clear on purpose -- but the check is case-insensitive and
# tolerant so a correct Stage-1 answer always works.
WAKE_WORD = "hawksbill"

# Unit Zero's response once it is awake: the flag, plus where the recorder
# source (Stage 3) is archived. Stored encoded (not to obscure the mechanism --
# the whole node is readable -- but so the flag isn't a plain `grep nodezero`
# away in the cloned repo). It's only decoded at runtime, after a correct wake.
_RESPONSE_B64 = (
    "VU5JVCBaRVJPIE9OTElORS4gSGFuZHNoYWtlIGFjY2VwdGVkLgpub2RlemVyb3tmaXJzdF9z"
    "aWduX29mX2xpZmV9CnJlY29yZGVyIHNvdXJjZSBhcmNoaXZlZCBhdDogbm9kZV96ZXJvX2Nv"
    "bGRzdGFydC5naXQgQCB0YWcgY29sZC1zdGFydC12MQ=="
)


class HandshakeNode(Node):

    def __init__(self):
        super().__init__('handshake_node')

        # --- the parameter that gates everything ----------------------
        # Declare a string parameter 'wake_word', empty by default. Find it
        # with `ros2 param list`, set it with `ros2 param set`.
        self.declare_parameter('wake_word', '')
        self.add_on_set_parameters_callback(self._on_param_change)
        self._awake = False

        # --- topics ---------------------------------------------------
        # /unit_zero/status  -> always publishing; tells you what to do.
        # /unit_zero/response-> silent until the correct wake word is set,
        #                       then it carries the flag.
        self.status_pub = self.create_publisher(String, '/unit_zero/status', 10)
        self.response_pub = self.create_publisher(String, '/unit_zero/response', 10)
        self.create_timer(1.0, self._tick)

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO handshake process -- state: DORMANT')
        self.get_logger().info('  In another terminal, try:')
        self.get_logger().info('    ros2 topic list')
        self.get_logger().info('    ros2 topic echo /unit_zero/status')
        self.get_logger().info('  The unit is waiting for its wake word.')
        self.get_logger().info('  It exposes a setting -- find it with:')
        self.get_logger().info('    ros2 param list /handshake_node')
        self.get_logger().info('=' * 64)

    def _tick(self):
        status = String()
        if self._awake:
            status.data = 'ONLINE :: handshake complete. Listening on /unit_zero/response'
            self.status_pub.publish(status)
            resp = String()
            resp.data = base64.b64decode(_RESPONSE_B64).decode('utf-8')
            self.response_pub.publish(resp)
        else:
            status.data = 'DORMANT :: awaiting wake word. Set it and I will respond.'
            self.status_pub.publish(status)

    def _on_param_change(self, params):
        for p in params:
            if p.name == 'wake_word':
                word = str(p.value).strip().lower()
                if word == WAKE_WORD:
                    if not self._awake:
                        self._awake = True
                        self.get_logger().info(
                            'Wake word ACCEPTED. Unit Zero is coming online...'
                        )
                elif word:  # non-empty but wrong
                    self.get_logger().warn(
                        f"Wake word '{p.value}' REJECTED. Unit stays dormant."
                    )
        return SetParametersResult(successful=True)


def main(args=None):
    rclpy.init(args=args)
    node = HandshakeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
