#!/usr/bin/env python3
"""
NODE ZERO - Stage 6: "Wake Sequence"

Unit Zero's wake sequence is an action server, not a plain service -- speak
the code from Stage 5 as a goal and it either wakes (flag in the result) or
rejects you. One call, once the action is actually reachable.

Nothing here needs code changes. The bug (if any) is in how this node gets
launched, not in this file.
"""

import base64

import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.node import Node
from wake_sequence_interfaces.action import WakeSequence

# The code is the tail of the Stage 5 flag. Not written here in the clear --
# the check is case-insensitive and whitespace-tolerant.
CODE = "flight"

# Result once the code is accepted: the flag, plus where Unit Zero's final
# diagnostic lives. Stored encoded so it isn't a plain `grep nodezero` away
# in the cloned repo -- only decoded at runtime, after a correct goal.
_RESULT_B64 = (
    "VU5JVCBaRVJPIFdBS0UgU0VRVUVOQ0UgT05MSU5FLgpub2RlemVyb3t3YWtlX3NlcXVlbmNl"
    "X29ubGluZX0KbmV4dDogZGlhZ25vc3RpY19iZWVwLndhdiBhd2FpdHMu"
)


class WakeSequenceServer(Node):

    def __init__(self):
        super().__init__('wake_node')

        # The name this action server actually registers under. Correct
        # default here is '/unit_zero/wake_sequence' -- if you launch this
        # node with an override and the action doesn't show up where you
        # expect, that override is the thing to check.
        self.declare_parameter('action_name', '/unit_zero/wake_sequence')
        action_name = self.get_parameter('action_name').value

        self._server = ActionServer(
            self,
            WakeSequence,
            action_name,
            execute_callback=self._execute,
            goal_callback=self._on_goal,
            cancel_callback=self._on_cancel,
        )

        self.get_logger().info('=' * 64)
        self.get_logger().info('  UNIT ZERO wake sequence -- action server up')
        self.get_logger().info(f'  Listening for goals on: {action_name}')
        self.get_logger().info('=' * 64)

    def _on_goal(self, goal_request):
        return GoalResponse.ACCEPT

    def _on_cancel(self, goal_handle):
        return CancelResponse.ACCEPT

    def _execute(self, goal_handle):
        feedback = WakeSequence.Feedback()
        feedback.status = 'verifying code...'
        goal_handle.publish_feedback(feedback)

        word = goal_handle.request.code.strip().lower()
        result = WakeSequence.Result()
        if word == CODE:
            result.success = True
            result.message = base64.b64decode(_RESULT_B64).decode('utf-8')
            goal_handle.succeed()
        else:
            result.success = False
            result.message = 'REJECTED :: wrong code. Unit stays dormant.'
            goal_handle.abort()
        return result


def main(args=None):
    rclpy.init(args=args)
    node = WakeSequenceServer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
