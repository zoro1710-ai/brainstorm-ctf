# NODE ZERO — Stage 2: Sign of Life

You have Unit Zero's **wake word** from Stage 1. Time to actually connect to the
bot and speak it. Bring the handshake process up on your own machine and get the
unit to respond.

## Setup

1. Clone this repo.
2. Copy the package into your workspace:
   ```
   cp -r handshake ~/ros2_ws/src/
   ```
3. Build it (this one builds cleanly):
   ```
   cd ~/ros2_ws
   colcon build --packages-select handshake
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
again (`source ~/ros2_ws/install/setup.bash`), and explore with the training
commands:

- `ros2 topic list`
- `ros2 topic echo /unit_zero/status`
- `ros2 param list /handshake_node`

The unit is waiting for its wake word. Nodes can expose settings you change from
the command line without touching code. When you give it the right word from
Stage 1, it comes online and tells you two things: a flag, and where to find its
recorder source next.

## Hints

<details><summary>Hint 1</summary>
`ros2 topic echo /unit_zero/status` tells you exactly what the unit is waiting
for. The thing you set lives in the node's parameters.
</details>

<details><summary>Hint 2</summary>
`ros2 param list /handshake_node` shows a `wake_word` parameter. Set it with
`ros2 param set /handshake_node wake_word <the codeword from Stage 1>`.
</details>

<details><summary>Hint 3</summary>
The wake word is the second word of the ROS 2 distro codename you recovered in
Stage 1 — just the animal. After setting it, watch `ros2 topic echo
/unit_zero/response`.
</details>

## When you're done

The response gives you the flag **and** names the repo you'll clone for Stage 3.
Keep that name.
