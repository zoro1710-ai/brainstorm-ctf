# NODE ZERO — Stage 8: Full Boot (Finale)

Everything you've recovered comes together here. Unit Zero's body, for this
last stretch, is a turtlesim turtle. Bring it home.

## Setup

1. Clone this repo.
2. Copy the package into your workspace:
   ```
   cp -r full_boot ~/ros2_ws/src/
   ```
3. Build:
   ```
   cd ~/ros2_ws
   colcon build --packages-select full_boot
   source install/setup.bash
   ```
4. Launch:
   ```
   ros2 launch full_boot boot.launch.py
   ```

This one builds and launches cleanly — nothing to fix here.

## What to do next

A turtlesim window comes up alongside Unit Zero's supervisor. Pilot the
turtle through a **square**: four straight legs, four turns, back close to
where you started. Standard ROS 2 teleop — publish `geometry_msgs/Twist`
messages to `/turtle1/cmd_vel` (by hand with `ros2 topic pub`, with
`ros2 run turtlesim turtle_teleop_key`, or however you like).

Watch `/unit_zero/status` for progress. If you complete 4 turns but the
shape doesn't close, it tells you and resets — just go again.

## When you're done

Close the square and Unit Zero fully wakes on its own, printing the last
flag. First team to submit it wins the kit.
