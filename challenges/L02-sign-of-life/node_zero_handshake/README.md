# NODE ZERO — Stage 2: Sign of Life

You have Unit Zero's **wake word** from Stage 1. Time to actually connect to the
bot and speak it. Bring the handshake process up on your own machine and get the
unit to respond.

## Setup

1. Clone this repo.
2. Copy both packages into your workspace:
   ```
   cp -r handshake_interfaces handshake ~/ros2_ws/src/
   ```
3. Build them (this builds cleanly):
   ```
   cd ~/ros2_ws
   colcon build --packages-select handshake_interfaces handshake
   source install/setup.bash
   ```
4. Run it:
   ```
   ros2 run handshake handshake_node
   ```

If `colcon build` errors, that's an environment issue, not the puzzle — make sure
you sourced `/opt/ros/humble/setup.bash` first.

## What to do next

The node is up but **DORMANT**. Open a **second terminal**, source your workspace
again (`source ~/ros2_ws/install/setup.bash`), and explore it with the standard
ROS 2 command-line tools from the training. The unit is waiting to hear
something — find the right interface and speak to it with the word you
recovered in Stage 1.

Get it right and the response carries two things: a flag, and where to find its
recorder source next. Get it wrong and it tells you plainly: rejected, still
dormant.

Stuck? Use the challenge's paid hints on the platform rather than looking here —
this file intentionally won't spell out the interface or the answer.

## When you're done

The response gives you the flag **and** names the repo you'll clone for Stage 3.
Keep that name.
