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
again (`source ~/ros2_ws/install/setup.bash`), and explore with the training
commands:

- `ros2 service list`
- `ros2 service type /unit_zero/wake`

The unit is waiting for its wake word — and it only takes one command to speak
to it. Call the service with the word from Stage 1 and the response comes back
immediately, in the same terminal:

```
ros2 service call /unit_zero/wake handshake_interfaces/srv/Wake "{word: 'hawksbill'}"
```

Get it right and the response carries two things: a flag, and where to find its
recorder source next. Get it wrong and it tells you plainly: rejected, still
dormant.

## Hints

<details><summary>Hint 1</summary>
`ros2 service list` shows a `/unit_zero/wake` service. `ros2 service type
/unit_zero/wake` tells you its interface: `handshake_interfaces/srv/Wake`.
</details>

<details><summary>Hint 2</summary>
Call it directly — no parameters involved:
`ros2 service call /unit_zero/wake handshake_interfaces/srv/Wake "{word: '<the codeword from Stage 1>'}"`.
</details>

<details><summary>Hint 3</summary>
The wake word is the second word of the ROS 2 distro codename you recovered in
Stage 1 — just the animal. The service response carries the flag directly.
</details>

## When you're done

The response gives you the flag **and** names the repo you'll clone for Stage 3.
Keep that name.
