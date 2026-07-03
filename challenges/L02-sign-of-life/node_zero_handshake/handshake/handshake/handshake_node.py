#!/usr/bin/env python3
"""
NODE ZERO - Stage 2: "Sign of Life"

You recovered Unit Zero's WAKE WORD in Stage 1. This node is the bot's
handshake process: it boots DORMANT and answers exactly one ROS 2 service --
call it with the wake word and the unit either wakes (with the flag, in the
same response) or rejects you on the spot.

Nothing here needs code changes. Discover the service with the normal ROS 2
command-line tools and call it with the word from Stage 1.
"""

import base64

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from handshake_interfaces.srv import Wake

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
        self._awake = False

        # --- topic ------------------------------------------------------
        # /unit_zero/status -> always publishing; tells you what to do.
        self.status_pub = self.create_publisher(String, '/unit_zero/status', 10)
        self.create_timer(1.0, self._tick)

        # --- the service that gates everything ---------------------------
        # One call, one response: send the wake word, get the verdict (and,
        # if correct, the flag) back immediately -- no parameters involved.
        self.wake_srv = self.create_service(Wake, '/unit_zero/wake', self._on_wake)

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO handshake process -- state: DORMANT')
        self.get_logger().info('  In another terminal, try:')
        self.get_logger().info('    ros2 service list')
        self.get_logger().info('    ros2 service type /unit_zero/wake')
        self.get_logger().info('  Then call it with the wake word:')
        self.get_logger().info(
            "    ros2 service call /unit_zero/wake handshake_interfaces/srv/Wake "
            "\"{word: '<wake word>'}\""
        )
        self.get_logger().info('=' * 64)

    def _tick(self):
        status = String()
        status.data = (
            'ONLINE :: handshake complete.'
            if self._awake
            else 'DORMANT :: awaiting wake word via the /unit_zero/wake service.'
        )
        self.status_pub.publish(status)

    def _on_wake(self, request, response):
        word = request.word.strip().lower()
        if word == WAKE_WORD:
            if not self._awake:
                self._awake = True
                self.get_logger().info(
                    'Wake word ACCEPTED. Unit Zero is coming online...'
                )
            response.success = True
            response.message = base64.b64decode(_RESPONSE_B64).decode('utf-8')
        else:
            self.get_logger().warn(
                f"Wake word '{request.word}' REJECTED. Unit stays dormant."
            )
            response.success = False
            response.message = 'REJECTED :: wrong wake word. Unit stays dormant.'
        return response


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
